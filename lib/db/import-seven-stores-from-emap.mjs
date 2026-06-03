/**
 * 7-11 EmapSDK 批量關鍵字匯入工具
 *
 * 用途：讀取關鍵字清單，逐筆呼叫 7-11 EmapSDK.aspx，
 *       解析 XML，upsert 到 cvs_stores。
 * 這是門市資料查詢 / 匯入工具，不產生正式物流單，不串 ECPay。
 *
 * 執行：
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/seven-import-keywords.txt
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/seven-import-keywords.txt --delay 800
 */

import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileArgIdx = args.indexOf("--file");
const delayArgIdx = args.indexOf("--delay");

if (fileArgIdx === -1 || !args[fileArgIdx + 1]) {
  console.error("Usage: node import-seven-stores-from-emap.mjs --file <keywords-file> [--delay <ms>]");
  process.exit(1);
}

const keywordsFile = args[fileArgIdx + 1];
const delayMs = delayArgIdx !== -1 ? parseInt(args[delayArgIdx + 1] ?? "600", 10) : 600;

// ── DB ────────────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

    let latitude = null;
    let longitude = null;
    const xNum = parseFloat(xRaw);
    const yNum = parseFloat(yRaw);
    if (!isNaN(xNum) && !isNaN(yNum) && xNum > 0 && yNum > 0) {
      longitude = (xNum / 1_000_000).toFixed(7);
      latitude = (yNum / 1_000_000).toFixed(7);
    }

    // Try to extract city (first 3 chars ending in 市/縣) and district
    let city = null;
    let district = null;
    if (address) {
      const cityMatch = address.match(/^(.{2,4}[市縣])/);
      if (cityMatch) city = cityMatch[1];
      const districtMatch = address.match(/[市縣](.{2,4}[區鄉鎮市])/);
      if (districtMatch) district = districtMatch[1];
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
       store_name         = EXCLUDED.store_name,
       store_address      = EXCLUDED.store_address,
       store_phone        = EXCLUDED.store_phone,
       city               = EXCLUDED.city,
       district           = EXCLUDED.district,
       business_hours     = EXCLUDED.business_hours,
       latitude           = EXCLUDED.latitude,
       longitude          = EXCLUDED.longitude,
       source             = EXCLUDED.source,
       source_updated_at  = EXCLUDED.source_updated_at,
       updated_at         = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      store.storeId,
      store.storeName,
      store.storeAddress,
      store.storePhone,
      store.city,
      store.district,
      store.businessHours,
      store.latitude,
      store.longitude,
    ]
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const absFile = path.resolve(process.cwd(), keywordsFile);
  if (!fs.existsSync(absFile)) {
    console.error(`Keywords file not found: ${absFile}`);
    process.exit(1);
  }

  const keywords = fs
    .readFileSync(absFile, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  console.log(`\n7-11 EmapSDK 批量匯入 — 門市資料登記工具`);
  console.log(`此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n`);
  console.log(`關鍵字檔：${absFile}`);
  console.log(`關鍵字數：${keywords.length}`);
  console.log(`每次間隔：${delayMs}ms\n`);

  const stats = {
    total: keywords.length,
    queried: 0,
    noResult: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    failedKeywords: [],
  };

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    process.stdout.write(`[${i + 1}/${keywords.length}] 查詢「${kw}」... `);

    try {
      const xml = await queryEmap(kw);
      const stores = parseGeoPositions(xml);

      if (stores.length === 0) {
        console.log(`無結果`);
        stats.noResult++;
      } else {
        stats.queried++;
        let insertedCount = 0;
        let updatedCount = 0;
        for (const store of stores) {
          const action = await upsertStore(store);
          if (action === "inserted") { stats.inserted++; insertedCount++; }
          else { stats.updated++; updatedCount++; }
        }
        console.log(`找到 ${stores.length} 筆 → 新增 ${insertedCount}，更新 ${updatedCount}`);
      }
    } catch (err) {
      console.log(`失敗 (${err.message})`);
      stats.failed++;
      stats.failedKeywords.push(kw);
    }

    if (i < keywords.length - 1) await sleep(delayMs);
  }

  console.log(`\n── 匯入統計 ──────────────────────────`);
  console.log(`關鍵字總數：${stats.total}`);
  console.log(`有結果：   ${stats.queried}`);
  console.log(`無結果：   ${stats.noResult}`);
  console.log(`新增門市： ${stats.inserted}`);
  console.log(`更新門市： ${stats.updated}`);
  console.log(`失敗：     ${stats.failed}`);
  if (stats.failedKeywords.length > 0) {
    console.log(`失敗關鍵字：${stats.failedKeywords.join(", ")}`);
  }
  console.log(`─────────────────────────────────────\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
