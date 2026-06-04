/**
 * Step 7N: EmapSDK 全域掃描策略研究 PoC
 * 目的：測試 EmapSDK 各種 payload，評估是否能補足 twcoupon 缺口
 * 執行：node scripts/research-seven-emap-coverage.mjs
 * 不寫入大量 DB，只 dry-run + report
 */
import fs from "fs";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool();

const DELAY_MS = 1300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outPath = "data/cvs/seven-emap-coverage-research-step7n.json";

// ── XML 解析 ────────────────────────────────────────────────────────────────
function parseGeo(xml) {
  const results = [];
  const re = /<GeoPosition>([\s\S]*?)<\/GeoPosition>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const g = (tag) => { const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"); const t = r.exec(b); return t ? t[1].trim() : null; };
    const xRaw = g("X"), yRaw = g("Y");
    const lat = (xRaw && yRaw) ? (parseInt(yRaw) / 1_000_000).toFixed(7) : null;
    const lng = (xRaw && yRaw) ? (parseInt(xRaw) / 1_000_000).toFixed(7) : null;
    const addr = g("Address") || "";
    const cm = addr.match(/^(.{2,4}?[市縣])/);
    const dm = addr.match(/[市縣](.{2,4}?[區鄉鎮市])/);
    results.push({
      poiId: g("POIID"),
      name: g("POIName"),
      address: addr,
      tel: g("Telno"),
      opTime: g("OP_TIME") || g("OpenTime"),
      lat, lng,
      city: cm ? cm[1] : null,
      district: dm ? dm[1] : null,
    });
  }
  return results;
}

function getStatus(xml) {
  const m = xml.match(/<Status>([^<]+)<\/Status>/i);
  return m ? m[1].trim() : "(no status)";
}

// ── EmapSDK 呼叫（支援任意 payload）───────────────────────────────────────
async function callEmap(payload, label) {
  const body = new URLSearchParams({ commandid: "SearchStore", ...payload });
  try {
    const resp = await fetch("https://emap.pcsc.com.tw/EmapSDK.aspx", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { label, payload, error: `HTTP ${resp.status}`, results: [], status: null };
    const xml = await resp.text();
    const results = parseGeo(xml);
    const status = getStatus(xml);
    return { label, payload, results, status, rawLen: xml.length };
  } catch (e) {
    return { label, payload, error: e.message, results: [], status: null };
  }
}

// ── DB 查詢：取得某區已存在的 store_id 集合 ────────────────────────────────
async function getDbIds(city, district) {
  const r = await pool.query(
    "SELECT store_id FROM cvs_stores WHERE provider='seven' AND is_active=true AND city=$1 AND district=$2",
    [city, district]
  );
  return new Set(r.rows.map(x => x.store_id));
}

async function getDbTotal() {
  const r = await pool.query("SELECT count(*) FROM cvs_stores WHERE provider='seven' AND is_active=true");
  return parseInt(r.rows[0].count);
}

// ── 測試區域定義 ────────────────────────────────────────────────────────────
const REGIONS = [
  { name: "連江縣南竿鄉", city: "連江縣", district: "南竿鄉", keywords: ["南竿", "連江", "馬祖"] },
  { name: "宜蘭縣羅東鎮", city: "宜蘭縣", district: "羅東鎮", keywords: ["羅東", "宜蘭羅東"] },
  { name: "新北市板橋區", city: "新北市", district: "板橋區", keywords: ["板橋", "新北板橋"] },
  { name: "台南市新市區", city: "台南市", district: "新市區", keywords: ["新市", "台南新市"] },
];

// ── Payload 策略定義 ────────────────────────────────────────────────────────
function buildPayloads(region) {
  return [
    // 現有方法
    { label: "StoreName=短名",       payload: { StoreName: region.keywords[0] } },
    { label: "StoreName=縣市+區名",  payload: { StoreName: region.keywords[1] || region.keywords[0] } },
    // 地址類
    { label: "address=縣市+行政區",  payload: { address: `${region.city}${region.district.slice(0,2)}` } },
    { label: "address=縣市全稱",     payload: { address: region.city } },
    // city/town 分離
    { label: "city=縣市",            payload: { city: region.city } },
    { label: "city+town=縣市+區",    payload: { city: region.city, town: region.district } },
    { label: "city+town=縣市+區短",  payload: { city: region.city, town: region.district.slice(0, -1) } },
    // roadname
    { label: "roadname=行政區",      payload: { roadname: region.district } },
    // leftMenuChecked
    { label: "leftMenuChecked=1",    payload: { StoreName: region.keywords[0], leftMenuChecked: "1" } },
    // SpecialStore_Kind
    { label: "SpecialStore_Kind=空", payload: { StoreName: region.keywords[0], SpecialStore_Kind: "" } },
    // ID 欄位（測已知 POIID — 使用板橋知名門市懷民 poiId）
    ...(region.district === "板橋區" ? [
      { label: "ID=已知POIID(懷民)",  payload: { ID: "278335" } },
      { label: "POIID=已知POIID",     payload: { POIID: "278335" } },
    ] : []),
  ];
}

// ── 主程式 ──────────────────────────────────────────────────────────────────
console.log("Step 7N — EmapSDK 全域掃描策略研究 PoC");
console.log("========================================\n");

const dbTotal = await getDbTotal();
console.log(`DB 現有 7-11 總數：${dbTotal}\n`);

const report = {
  runAt: new Date().toISOString(),
  dbTotalBefore: dbTotal,
  regions: [],
  strategySummary: {},
};

for (const region of REGIONS) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`[${region.name}]`);
  console.log(`${"═".repeat(60)}`);

  const dbIds = await getDbIds(region.city, region.district);
  console.log(`  DB 既有：${dbIds.size} 筆`);

  const regionReport = {
    region: region.name,
    city: region.city,
    district: region.district,
    dbExisting: dbIds.size,
    tests: [],
  };

  const payloads = buildPayloads(region);

  for (const { label, payload } of payloads) {
    await sleep(DELAY_MS);
    const res = await callEmap(payload, label);
    const n = res.results.length;
    const inDb = res.results.filter(r => r.poiId && dbIds.has(r.poiId)).length;
    const newOnes = res.results.filter(r => r.poiId && !dbIds.has(r.poiId));
    const newCount = newOnes.length;

    // 跨區偵測：結果中不屬於本區的
    const crossRegion = res.results.filter(r => r.city && r.city !== region.city).length;

    const top5 = res.results.slice(0, 5).map(r => ({
      poiId: r.poiId,
      name: r.name,
      address: r.address,
      inDb: r.poiId ? dbIds.has(r.poiId) : null,
    }));

    const testResult = {
      label,
      payload: Object.fromEntries(Object.entries(payload)),
      status: res.status,
      total: n,
      inDb,
      newCount,
      crossRegion,
      hasLimit: n === 50 || n === 100,  // 疑似上限
      error: res.error || null,
      top5,
    };

    regionReport.tests.push(testResult);

    const errStr = res.error ? ` ❌ ${res.error}` : "";
    const limitStr = testResult.hasLimit ? " ⚠️ 疑似上限" : "";
    console.log(`  [${label}] → ${n} 筆（DB已有=${inDb}, 新=${newCount}, 跨區=${crossRegion}）${limitStr}${errStr}`);
    if (n > 0 && n <= 5) {
      res.results.forEach(r => console.log(`    • ${r.poiId} ${r.name} ${r.address}`));
    }
  }

  report.regions.push(regionReport);
}

// ── 策略摘要分析 ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log("策略摘要分析");
console.log(`${"═".repeat(60)}`);

const strategyMap = {};
for (const region of report.regions) {
  for (const t of region.tests) {
    if (!strategyMap[t.label]) strategyMap[t.label] = { totalResults: 0, totalNew: 0, count: 0, hasCross: 0, hasLimit: 0, errors: 0 };
    const s = strategyMap[t.label];
    s.count++;
    s.totalResults += t.total;
    s.totalNew += t.newCount;
    if (t.crossRegion > 0) s.hasCross++;
    if (t.hasLimit) s.hasLimit++;
    if (t.error) s.errors++;
  }
}

const strategyRows = Object.entries(strategyMap)
  .map(([label, s]) => ({
    label,
    avgResults: (s.totalResults / s.count).toFixed(1),
    avgNew: (s.totalNew / s.count).toFixed(1),
    crossRegions: s.hasCross,
    hitLimit: s.hasLimit,
    errors: s.errors,
    score: s.totalNew,  // 越高越好
  }))
  .sort((a, b) => b.score - a.score);

console.log("\n按「新門市發現量」排名：");
strategyRows.forEach(r => {
  const flags = [
    r.hitLimit > 0 ? "⚠️上限" : "",
    r.crossRegions > 0 ? "⚠️跨區" : "",
    r.errors > 0 ? "❌錯誤" : "",
  ].filter(Boolean).join(" ");
  console.log(`  ${r.label.padEnd(22)} avg結果=${r.avgResults.padStart(5)}  avg新=${r.avgNew.padStart(5)}  ${flags}`);
});

report.strategySummary = strategyRows;

// ── 估算全台潛在補足量 ────────────────────────────────────────────────────────
// 以最佳策略的 avg new/region 乘以全台 368 行政區
const bestStrategy = strategyRows[0];
if (bestStrategy) {
  const estimated = Math.round(parseFloat(bestStrategy.avgNew) * 368);
  console.log(`\n估算（最佳策略「${bestStrategy.label}」× 368 行政區）：約可新增 ${estimated} 筆`);
  report.estimatedNewStores = {
    strategy: bestStrategy.label,
    avgNewPerDistrict: parseFloat(bestStrategy.avgNew),
    estimated368Districts: estimated,
  };
}

// ── 存檔 ────────────────────────────────────────────────────────────────────
fs.mkdirSync("data/cvs", { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\n已寫入：${outPath}`);
console.log("\n本次為 dry-run，未寫入任何 DB 資料。");

await pool.end();
