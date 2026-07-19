/**
 * Step 7O: EmapSDK city+town 行政區批量匯入工具
 * 此工具只用於門市資料登記，不建立正式物流單，不串 ECPay。
 *
 * 使用方式：
 *   node scripts/import-seven-stores-from-emap-districts.mjs --city 新北市 --district 板橋區 --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --limit 5 --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --resume --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --only-city 新北市 --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --city 新北市 --district 板橋區 --dry-run
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --list
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}
function hasFlag(flag) {
  return args.includes(flag);
}

const cityArg = getArg("--city");
const districtArg = getArg("--district");
const allDistrictsMode = hasFlag("--all-districts");
const limitRaw = getArg("--limit");
const limit = limitRaw != null ? parseInt(limitRaw, 10) : null;
const resumeMode = hasFlag("--resume");
const dryRun = hasFlag("--dry-run");
const listMode = hasFlag("--list");
const onlyCityArg = getArg("--only-city");
const delayMs = parseInt(getArg("--delay") ?? "1200", 10);

// Validate args
if (!allDistrictsMode && (!cityArg || !districtArg)) {
  if (!listMode) {
    console.error("Usage:");
    console.error(
      "  Single district: --city <city> --district <district> [--dry-run] [--delay <ms>]",
    );
    console.error(
      "  All districts:   --all-districts [--limit <n>] [--resume] [--only-city <city>] [--list] [--delay <ms>]",
    );
    process.exit(1);
  }
}

// ── Data ─────────────────────────────────────────────────────────────────────
const DISTRICTS_FILE = path.resolve(
  __dir,
  "../../data/cvs/taiwan-city-districts.json",
);
const PROGRESS_FILE = path.join(__dir, "emap-district-import-progress.json");
const REPORT_FILE = path.join(__dir, "emap-district-import-report.json");

function loadAllDistricts() {
  if (!fs.existsSync(DISTRICTS_FILE))
    throw new Error(`行政區清單不存在：${DISTRICTS_FILE}`);
  return JSON.parse(fs.readFileSync(DISTRICTS_FILE, "utf-8"));
}

// ── DB ────────────────────────────────────────────────────────────────────────
let pool = null;
if (!dryRun) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── EmapSDK ───────────────────────────────────────────────────────────────────
function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseGeoPositions(xml, payloadCity, payloadDistrict) {
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
    const xRaw = parseFloat(getTag(geo, "X"));
    const yRaw = parseFloat(getTag(geo, "Y"));
    const storeName = poiName.endsWith("門市") ? poiName : `${poiName}門市`;
    let latitude = null,
      longitude = null;
    if (!isNaN(xRaw) && !isNaN(yRaw) && xRaw > 0 && yRaw > 0) {
      longitude = (xRaw / 1_000_000).toFixed(7);
      latitude = (yRaw / 1_000_000).toFixed(7);
    }
    positions.push({
      storeId,
      storeName,
      storeAddress: address,
      storePhone: telno || null,
      businessHours: opTime || null,
      latitude,
      longitude,
      city: payloadCity,
      district: payloadDistrict,
    });
  }
  return positions;
}

async function queryEmapDistrict(city, district) {
  const body = new URLSearchParams({
    commandid: "SearchStore",
    city,
    town: district,
  });
  const resp = await fetch("https://emap.pcsc.com.tw/EmapSDK.aspx", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`EmapSDK HTTP ${resp.status}`);
  return resp.text();
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
// Source strategy: always set source='emap_district_batch' on upsert.
// EmapSDK city+town data is official and authoritative (POIID-based),
// so overwriting twcoupon_emap_verified or emap_sdk_batch is acceptable.
// source_updated_at is always refreshed to indicate last sync time.
async function upsertStore(store) {
  const result = await pool.query(
    `INSERT INTO cvs_stores
       (provider, store_id, store_name, store_address, store_phone, city, district,
        business_hours, latitude, longitude, is_active, source, source_updated_at)
     VALUES ('seven', $1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'emap_district_batch', now())
     ON CONFLICT (provider, store_id) DO UPDATE SET
       store_name       = EXCLUDED.store_name,
       store_address    = EXCLUDED.store_address,
       store_phone      = EXCLUDED.store_phone,
       city             = EXCLUDED.city,
       district         = EXCLUDED.district,
       business_hours   = EXCLUDED.business_hours,
       latitude         = EXCLUDED.latitude,
       longitude        = EXCLUDED.longitude,
       source           = EXCLUDED.source,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at       = now()
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
    ],
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

async function getTotalStoreCount() {
  const r = await pool.query(
    "SELECT COUNT(*) FROM cvs_stores WHERE provider = 'seven' AND is_active = true",
  );
  return parseInt(r.rows[0].count, 10);
}

// ── Progress / Report I/O ─────────────────────────────────────────────────────
function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify(
      {
        ...progress,
        lastUpdatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function saveReport(report) {
  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        ...report,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

// ── Single district ───────────────────────────────────────────────────────────
async function runSingleDistrict(city, district) {
  console.log(`\n7-11 EmapSDK 行政區匯入 — ${city} ${district}`);
  console.log(`此工具只用於門市資料查詢 / 匯入，不建立正式物流單。`);
  console.log(`delay：${delayMs}ms${dryRun ? "　[DRY-RUN]" : ""}\n`);

  if (dryRun) {
    console.log(`[DRY-RUN] 呼叫 EmapSDK：city=${city} town=${district}`);
    try {
      const xml = await queryEmapDistrict(city, district);
      const stores = parseGeoPositions(xml, city, district);
      console.log(`[DRY-RUN] 回傳 ${stores.length} 筆，不寫入 DB`);
      stores
        .slice(0, 5)
        .forEach((s, i) =>
          console.log(
            `  ${i + 1}. ${s.storeId} ${s.storeName}  ${s.storeAddress}`,
          ),
        );
      if (stores.length > 5) console.log(`  ... (以上為前 5 筆)`);
    } catch (err) {
      console.log(`[DRY-RUN] API 失敗：${err.message}`);
    }
    return;
  }

  try {
    const xml = await queryEmapDistrict(city, district);
    const stores = parseGeoPositions(xml, city, district);
    console.log(`EmapSDK 回傳：${stores.length} 筆`);

    let inserted = 0,
      updated = 0,
      failed = 0;
    for (const store of stores) {
      try {
        const action = await upsertStore(store);
        if (action === "inserted") {
          inserted++;
          process.stdout.write("+");
        } else {
          updated++;
          process.stdout.write(".");
        }
      } catch (err) {
        failed++;
        console.error(`\nDB 寫入失敗 ${store.storeId}：${err.message}`);
      }
    }
    if (stores.length > 0) process.stdout.write("\n");

    const dbTotal = await getTotalStoreCount();
    console.log(`\n新增：${inserted}　更新：${updated}　失敗：${failed}`);
    console.log(`DB 7-11 總數：${dbTotal}`);
  } catch (err) {
    console.error(`API 失敗：${err.message}`);
    process.exit(1);
  }
}

// ── All districts mode ────────────────────────────────────────────────────────
async function runAllDistricts() {
  let allDistricts = loadAllDistricts();
  const totalInFile = allDistricts.length;

  // Apply --only-city filter
  if (onlyCityArg) {
    allDistricts = allDistricts.filter((d) => d.city === onlyCityArg);
    console.log(
      `--only-city ${onlyCityArg}：篩選後 ${allDistricts.length} 個行政區`,
    );
  }

  // --list mode
  if (listMode) {
    console.log(
      `\n── 行政區清單${onlyCityArg ? `（${onlyCityArg}）` : "（全台）"} ─────────────────────`,
    );
    allDistricts.forEach((d, i) =>
      console.log(`  ${String(i + 1).padStart(3)}. ${d.city} ${d.district}`),
    );
    console.log(
      `\n共 ${allDistricts.length} 個行政區（全台合計 ${totalInFile} 個）`,
    );
    return;
  }

  console.log(`\n7-11 EmapSDK 行政區批量匯入`);
  console.log(`此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n`);
  console.log(`行政區總數：${allDistricts.length}（全台 ${totalInFile} 個）`);

  // --resume: skip completed districts
  let progress = loadProgress();
  let completedKeys = new Set();
  let failedDistricts = [];

  if (resumeMode && progress) {
    completedKeys = new Set(progress.completedDistricts ?? []);
    failedDistricts = progress.failedDistricts ?? [];
    const before = allDistricts.length;
    allDistricts = allDistricts.filter(
      (d) => !completedKeys.has(`${d.city}|${d.district}`),
    );
    console.log(
      `--resume：已完成 ${completedKeys.size} 個，略過後剩 ${allDistricts.length} 個`,
    );
  } else if (!resumeMode) {
    progress = null;
  }

  // --limit
  const toProcess = limit != null ? allDistricts.slice(0, limit) : allDistricts;
  console.log(`本次處理：${toProcess.length} 個行政區`);
  console.log(`delay：${delayMs}ms${dryRun ? "　[DRY-RUN]" : ""}\n`);

  if (toProcess.length === 0) {
    console.log("沒有需要處理的行政區，結束。");
    return;
  }

  const globalStats = {
    totalDistricts: totalInFile,
    processedDistricts: 0,
    totalStoresReturned: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalFailed: 0,
    districtReports: [],
  };

  for (let i = 0; i < toProcess.length; i++) {
    const { city, district } = toProcess[i];
    const key = `${city}|${district}`;
    process.stdout.write(
      `[${i + 1}/${toProcess.length}] ${city} ${district} ... `,
    );

    if (dryRun) {
      console.log(`[DRY-RUN 略過]`);
      continue;
    }

    // Save progress before processing
    saveProgress({
      processedDistricts: i,
      completedDistricts: [...completedKeys],
      failedDistricts,
      currentCity: city,
      currentDistrict: district,
    });

    let districtInserted = 0,
      districtUpdated = 0,
      districtFailed = 0,
      returned = 0;
    let dbTotalAfter = 0;

    try {
      const xml = await queryEmapDistrict(city, district);
      const stores = parseGeoPositions(xml, city, district);
      returned = stores.length;

      for (const store of stores) {
        try {
          const action = await upsertStore(store);
          if (action === "inserted") districtInserted++;
          else districtUpdated++;
        } catch (err) {
          districtFailed++;
        }
      }

      dbTotalAfter = await getTotalStoreCount();

      console.log(
        `returned=${returned} +${districtInserted} ~${districtUpdated} !${districtFailed}  DB=${dbTotalAfter}`,
      );

      globalStats.processedDistricts++;
      globalStats.totalStoresReturned += returned;
      globalStats.totalInserted += districtInserted;
      globalStats.totalUpdated += districtUpdated;
      globalStats.totalFailed += districtFailed;

      globalStats.districtReports.push({
        city,
        district,
        returnedCount: returned,
        insertedCount: districtInserted,
        updatedCount: districtUpdated,
        failedCount: districtFailed,
        dbTotalAfterDistrict: dbTotalAfter,
        status: "completed",
      });

      completedKeys.add(key);
    } catch (err) {
      console.log(`失敗 (${err.message})`);
      failedDistricts.push({ city, district, error: err.message });
      globalStats.districtReports.push({
        city,
        district,
        status: "failed",
        error: err.message,
      });
    }

    // Save progress after processing
    saveProgress({
      processedDistricts: i + 1,
      completedDistricts: [...completedKeys],
      failedDistricts,
      currentCity: city,
      currentDistrict: district,
    });

    // Save running report
    saveReport({
      ...globalStats,
      completedDistricts: [...completedKeys],
      failedDistricts,
    });

    // Inter-district delay (skip for last)
    if (i < toProcess.length - 1) await sleep(delayMs);
  }

  // Final summary
  const finalDb = !dryRun && pool ? await getTotalStoreCount() : 0;
  console.log(`\n── 批量匯入統計 ─────────────────────────────────────`);
  console.log(`行政區總數：          ${totalInFile}`);
  console.log(`本次處理：            ${globalStats.processedDistricts}`);
  console.log(`EmapSDK 回傳總筆數：  ${globalStats.totalStoresReturned}`);
  console.log(`DB 新增：             ${globalStats.totalInserted}`);
  console.log(`DB 更新：             ${globalStats.totalUpdated}`);
  console.log(`DB 寫入失敗：         ${globalStats.totalFailed}`);
  if (!dryRun) {
    console.log(`DB 7-11 門市總數：    ${finalDb}`);
    console.log(`進度檔：              ${PROGRESS_FILE}`);
    console.log(`報表檔：              ${REPORT_FILE}`);
  }
  if (failedDistricts.length > 0) {
    console.log(`\n失敗行政區（${failedDistricts.length}）：`);
    failedDistricts.forEach((f) =>
      console.log(`  - ${f.city} ${f.district}：${f.error}`),
    );
  }
  console.log(`──────────────────────────────────────────────────\n`);

  if (!dryRun) {
    saveReport({
      ...globalStats,
      completedDistricts: [...completedKeys],
      failedDistricts,
      dbTotalFinal: finalDb,
    });
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  if (allDistrictsMode || listMode) {
    await runAllDistricts();
  } else {
    await runSingleDistrict(cityArg, districtArg);
  }
  if (pool) await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  if (pool) pool.end();
  process.exit(1);
});
