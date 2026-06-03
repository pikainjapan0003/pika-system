/**
 * 7-11 EmapSDK 批量關鍵字匯入工具（升級版）
 * 此工具只用於門市資料登記，不建立正式物流單，不串 ECPay。
 *
 * 執行：
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/taiwan-district-keywords.txt --delay 1000 --limit 10
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/taiwan-district-keywords.txt --delay 1000 --resume
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/taiwan-district-keywords.txt --dry-run --limit 5
 */
import fs from "fs";
import path from "path";
import pg from "pg";
const { Pool } = pg;

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] ?? null : null; }
function hasFlag(flag) { return args.includes(flag); }

const keywordsFile = getArg("--file");
const delayMs = parseInt(getArg("--delay") ?? "600", 10);
const limitRaw = getArg("--limit");
const limit = limitRaw != null ? parseInt(limitRaw, 10) : null;
const resume = hasFlag("--resume");
const dryRun = hasFlag("--dry-run");

if (!keywordsFile) {
  console.error("Usage: node import-seven-stores-from-emap.mjs --file <keywords-file> [--delay <ms>] [--limit <n>] [--resume] [--dry-run]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const absFile = path.resolve(process.cwd(), keywordsFile);
const fileDir = path.dirname(absFile);
const progressFile = path.join(fileDir, "seven-import-progress.json");
const reportFile = path.join(fileDir, "seven-import-report.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseGeoPositions(xml) {
  const positions = [];
  const regex = /<GeoPosition>([\s\S]*?)<\/GeoPosition>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const geo = m[1];
    const storeId = getTag(geo, "POIID");
    if (!storeId) continue;
    const poiName = getTag(geo, "POIName");
    const address = getTag(geo, "Address");
    const telno = getTag(geo, "Telno");
    const opTime = getTag(geo, "OP_TIME");
    const xRaw = getTag(geo, "X");
    const yRaw = getTag(geo, "Y");
    const storeName = poiName.endsWith("門市") ? poiName : `${poiName}門市`;
    let latitude = null, longitude = null;
    const xNum = parseFloat(xRaw), yNum = parseFloat(yRaw);
    if (!isNaN(xNum) && !isNaN(yNum) && xNum > 0 && yNum > 0) {
      longitude = (xNum / 1_000_000).toFixed(7);
      latitude = (yNum / 1_000_000).toFixed(7);
    }
    let city = null, district = null;
    if (address) {
      const cm = address.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
      const dm = address.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
    }
    positions.push({ storeId, storeName, storeAddress: address, storePhone: telno || null, businessHours: opTime || null, latitude, longitude, city, district });
  }
  return positions;
}

async function queryEmap(keyword) {
  const body = new URLSearchParams({ commandid: "SearchStore", StoreName: keyword });
  const resp = await fetch("https://emap.pcsc.com.tw/EmapSDK.aspx", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function upsertStore(store) {
  const result = await pool.query(
    `INSERT INTO cvs_stores
       (provider, store_id, store_name, store_address, store_phone, city, district,
        business_hours, latitude, longitude, is_active, source, source_updated_at)
     VALUES ('seven', $1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'emap_sdk_batch', now())
     ON CONFLICT (provider, store_id) DO UPDATE SET
       store_name = EXCLUDED.store_name, store_address = EXCLUDED.store_address,
       store_phone = EXCLUDED.store_phone, city = EXCLUDED.city, district = EXCLUDED.district,
       business_hours = EXCLUDED.business_hours, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, source = EXCLUDED.source,
       source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [store.storeId, store.storeName, store.storeAddress, store.storePhone,
     store.city, store.district, store.businessHours, store.latitude, store.longitude]
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

function loadProgress() {
  if (!fs.existsSync(progressFile)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    return data.file === absFile ? (data.processedCount ?? 0) : 0;
  } catch { return 0; }
}

function saveProgress(processedCount, lastKeyword) {
  fs.writeFileSync(progressFile, JSON.stringify({ file: absFile, processedCount, lastKeyword, updatedAt: new Date().toISOString() }, null, 2));
}

async function getTotalStoreCount() {
  const result = await pool.query("SELECT COUNT(*) FROM cvs_stores WHERE provider = 'seven' AND is_active = true");
  return parseInt(result.rows[0].count, 10);
}

function saveReport(stats, totalStores) {
  fs.writeFileSync(reportFile, JSON.stringify({
    file: absFile,
    total: stats.total, processed: stats.processedThisRun,
    hasResult: stats.queried, noResult: stats.noResult,
    inserted: stats.inserted, updated: stats.updated,
    failed: stats.failed, failedKeywords: stats.failedKeywords,
    totalStoresInDb: totalStores, completedAt: new Date().toISOString(),
  }, null, 2));
}

async function main() {
  if (!fs.existsSync(absFile)) { console.error(`Keywords file not found: ${absFile}`); process.exit(1); }

  const allKeywords = fs.readFileSync(absFile, "utf-8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  console.log(`\n7-11 EmapSDK 批量匯入 — 門市資料登記工具`);
  console.log(`此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n`);
  console.log(`關鍵字檔：${absFile}`);
  console.log(`關鍵字總數：${allKeywords.length}`);

  let startIndex = 0;
  if (resume) {
    startIndex = loadProgress();
    console.log(startIndex > 0 ? `--resume：從第 ${startIndex + 1} 個繼續` : `--resume：無進度，從頭開始`);
  }

  const remaining = allKeywords.slice(startIndex);
  const keywords = limit != null ? remaining.slice(0, limit) : remaining;

  console.log(`本次處理：${keywords.length} 個（第 ${startIndex + 1}～${startIndex + keywords.length} 個）`);
  console.log(`每次間隔：${delayMs}ms`);
  if (dryRun) console.log(`[DRY-RUN] 不會實際呼叫 API 或寫入 DB`);
  console.log("");

  const stats = { total: allKeywords.length, processedThisRun: 0, queried: 0, noResult: 0, inserted: 0, updated: 0, failed: 0, failedKeywords: [] };

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const globalIdx = startIndex + i;
    process.stdout.write(`[${globalIdx + 1}/${allKeywords.length}] 查詢「${kw}」... `);
    stats.processedThisRun++;

    if (dryRun) { console.log(`[DRY-RUN 略過]`); continue; }

    try {
      const xml = await queryEmap(kw);
      const stores = parseGeoPositions(xml);
      if (stores.length === 0) {
        console.log(`無結果`); stats.noResult++;
      } else {
        stats.queried++;
        let ins = 0, upd = 0;
        for (const store of stores) {
          const action = await upsertStore(store);
          if (action === "inserted") { stats.inserted++; ins++; } else { stats.updated++; upd++; }
        }
        console.log(`找到 ${stores.length} 筆 → 新增 ${ins}，更新 ${upd}`);
      }
    } catch (err) {
      console.log(`失敗 (${err.message})`); stats.failed++; stats.failedKeywords.push(kw);
    }

    saveProgress(globalIdx + 1, kw);
    if (i < keywords.length - 1) await sleep(delayMs);
  }

  const totalStores = dryRun ? 0 : await getTotalStoreCount();
  if (!dryRun) saveReport(stats, totalStores);

  console.log(`\n── 匯入統計 ──────────────────────────`);
  console.log(`關鍵字總數：      ${stats.total}`);
  console.log(`本次處理：        ${stats.processedThisRun}`);
  console.log(`有結果：          ${stats.queried}`);
  console.log(`無結果：          ${stats.noResult}`);
  console.log(`新增門市：        ${stats.inserted}`);
  console.log(`更新門市：        ${stats.updated}`);
  console.log(`失敗：            ${stats.failed}`);
  if (stats.failedKeywords.length > 0) console.log(`失敗關鍵字：      ${stats.failedKeywords.join(", ")}`);
  if (!dryRun) {
    console.log(`DB 7-11 門市總數：${totalStores}`);
    console.log(`進度檔：          ${progressFile}`);
    console.log(`報表檔：          ${reportFile}`);
  }
  console.log(`─────────────────────────────────────\n`);

  await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
