/**
 * Step 7E/7F/7H: twcoupon 7-11 門市清單抓取 + EmapSDK 官方驗證
 *
 * 此工具只用於門市資料登記，不建立正式物流單，不串 ECPay。
 *
 * 單縣市模式（Step 7E/7F）：
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs \
 *     --url "https://twcoupon.com/brandshopcity-7_11-宜蘭縣-..." \
 *     --delay 1200 --verify-emap
 *
 * 全台批次模式（Step 7H）：
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs --all-cities --dry-run --list-cities
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs --all-cities --only-cities 台東縣 --delay 1200
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs --all-cities --limit-cities 3 --delay 1200
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs --all-cities --resume --delay 1200
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs --all-cities --skip-cities 台北市,新北市 --delay 1200
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? (args[i + 1] ?? null) : null; }
function hasFlag(flag) { return args.includes(flag); }

// Single-city flags
const urlArg = getArg("--url") ?? "https://twcoupon.com/brandshopcity-7_11-%e9%80%a3%e6%b1%9f%e7%b8%a3-%e9%9b%bb%e8%a9%b1-%e5%9c%b0%e5%9d%80.html";
const limitRaw = getArg("--limit");
const limit = limitRaw != null ? parseInt(limitRaw, 10) : Infinity;

// Shared flags
const delayMs = parseInt(getArg("--delay") ?? "1200", 10);
const dryRun = hasFlag("--dry-run");
const verifyEmap = !hasFlag("--no-verify-emap");
const noSubPages = hasFlag("--no-sub-pages");

// All-cities flags (Step 7H)
const allCitiesMode = hasFlag("--all-cities");
const listCities = hasFlag("--list-cities");
const resumeMode = hasFlag("--resume");
const limitCities = getArg("--limit-cities") != null ? parseInt(getArg("--limit-cities"), 10) : Infinity;
const skipCitiesArg = getArg("--skip-cities");
const onlyCitiesArg = getArg("--only-cities");
const skipCities = skipCitiesArg ? skipCitiesArg.split(",").map(s => s.trim()) : [];
const onlyCities = onlyCitiesArg ? onlyCitiesArg.split(",").map(s => s.trim()) : [];

const TWCOUPON_BASE = "https://twcoupon.com";
const MAIN_PAGE_URL = "https://twcoupon.com/brandshop-7_11-%E9%9B%BB%E8%A9%B1-%E5%9C%B0%E5%9D%80.html";

// Progress / report file paths (next to script, ignored by git)
const ALL_CITIES_PROGRESS_FILE = path.join(__dir, "twcoupon-emap-all-cities-progress.json");
const ALL_CITIES_REPORT_FILE = path.join(__dir, "twcoupon-emap-all-cities-report.json");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = dryRun ? null : new Pool({ connectionString: process.env.DATABASE_URL });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "zh-TW,zh;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return resp.text();
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function isMainPageUrl(url) {
  return url.includes("brandshop-7_11-") && !url.includes("brandshopcity") && !url.includes("brandshoparea");
}
function isCityPageUrl(url) { return url.includes("brandshopcity-"); }

function extractCityNameFromUrl(url) {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/brandshopcity-7_11-(.+?)-電話-地址/);
  return m ? m[1] : decoded;
}

// ── twcoupon parsing ──────────────────────────────────────────────────────────
function extractCityLinksFromMain(html) {
  const links = [];
  const re = /href="(brandshopcity-7_11-[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = TWCOUPON_BASE + "/" + m[1];
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

function extractAreaLinksFromCityPage(html) {
  const links = [];
  const re = /href="(brandshoparea-7_11-[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = TWCOUPON_BASE + "/" + m[1];
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

function parseStoresFromHtml(html, sourceUrl) {
  const stores = [];
  const blockRe = /<li\s+class="name">([^<]+)<\/li>\s*<li><em>地址：<\/em>([^<]+)<\/li>\s*<li><em>電話：<\/em>([^<]*)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    stores.push({ storeName: m[1].trim(), storeAddress: m[2].trim(), storePhone: m[3].trim() || null, sourceUrl });
  }
  return stores;
}

function deduplicateStores(stores) {
  const seen = new Map();
  for (const s of stores) {
    const key = s.storeName + "|" + s.storeAddress;
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()];
}

// ── keyword / EmapSDK ─────────────────────────────────────────────────────────
function toEmapKeyword(storeName) {
  return storeName.replace(/7-11/g, "").replace(/7\s*ELEVEN/gi, "").replace(/門市$/g, "").trim();
}

function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseEmapCandidates(xml) {
  const results = [];
  const re = /<GeoPosition>([\s\S]*?)<\/GeoPosition>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const geo = m[1];
    const poiId = getTag(geo, "POIID");
    if (!poiId) continue;
    const poiName = getTag(geo, "POIName");
    const address = getTag(geo, "Address");
    const telno = getTag(geo, "Telno");
    const opTime = getTag(geo, "OP_TIME");
    const xRaw = parseFloat(getTag(geo, "X"));
    const yRaw = parseFloat(getTag(geo, "Y"));
    let latitude = null, longitude = null;
    if (!isNaN(xRaw) && !isNaN(yRaw) && xRaw > 0 && yRaw > 0) {
      longitude = (xRaw / 1_000_000).toFixed(7);
      latitude = (yRaw / 1_000_000).toFixed(7);
    }
    let city = null, district = null;
    if (address) {
      const cm = address.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
      const dm = address.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
    }
    const storeName = poiName.endsWith("門市") ? poiName : `${poiName}門市`;
    results.push({ poiId, storeName, storeAddress: address, storePhone: telno || null, businessHours: opTime || null, latitude, longitude, city, district });
  }
  return results;
}

async function queryEmap(keyword) {
  const body = new URLSearchParams({ commandid: "SearchStore", StoreName: keyword });
  const resp = await fetch("https://emap.pcsc.com.tw/EmapSDK.aspx", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`EmapSDK HTTP ${resp.status}`);
  return resp.text();
}

function addressSimilarity(a, b) {
  if (!a || !b) return 0;
  let score = 0;
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= a.length - len; i++) {
      if (b.includes(a.slice(i, i + len))) score += len;
    }
  }
  return score;
}

// ── DB ────────────────────────────────────────────────────────────────────────
function stableHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 12);
}

async function upsertStore(row) {
  const result = await pool.query(
    `INSERT INTO cvs_stores
       (provider, store_id, store_name, store_address, store_phone, city, district,
        business_hours, latitude, longitude, is_active, source, source_updated_at)
     VALUES ('seven', $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, now())
     ON CONFLICT (provider, store_id) DO UPDATE SET
       store_name = EXCLUDED.store_name, store_address = EXCLUDED.store_address,
       store_phone = EXCLUDED.store_phone, city = EXCLUDED.city, district = EXCLUDED.district,
       business_hours = EXCLUDED.business_hours, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, source = EXCLUDED.source,
       source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [row.storeId, row.storeName, row.storeAddress, row.storePhone,
     row.city, row.district, row.businessHours, row.latitude, row.longitude, row.source]
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

async function getTotalStoreCount() {
  const r = await pool.query("SELECT COUNT(*) FROM cvs_stores WHERE provider = 'seven' AND is_active = true");
  return parseInt(r.rows[0].count, 10);
}

function makeVerifiedRow(c) {
  return {
    storeId: c.poiId, storeName: c.storeName, storeAddress: c.storeAddress,
    storePhone: c.storePhone, businessHours: c.businessHours,
    latitude: c.latitude, longitude: c.longitude, city: c.city, district: c.district,
    source: "twcoupon_emap_verified",
  };
}

function makeUnverifiedRow(tw) {
  let city = null, district = null;
  if (tw.storeAddress) {
    const cm = tw.storeAddress.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
    const dm = tw.storeAddress.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
  }
  return {
    storeId: "twcoupon-" + stableHash(tw.storeName + tw.storeAddress),
    storeName: tw.storeName, storeAddress: tw.storeAddress,
    storePhone: tw.storePhone, businessHours: null,
    latitude: null, longitude: null, city, district,
    source: "twcoupon_unverified",
  };
}

// ── store collection ──────────────────────────────────────────────────────────
async function collectStoresFromCityPage(cityUrl) {
  console.log(`  抓取城市頁：${decodeURIComponent(cityUrl)}`);
  const cityHtml = await fetchHtml(cityUrl);
  const inlineStores = parseStoresFromHtml(cityHtml, cityUrl);
  console.log(`    city inline：${inlineStores.length} 筆`);

  let allStores = [...inlineStores];
  let areaPageCount = 0;

  if (!noSubPages) {
    const areaLinks = extractAreaLinksFromCityPage(cityHtml);
    areaPageCount = areaLinks.length;
    console.log(`    brandshoparea 子分頁：${areaLinks.length} 個`);
    for (const areaUrl of areaLinks) {
      await sleep(delayMs);
      try {
        const areaHtml = await fetchHtml(areaUrl);
        const areaStores = parseStoresFromHtml(areaHtml, areaUrl);
        const areaName = decodeURIComponent(areaUrl.split("brandshoparea-7_11-")[1]?.split("-電話")[0] ?? areaUrl);
        console.log(`    [area] ${areaName}：${areaStores.length} 筆`);
        allStores.push(...areaStores);
      } catch (err) {
        console.log(`    [area] 失敗 ${decodeURIComponent(areaUrl)}：${err.message}`);
      }
    }
  }

  const raw = allStores.length;
  const deduped = deduplicateStores(allStores);
  console.log(`    合併後（dedup）：${deduped.length} 筆（raw=${raw}）`);
  return { stores: deduped, cityInlineCount: inlineStores.length, areaPageCount, rawCount: raw, dedupedCount: deduped.length };
}

// ── verify + upsert loop ──────────────────────────────────────────────────────
async function verifyAndUpsert(stores, cityName) {
  const stats = {
    emapVerified: 0, emapUnverified: 0, emapMultiCandidates: 0, emapFailed: 0,
    inserted: 0, updated: 0, dbFailed: 0,
    unverifiedList: [], multipleCandidatesList: [], failedList: [],
  };

  const total = stores.length;
  for (let i = 0; i < total; i++) {
    const tw = stores[i];
    const keyword = toEmapKeyword(tw.storeName);
    process.stdout.write(`  [${i + 1}/${total}] 「${tw.storeName}」(kw:${keyword}) ... `);

    let dbRow = null;

    if (verifyEmap && !dryRun) {
      try {
        if (i > 0) await sleep(delayMs);
        const xml = await queryEmap(keyword);
        const candidates = parseEmapCandidates(xml);
        if (candidates.length === 0) {
          stats.emapUnverified++;
          stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
          dbRow = makeUnverifiedRow(tw);
          process.stdout.write(`unverified`);
        } else if (candidates.length === 1) {
          stats.emapVerified++;
          dbRow = makeVerifiedRow(candidates[0]);
          process.stdout.write(`verified (${candidates[0].poiId})`);
        } else {
          let best = candidates[0];
          let bestScore = addressSimilarity(tw.storeAddress, candidates[0].storeAddress);
          for (const c of candidates.slice(1)) {
            const s = addressSimilarity(tw.storeAddress, c.storeAddress);
            if (s > bestScore) { best = c; bestScore = s; }
          }
          stats.emapVerified++;
          stats.emapMultiCandidates++;
          stats.multipleCandidatesList.push({
            storeName: tw.storeName, keyword,
            candidates: candidates.map(c => `${c.poiId} ${c.storeName} ${c.storeAddress}`),
            chosen: best.poiId,
          });
          dbRow = makeVerifiedRow(best);
          process.stdout.write(`verified(${candidates.length}cand,${best.poiId})`);
        }
      } catch (err) {
        stats.emapFailed++;
        stats.failedList.push({ storeName: tw.storeName, error: err.message });
        dbRow = makeUnverifiedRow(tw);
        stats.emapUnverified++;
        stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
        process.stdout.write(`emap_err(${err.message})`);
      }
    } else if (dryRun) {
      process.stdout.write(`[DRY-RUN]`);
    } else {
      stats.emapUnverified++;
      stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
      dbRow = makeUnverifiedRow(tw);
      process.stdout.write(`unverified`);
    }

    if (!dryRun && dbRow) {
      try {
        const action = await upsertStore(dbRow);
        if (action === "inserted") stats.inserted++;
        else stats.updated++;
        process.stdout.write(` → ${action}\n`);
      } catch (err) {
        stats.dbFailed++;
        process.stdout.write(` → DB_err(${err.message})\n`);
      }
    } else {
      process.stdout.write("\n");
    }
  }

  return stats;
}

// ── per-city summary ──────────────────────────────────────────────────────────
function printCityStats(cityName, collResult, verResult, dbTotal) {
  console.log(`\n  ── ${cityName} 統計 ─────────────────────────────────`);
  console.log(`  twcoupon：${collResult.dedupedCount} 筆（raw=${collResult.rawCount}）`);
  console.log(`  verified：${verResult.emapVerified}　unverified：${verResult.emapUnverified}　multi-cand：${verResult.emapMultiCandidates}　emap失敗：${verResult.emapFailed}`);
  console.log(`  DB 新增：${verResult.inserted}　更新：${verResult.updated}　失敗：${verResult.dbFailed}`);
  if (dbTotal > 0) console.log(`  DB 7-11 總數：${dbTotal}`);

  if (verResult.unverifiedList.length > 0) {
    console.log(`  [unverified]`);
    verResult.unverifiedList.forEach(s => console.log(`    - ${s.storeName}（kw:${s.keyword}）`));
  }
  if (verResult.multipleCandidatesList.length > 0) {
    console.log(`  [multi-cand]`);
    verResult.multipleCandidatesList.forEach(s =>
      console.log(`    - ${s.storeName} → chose ${s.chosen}`)
    );
  }
}

// ── progress / report I/O ─────────────────────────────────────────────────────
function loadProgress() {
  if (!fs.existsSync(ALL_CITIES_PROGRESS_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(ALL_CITIES_PROGRESS_FILE, "utf-8")); } catch { return null; }
}

function saveProgress(progress) {
  fs.writeFileSync(ALL_CITIES_PROGRESS_FILE, JSON.stringify({ ...progress, lastUpdatedAt: new Date().toISOString() }, null, 2));
}

function saveReport(report) {
  fs.writeFileSync(ALL_CITIES_REPORT_FILE, JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2));
}

// ── ALL-CITIES MODE ───────────────────────────────────────────────────────────
async function runAllCities() {
  console.log("🗺  全台批次模式（--all-cities）");
  console.log("此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n");

  // 1. Fetch main page to get city list
  console.log("正在抓取主頁縣市清單...");
  const mainHtml = await fetchHtml(MAIN_PAGE_URL);
  let cityUrls = extractCityLinksFromMain(mainHtml);
  console.log(`發現 ${cityUrls.length} 個縣市頁`);

  // 3. Apply filters (before list-cities so resume/skip are reflected)
  if (onlyCities.length > 0) {
    cityUrls = cityUrls.filter(u => onlyCities.includes(extractCityNameFromUrl(u)));
    if (!listCities) console.log(`--only-cities：篩選後 ${cityUrls.length} 個縣市（${onlyCities.join(",")}）`);
  }
  if (skipCities.length > 0) {
    const before = cityUrls.length;
    cityUrls = cityUrls.filter(u => !skipCities.includes(extractCityNameFromUrl(u)));
    if (!listCities) console.log(`--skip-cities：略過 ${before - cityUrls.length} 個，剩 ${cityUrls.length} 個`);
  }

  // 4. --resume: skip completed cities
  let progress = loadProgress();
  if (resumeMode && progress) {
    const completed = new Set(progress.completedCities ?? []);
    const before = cityUrls.length;
    cityUrls = cityUrls.filter(u => !completed.has(extractCityNameFromUrl(u)));
    if (!listCities) console.log(`--resume：已完成 ${completed.size} 個，略過後剩 ${cityUrls.length} 個`);
  } else if (!resumeMode) {
    progress = null; // fresh start
  }

  // 5. --limit-cities
  if (limitCities < Infinity) {
    cityUrls = cityUrls.slice(0, limitCities);
    if (!listCities) console.log(`--limit-cities ${limitCities}：本次處理 ${cityUrls.length} 個`);
  }

  // 2. --list-cities: print filtered list and exit
  if (listCities) {
    const label = resumeMode ? "待處理縣市清單（--resume）" : "縣市清單";
    console.log(`\n── ${label} ──────────────────────────────────────────`);
    cityUrls.forEach((url, i) => {
      const name = extractCityNameFromUrl(url);
      console.log(`  ${String(i + 1).padStart(2)}. ${name}  ${decodeURIComponent(url)}`);
    });
    console.log(`\n共 ${cityUrls.length} 個縣市`);
    if (dryRun) console.log("[DRY-RUN] 不會匯入資料");
    if (pool) await pool.end();
    return;
  }

  if (cityUrls.length === 0) {
    console.log("沒有需要處理的縣市，結束。");
    if (pool) await pool.end();
    return;
  }

  console.log(`\n本次處理：${cityUrls.length} 個縣市`);
  console.log(`delay：${delayMs}ms　EmapSDK：${verifyEmap ? "開啟" : "關閉"}　sub-pages：${noSubPages ? "關閉" : "開啟"}`);
  if (dryRun) console.log("[DRY-RUN] 不會寫入 DB");
  console.log("");

  // 6. Init accumulators
  const globalStats = {
    totalCities: cityUrls.length,
    processedCities: 0,
    totalStoresParsed: 0,
    totalVerified: 0,
    totalUnverified: 0,
    totalMultipleCandidates: 0,
    totalEmapFailed: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalDbFailed: 0,
    cityReports: [],
  };
  const completedCities = progress?.completedCities ? [...progress.completedCities] : [];
  const failedCities = progress?.failedCities ? [...progress.failedCities] : [];

  // 7. Process each city
  for (let ci = 0; ci < cityUrls.length; ci++) {
    const cityUrl = cityUrls[ci];
    const cityName = extractCityNameFromUrl(cityUrl);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`[${ci + 1}/${cityUrls.length}] ${cityName}`);
    console.log("═".repeat(60));

    // Save progress before starting this city
    saveProgress({ processedCities: ci, currentCity: cityName, completedCities, failedCities });

    try {
      const collResult = await collectStoresFromCityPage(cityUrl);
      const storesToProcess = limit < Infinity ? collResult.stores.slice(0, limit) : collResult.stores;
      const verResult = await verifyAndUpsert(storesToProcess, cityName);
      const dbTotal = (!dryRun && pool) ? await getTotalStoreCount() : 0;

      printCityStats(cityName, collResult, verResult, dbTotal);

      // Accumulate
      globalStats.processedCities++;
      globalStats.totalStoresParsed += collResult.dedupedCount;
      globalStats.totalVerified += verResult.emapVerified;
      globalStats.totalUnverified += verResult.emapUnverified;
      globalStats.totalMultipleCandidates += verResult.emapMultiCandidates;
      globalStats.totalEmapFailed += verResult.emapFailed;
      globalStats.totalInserted += verResult.inserted;
      globalStats.totalUpdated += verResult.updated;
      globalStats.totalDbFailed += verResult.dbFailed;

      globalStats.cityReports.push({
        cityName, url: cityUrl,
        cityInlineCount: collResult.cityInlineCount,
        areaPageCount: collResult.areaPageCount,
        rawCount: collResult.rawCount,
        dedupedCount: collResult.dedupedCount,
        verifiedCount: verResult.emapVerified,
        unverifiedCount: verResult.emapUnverified,
        multipleCandidatesCount: verResult.emapMultiCandidates,
        insertedCount: verResult.inserted,
        updatedCount: verResult.updated,
        failedCount: verResult.dbFailed,
        dbTotalAfterCity: dbTotal,
        status: "completed",
      });

      completedCities.push(cityName);
    } catch (err) {
      console.error(`  [ERROR] ${cityName} 失敗：${err.message}`);
      failedCities.push(cityName);
      globalStats.cityReports.push({ cityName, url: cityUrl, status: "failed", error: err.message });
    }

    // Save progress after each city
    saveProgress({ processedCities: ci + 1, currentCity: cityName, completedCities, failedCities });

    // Save running report
    if (!dryRun) saveReport({ ...globalStats, completedCities, failedCities });

    // Inter-city delay (skip for last city)
    if (ci < cityUrls.length - 1) await sleep(delayMs * 2);
  }

  // 8. Final summary
  const finalDb = (!dryRun && pool) ? await getTotalStoreCount() : 0;
  console.log(`\n${"═".repeat(60)}`);
  console.log("全台批次匯入 — 最終統計");
  console.log("═".repeat(60));
  console.log(`處理縣市：   ${globalStats.processedCities} / ${globalStats.totalCities}`);
  console.log(`twcoupon 合計：${globalStats.totalStoresParsed} 筆`);
  console.log(`verified：   ${globalStats.totalVerified}`);
  console.log(`unverified： ${globalStats.totalUnverified}`);
  console.log(`multi-cand： ${globalStats.totalMultipleCandidates}`);
  console.log(`DB 新增：    ${globalStats.totalInserted}`);
  console.log(`DB 更新：    ${globalStats.totalUpdated}`);
  console.log(`DB 失敗：    ${globalStats.totalDbFailed}`);
  if (!dryRun) console.log(`DB 7-11 總數：${finalDb}`);
  if (failedCities.length > 0) console.log(`失敗縣市：   ${failedCities.join(", ")}`);

  console.log(`\n完成縣市（${completedCities.length}）：${completedCities.join(" | ")}`);

  if (!dryRun) {
    saveReport({ ...globalStats, completedCities, failedCities, dbTotalFinal: finalDb });
    console.log(`\n進度檔：${ALL_CITIES_PROGRESS_FILE}`);
    console.log(`報表檔：${ALL_CITIES_REPORT_FILE}`);
  }
  console.log("═".repeat(60) + "\n");
}

// ── SINGLE-CITY MODE ──────────────────────────────────────────────────────────
async function runSingleCity() {
  console.log("\n7-11 twcoupon + EmapSDK 匯入 — 門市資料登記工具");
  console.log("此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n");

  let cityPageUrls = [];
  if (isMainPageUrl(urlArg)) {
    const mainHtml = await fetchHtml(urlArg);
    const cityLinks = extractCityLinksFromMain(mainHtml);
    const pocTarget = cityLinks.filter(u => u.includes("%e9%80%a3%e6%b1%9f") || u.includes("連江"));
    cityPageUrls = pocTarget.length > 0 ? [pocTarget[0]] : [cityLinks[cityLinks.length - 1]];
    console.log(`PoC 選用：${decodeURIComponent(cityPageUrls[0])}\n`);
  } else {
    cityPageUrls = [urlArg];
  }

  let allStores = [];
  for (const cityUrl of cityPageUrls) {
    const { stores } = await collectStoresFromCityPage(cityUrl);
    allStores.push(...stores);
  }
  allStores = deduplicateStores(allStores);

  const storesToProcess = limit < Infinity ? allStores.slice(0, limit) : allStores;

  console.log(`\ntwcoupon 總計：${allStores.length} 筆，本次處理：${storesToProcess.length} 筆`);
  console.log(`EmapSDK 驗證：${verifyEmap ? "開啟" : "關閉"}　delay：${delayMs}ms`);
  if (dryRun) console.log("[DRY-RUN] 不會寫入 DB");
  console.log("");

  const stats = await verifyAndUpsert(storesToProcess, "");
  const totalStores = (!dryRun && pool) ? await getTotalStoreCount() : 0;

  console.log("\n── twcoupon + EmapSDK 匯入統計 ─────────────────────────────");
  console.log(`twcoupon 抓到：           ${allStores.length} 筆`);
  console.log(`實際處理：                ${storesToProcess.length} 筆`);
  console.log(`EmapSDK verified：        ${stats.emapVerified} 筆`);
  console.log(`  其中多候選 (best pick)： ${stats.emapMultiCandidates} 筆`);
  console.log(`unverified：              ${stats.emapUnverified} 筆`);
  console.log(`EmapSDK 失敗：            ${stats.emapFailed} 筆`);
  console.log(`DB 新增：                 ${stats.inserted} 筆`);
  console.log(`DB 更新：                 ${stats.updated} 筆`);
  console.log(`DB 失敗：                 ${stats.dbFailed} 筆`);
  if (!dryRun) console.log(`DB 7-11 門市總數：        ${totalStores} 筆`);

  if (stats.unverifiedList.length > 0) {
    console.log("\n── unverified 清單 ──────────────────────────────────────────");
    stats.unverifiedList.forEach((s, i) => console.log(`  ${i + 1}. ${s.storeName}（kw:${s.keyword}）${s.storeAddress}`));
  }
  if (stats.multipleCandidatesList.length > 0) {
    console.log("\n── multiple_candidates ──────────────────────────────────────");
    stats.multipleCandidatesList.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.storeName}（kw:${s.keyword}）→ chose ${s.chosen}`);
      s.candidates.forEach(c => console.log(`     - ${c}`));
    });
  }

  // Save report (single-city)
  const altDir = path.resolve(process.cwd(), "data/cvs");
  const reportDir = fs.existsSync(altDir) ? altDir : __dir;
  if (!dryRun) {
    fs.writeFileSync(path.join(reportDir, "twcoupon-emap-poc-report.json"), JSON.stringify({
      sourceUrl: urlArg, twcouponTotal: allStores.length,
      processed: storesToProcess.length, emapVerified: stats.emapVerified,
      emapMultiCandidates: stats.emapMultiCandidates, emapUnverified: stats.emapUnverified,
      emapFailed: stats.emapFailed, dbInserted: stats.inserted, dbUpdated: stats.updated,
      dbFailed: stats.dbFailed, totalStoresInDb: totalStores,
      unverifiedList: stats.unverifiedList, multipleCandidatesList: stats.multipleCandidatesList,
      failedList: stats.failedList, completedAt: new Date().toISOString(),
    }, null, 2));
  }
  console.log("─────────────────────────────────────────────────────────────\n");
}

// ── entry point ───────────────────────────────────────────────────────────────
async function main() {
  if (allCitiesMode) {
    await runAllCities();
  } else {
    await runSingleCity();
  }
  if (pool) await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); if (pool) pool.end(); process.exit(1); });
