/**
 * FamilyMart F5-3: 官方 Map 資料 city-level replace/upsert
 *
 * 此工具用於將官方全家門市資料寫入 DB。
 * 不建立物流單，不串 ECPay，不串全家物流 API。
 *
 * 使用方式（從 workspace root）：
 *   # 單一縣市 dry-run
 *   node scripts/family-official-map-upsert.mjs --city 台北市 --dry-run
 *
 *   # 單一縣市寫入
 *   node scripts/family-official-map-upsert.mjs --city 台北市 --replace-city --delay 1000
 *
 *   # 全台 dry-run
 *   node scripts/family-official-map-upsert.mjs --all-cities --dry-run --delay 1000 --report data/cvs/family-official-upsert-stepf532-allcities-dryrun.json
 *
 *   # 全台寫入
 *   node scripts/family-official-map-upsert.mjs --all-cities --replace-city --delay 1000 --report data/cvs/family-official-upsert-stepf532-allcities.json
 *
 *   # 跳過特定縣市
 *   node scripts/family-official-map-upsert.mjs --all-cities --skip-city 台北市 --replace-city
 *
 * 安全設計：
 * - 沒有 --replace-city 就不寫 DB（預設 dry-run）
 * - 不刪除舊資料，只 is_active=false
 * - API key 只在記憶體，不寫入任何檔案
 * - 逐縣市獨立 transaction，失敗不影響其他縣市
 * - 支援 --progress resume（中斷可續跑）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dir, "..");
const req = createRequire(path.join(WORKSPACE_ROOT, "lib/db/package.json"));
const pg = req("pg");

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(f) {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}
function hasFlag(f) {
  return args.includes(f);
}

const allCities = hasFlag("--all-cities");
const cityArg = getArg("--city");
const skipCity = getArg("--skip-city");
const isDryRun = hasFlag("--dry-run") || !hasFlag("--replace-city");
const delayMs = parseInt(getArg("--delay") ?? "1000", 10);
const reportArg = getArg("--report");
const progressArg = getArg("--progress");

if (!allCities && !cityArg) {
  console.error(
    "用法: --city <縣市> 或 --all-cities [--dry-run | --replace-city] [--delay ms] [--report path] [--skip-city <縣市>] [--progress path]",
  );
  process.exit(1);
}

const modeLabel = allCities ? "all-cities" : cityArg;
const DEFAULT_REPORT = path.join(
  WORKSPACE_ROOT,
  `data/cvs/family-official-upsert-${modeLabel.replace(/[^\w一-鿿]/g, "")}.json`,
);
const REPORT_PATH = reportArg
  ? path.isAbsolute(reportArg)
    ? reportArg
    : path.resolve(WORKSPACE_ROOT, reportArg)
  : DEFAULT_REPORT;
const PROGRESS_PATH = progressArg
  ? path.isAbsolute(progressArg)
    ? progressArg
    : path.resolve(WORKSPACE_ROOT, progressArg)
  : path.join(WORKSPACE_ROOT, "data/cvs/family-official-upsert-progress.json");

// 全台縣市列表（taiwan-city-districts.json から取得）
const CITY_DISTRICTS_PATH = path.join(
  WORKSPACE_ROOT,
  "data/cvs/taiwan-city-districts.json",
);
const cityDistrictsFallback = JSON.parse(
  fs.readFileSync(CITY_DISTRICTS_PATH, "utf8"),
);
const fallbackMap = {};
for (const r of cityDistrictsFallback) {
  if (!fallbackMap[r.city]) fallbackMap[r.city] = [];
  fallbackMap[r.city].push(r);
}
const ALL_CITIES_LIST = [
  ...new Set(cityDistrictsFallback.map((r) => r.city)),
].sort();

const targetCities = allCities ? ALL_CITIES_LIST : [cityArg];

console.log(`[F5-3] 官方全家 Map replace/upsert`);
console.log(
  `[F5-3] mode    : ${isDryRun ? "dry-run（不寫 DB）" : "replace-city（寫 DB）"}`,
);
console.log(
  `[F5-3] targets : ${allCities ? "全台 " + targetCities.length + " 縣市" : cityArg}`,
);
if (skipCity) console.log(`[F5-3] skipCity: ${skipCity}`);
console.log(`[F5-3] delay   : ${delayMs}ms`);
console.log(`[F5-3] report  : ${REPORT_PATH}`);

// ── 工具函數 ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, headers, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        if (i < retries) {
          await sleep(2000);
          continue;
        }
        return null;
      }
      return await res.text();
    } catch {
      if (i < retries) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

let _cachedKey = null;
async function getOfficialKey() {
  if (_cachedKey) return _cachedKey;
  const html = await fetchWithRetry(
    "https://www.family.com.tw/Marketing/StoreMap/?v=1",
    {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  );
  if (!html) throw new Error("無法取得官方頁面");
  const match = html.match(/key=([A-F0-9]{40})/);
  if (!match) throw new Error("找不到 API key");
  _cachedKey = match[1];
  return _cachedKey;
}

const BASE_HEADERS = {
  Referer: "https://www.family.com.tw/Marketing/StoreMap/?v=1",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120",
};

async function fetchTownList(city, key) {
  const url = `https://api.map.com.tw/net/familyShop.aspx?searchType=ShowTownList&type=&city=${encodeURIComponent(city)}&fun=storeTownList&key=${key}`;
  const raw = await fetchWithRetry(url, BASE_HEADERS);
  if (!raw || raw.includes("DOCTYPE")) return null;
  const match = raw.match(/storeTownList\(\s*(\[[\s\S]*\])\s*\)/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data.map((r) => ({ city: r.city || city, district: r.town }));
  } catch {
    return null;
  }
}

async function fetchShopList(city, district, key) {
  const url = `https://api.map.com.tw/net/familyShop.aspx?searchType=ShopList&type=&city=${encodeURIComponent(city)}&area=${encodeURIComponent(district)}&road=&fun=showStoreList&key=${key}`;
  const raw = await fetchWithRetry(url, BASE_HEADERS);
  if (!raw || raw.includes("DOCTYPE") || raw.includes("ERROR")) return null;
  const jsonStr = raw
    .replace(/^showStoreList\(/, "")
    .replace(/\)\s*$/, "")
    .trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function checkCoord(lon, lat) {
  if (lon == null || lat == null) return false;
  const lonN = parseFloat(lon);
  const latN = parseFloat(lat);
  if (isNaN(lonN) || isNaN(latN)) return false;
  return lonN >= 118 && lonN <= 122.5 && latN >= 21 && latN <= 26.5;
}

// ── 縣市店家データ取得 ────────────────────────────────────────────────────────
async function fetchCityStores(city, key) {
  await sleep(delayMs);
  let districts = await fetchTownList(city, key);
  if (!districts || districts.length === 0) {
    districts = (fallbackMap[city] || []).map((r) => ({
      city,
      district: r.district,
    }));
    console.log(
      `[F5-3]   ${city} ShowTownList 失敗，fallback: ${districts.length} 區`,
    );
  } else {
    console.log(`[F5-3]   ${city}: ${districts.length} 區`);
  }

  const rawStores = [];
  const failedDistricts = [];
  const anomalies = [];

  for (const d of districts) {
    const district = d.district ?? d;
    await sleep(delayMs);
    const raw = await fetchShopList(city, district, key);
    if (!raw) {
      console.log(`[F5-3]     失敗: ${district}`);
      failedDistricts.push({ city, district });
      continue;
    }
    process.stdout.write(`[F5-3]     ${district}: ${raw.length} 店\n`);
    for (const item of raw) {
      if (!item.pkey) {
        anomalies.push({
          type: "missing_pkey",
          city,
          district,
          name: item.NAME,
        });
        continue;
      }
      const lon = item.px != null ? parseFloat(item.px) : null;
      const lat = item.py != null ? parseFloat(item.py) : null;
      if (!checkCoord(lon, lat)) {
        anomalies.push({
          type: "bad_coord",
          city,
          district,
          pkey: item.pkey,
          px: item.px,
          py: item.py,
        });
      }
      rawStores.push({
        provider: "family",
        store_id: `family-${item.pkey}`,
        store_name: item.NAME ?? "",
        store_address: item.addr ?? "",
        store_phone: item.TEL ?? null,
        city,
        district,
        latitude: lat,
        longitude: lon,
        source: "family_official_map",
        is_active: true,
      });
    }
  }

  // pkey 重複除去
  const seenIds = new Set();
  const deduped = [];
  for (const s of rawStores) {
    if (seenIds.has(s.store_id)) continue;
    seenIds.add(s.store_id);
    deduped.push(s);
  }
  return { rawStores, deduped, failedDistricts, anomalies };
}

// ── 縣市 DB 書き込み（Transaction）────────────────────────────────────────────
async function writeCityToDb(pool, city, deduped) {
  let deactivatedRows = 0,
    inserted = 0,
    updated = 0;
  const writeErrors = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deactRes = await client.query(
      `UPDATE cvs_stores SET is_active = false, source_updated_at = now()
       WHERE provider = 'family' AND city = $1 AND is_active = true`,
      [city],
    );
    deactivatedRows = deactRes.rowCount ?? 0;

    for (const s of deduped) {
      try {
        const res = await client.query(
          `INSERT INTO cvs_stores
             (provider, store_id, store_name, store_address, store_phone,
              city, district, latitude, longitude, source, is_active, source_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, now())
           ON CONFLICT (provider, store_id) DO UPDATE SET
             store_name        = EXCLUDED.store_name,
             store_address     = EXCLUDED.store_address,
             store_phone       = EXCLUDED.store_phone,
             city              = EXCLUDED.city,
             district          = EXCLUDED.district,
             latitude          = EXCLUDED.latitude,
             longitude         = EXCLUDED.longitude,
             source            = 'family_official_map',
             is_active         = true,
             source_updated_at = now()
           RETURNING (xmax = 0) AS is_insert`,
          [
            s.provider,
            s.store_id,
            s.store_name,
            s.store_address,
            s.store_phone,
            s.city,
            s.district,
            s.latitude,
            s.longitude,
            s.source,
          ],
        );
        if (res.rows[0]?.is_insert) inserted++;
        else updated++;
      } catch (e) {
        writeErrors.push({ store_id: s.store_id, error: e.message });
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { deactivatedRows, inserted, updated, writeErrors };
}

// ── DB 查詢 ───────────────────────────────────────────────────────────────────
async function queryGlobalBaseline(pool) {
  const [sevenRes, familyRes] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='seven' AND is_active=true",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true",
    ),
  ]);
  return {
    sevenBefore: parseInt(sevenRes.rows[0].cnt),
    familyBefore: parseInt(familyRes.rows[0].cnt),
  };
}

async function queryCityBaseline(pool, city) {
  const [cityRes, srcRes] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND city=$1 AND is_active=true",
      [city],
    ),
    pool.query(
      "SELECT source, COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND city=$1 AND is_active=true GROUP BY source",
      [city],
    ),
  ]);
  const sourceDist = {};
  for (const r of srcRes.rows) sourceDist[r.source] = parseInt(r.cnt);
  return {
    familyCityBefore: parseInt(cityRes.rows[0].cnt),
    familyCitySourceBefore: sourceDist,
  };
}

async function queryCityAfter(pool, city) {
  const [cityRes, srcRes] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND city=$1 AND is_active=true",
      [city],
    ),
    pool.query(
      "SELECT source, COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND city=$1 AND is_active=true GROUP BY source",
      [city],
    ),
  ]);
  const sourceDist = {};
  for (const r of srcRes.rows) sourceDist[r.source] = parseInt(r.cnt);
  return {
    familyCityAfter: parseInt(cityRes.rows[0].cnt),
    familyCitySourceAfter: sourceDist,
  };
}

async function queryGlobalFinal(pool) {
  const [
    sevenRes,
    familyRes,
    srcRes,
    dupRes,
    missingCoordRes,
    missingPhoneRes,
    missingAddrRes,
  ] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='seven' AND is_active=true",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true",
    ),
    pool.query(
      "SELECT source, COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true GROUP BY source ORDER BY cnt DESC",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM (SELECT store_id FROM cvs_stores WHERE provider='family' AND is_active=true GROUP BY store_id HAVING COUNT(*)>1) t",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true AND (latitude IS NULL OR longitude IS NULL)",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true AND (store_phone IS NULL OR store_phone='')",
    ),
    pool.query(
      "SELECT COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true AND (store_address IS NULL OR store_address='')",
    ),
  ]);
  const sourceDist = {};
  for (const r of srcRes.rows) sourceDist[r.source] = parseInt(r.cnt);
  return {
    sevenAfter: parseInt(sevenRes.rows[0].cnt),
    familyAfter: parseInt(familyRes.rows[0].cnt),
    familySourceAfter: sourceDist,
    duplicateStoreIds: parseInt(dupRes.rows[0].cnt),
    missingCoordinates: parseInt(missingCoordRes.rows[0].cnt),
    missingPhone: parseInt(missingPhoneRes.rows[0].cnt),
    missingAddress: parseInt(missingAddrRes.rows[0].cnt),
  };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未設定");

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  // progress ファイル読み込み
  let progress = { completedCities: [], cityResults: {} };
  if (!isDryRun && fs.existsSync(PROGRESS_PATH)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"));
      console.log(
        `[F5-3] 恢復進度：已完成 ${progress.completedCities.length} 縣市`,
      );
    } catch {
      progress = { completedCities: [], cityResults: {} };
    }
  }
  const completedSet = new Set(progress.completedCities);

  function saveProgress() {
    if (!isDryRun) {
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    }
  }

  try {
    // ── Global baseline ───────────────────────────────────────────────────────
    console.log("[F5-3] 查詢 DB baseline...");
    const globalBaseline = await queryGlobalBaseline(pool);
    console.log(`[F5-3] sevenBefore : ${globalBaseline.sevenBefore}`);
    console.log(`[F5-3] familyBefore: ${globalBaseline.familyBefore}`);

    // ── 官方 API key 取得 ─────────────────────────────────────────────────────
    console.log("[F5-3] 取得官方 API key...");
    const key = await getOfficialKey();
    console.log("[F5-3] key 取得成功（不輸出）");

    // ── 逐縣市処理 ────────────────────────────────────────────────────────────
    const cityReports = [];
    let totalOfficialRaw = 0;
    let totalOfficialDeduped = 0;
    let totalDeactivated = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const allAnomalies = [];
    const allFailedDistricts = [];
    const allMissingStats = {
      missingOfficialStoreId: 0,
      missingName: 0,
      missingAddress: 0,
      missingPhone: 0,
      missingPostalCode: 0,
      missingCity: 0,
      missingDistrict: 0,
      missingCoordinates: 0,
    };

    for (const city of targetCities) {
      if (skipCity && city === skipCity) {
        console.log(`\n[F5-3] === ${city} — SKIP（--skip-city）===`);
        continue;
      }

      if (!isDryRun && completedSet.has(city)) {
        console.log(`\n[F5-3] === ${city} — 跳過（已完成）===`);
        const cached = progress.cityResults[city];
        if (cached) cityReports.push(cached);
        totalOfficialRaw += cached?.officialCount ?? 0;
        totalOfficialDeduped += cached?.officialCount ?? 0;
        totalDeactivated += cached?.deactivatedOldRows ?? 0;
        totalInserted += cached?.inserted ?? 0;
        totalUpdated += cached?.updated ?? 0;
        totalFailed += cached?.failed ?? 0;
        continue;
      }

      console.log(`\n[F5-3] === ${city} ===`);

      // 縣市 baseline
      const cityBaseline = await queryCityBaseline(pool, city);
      console.log(
        `[F5-3]   familyCityBefore: ${cityBaseline.familyCityBefore}`,
      );

      // 官方資料取得
      const { rawStores, deduped, failedDistricts, anomalies } =
        await fetchCityStores(city, key);
      totalOfficialRaw += rawStores.length;
      totalOfficialDeduped += deduped.length;
      allAnomalies.push(...anomalies);
      allFailedDistricts.push(...failedDistricts);

      // missingStats 集計
      allMissingStats.missingName += deduped.filter(
        (s) => !s.store_name,
      ).length;
      allMissingStats.missingAddress += deduped.filter(
        (s) => !s.store_address,
      ).length;
      allMissingStats.missingPhone += deduped.filter(
        (s) => !s.store_phone,
      ).length;
      allMissingStats.missingCity += deduped.filter((s) => !s.city).length;
      allMissingStats.missingDistrict += deduped.filter(
        (s) => !s.district,
      ).length;
      allMissingStats.missingCoordinates += deduped.filter(
        (s) => s.latitude == null || s.longitude == null,
      ).length;

      console.log(
        `[F5-3]   officialCount: ${deduped.length}, failed: ${failedDistricts.length}`,
      );

      // dry-run の場合は DB 書き込みスキップ
      if (isDryRun) {
        const cityRpt = {
          city,
          officialCount: deduped.length,
          familyCityBefore: cityBaseline.familyCityBefore,
          familyCitySourceBefore: cityBaseline.familyCitySourceBefore,
          expectedDeactivatedOldRows: cityBaseline.familyCityBefore,
          expectedFamilyCityAfter: deduped.length,
          failedDistricts: failedDistricts.length,
          anomalies: anomalies.length,
        };
        cityReports.push(cityRpt);
        continue;
      }

      // 書き込み実行
      let writeResult;
      try {
        writeResult = await writeCityToDb(pool, city, deduped);
      } catch (e) {
        console.error(`[F5-3]   ${city} ROLLBACK: ${e.message}`);
        totalFailed += deduped.length;
        cityReports.push({
          city,
          officialCount: deduped.length,
          familyCityBefore: cityBaseline.familyCityBefore,
          deactivatedOldRows: 0,
          inserted: 0,
          updated: 0,
          failed: deduped.length,
          familyCityAfter: cityBaseline.familyCityBefore,
          error: e.message,
        });
        continue;
      }

      totalDeactivated += writeResult.deactivatedRows;
      totalInserted += writeResult.inserted;
      totalUpdated += writeResult.updated;
      totalFailed += writeResult.writeErrors.length;
      console.log(
        `[F5-3]   deactivated=${writeResult.deactivatedRows} inserted=${writeResult.inserted} updated=${writeResult.updated} errors=${writeResult.writeErrors.length}`,
      );

      // 縣市 after 確認
      const cityAfter = await queryCityAfter(pool, city);
      console.log(
        `[F5-3]   familyCityAfter: ${cityAfter.familyCityAfter} source: ${JSON.stringify(cityAfter.familyCitySourceAfter)}`,
      );

      const cityRpt = {
        city,
        officialCount: deduped.length,
        familyCityBefore: cityBaseline.familyCityBefore,
        familyCitySourceBefore: cityBaseline.familyCitySourceBefore,
        deactivatedOldRows: writeResult.deactivatedRows,
        inserted: writeResult.inserted,
        updated: writeResult.updated,
        failed: writeResult.writeErrors.length,
        failedDistricts: failedDistricts.length,
        anomalies: anomalies.length,
        familyCityAfter: cityAfter.familyCityAfter,
        sourceAfter: cityAfter.familyCitySourceAfter,
      };
      cityReports.push(cityRpt);

      // progress 保存
      completedSet.add(city);
      progress.completedCities = [...completedSet];
      progress.cityResults[city] = cityRpt;
      saveProgress();
    }

    // ── Global final validation ───────────────────────────────────────────────
    const final = isDryRun
      ? {
          sevenAfter: globalBaseline.sevenBefore,
          familyAfter: null,
          familySourceAfter: {},
          duplicateStoreIds: 0,
          missingCoordinates: 0,
          missingPhone: 0,
          missingAddress: 0,
        }
      : await queryGlobalFinal(pool);

    if (!isDryRun) {
      console.log("\n[F5-3] ========================================");
      console.log(`[F5-3] sevenAfter       : ${final.sevenAfter}`);
      console.log(`[F5-3] familyAfter      : ${final.familyAfter}`);
      console.log(
        `[F5-3] familySourceAfter:`,
        JSON.stringify(final.familySourceAfter),
      );
      console.log(`[F5-3] dupStoreIds      : ${final.duplicateStoreIds}`);
      console.log(`[F5-3] missingCoord     : ${final.missingCoordinates}`);
      console.log(
        `[F5-3] sevenUnchanged   : ${final.sevenAfter === globalBaseline.sevenBefore ? "✓" : "✗ 異常！"}`,
      );
    }

    // ── Report 出力 ───────────────────────────────────────────────────────────
    const report = {
      generatedAt: new Date().toISOString(),
      mode: allCities
        ? "official-map-allcities-replace-upsert"
        : "official-map-city-replace-upsert",
      dryRun: isDryRun,
      provider: "family",
      source: "family_official_map",
      officialRaw: totalOfficialRaw,
      officialDeduped: totalOfficialDeduped,
      familyBefore: globalBaseline.familyBefore,
      familyAfter: isDryRun ? null : final.familyAfter,
      expectedFamilyAfter: isDryRun
        ? globalBaseline.familyBefore -
          cityReports.reduce((s, c) => s + (c.familyCityBefore ?? 0), 0) +
          totalOfficialDeduped
        : null,
      sevenBefore: globalBaseline.sevenBefore,
      sevenAfter: isDryRun ? null : final.sevenAfter,
      sevenUnchanged: isDryRun
        ? null
        : final.sevenAfter === globalBaseline.sevenBefore,
      deactivatedOldFamilyRows: isDryRun ? null : totalDeactivated,
      inserted: isDryRun ? null : totalInserted,
      updated: isDryRun ? null : totalUpdated,
      reactivated: 0,
      failed: isDryRun ? null : totalFailed,
      failedDistricts: allFailedDistricts,
      anomalies: allAnomalies,
      missingStats: allMissingStats,
      familySourceAfter: isDryRun ? null : final.familySourceAfter,
      postWriteValidation: isDryRun
        ? null
        : {
            duplicateStoreIds: final.duplicateStoreIds,
            missingCoordinates: final.missingCoordinates,
            missingPhone: final.missingPhone,
            missingAddress: final.missingAddress,
          },
      cityReports,
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("\n[F5-3] ========================================");
    console.log(`[F5-3] officialRaw    : ${totalOfficialRaw}`);
    console.log(`[F5-3] officialDeduped: ${totalOfficialDeduped}`);
    if (!isDryRun) {
      console.log(`[F5-3] familyBefore   : ${globalBaseline.familyBefore}`);
      console.log(`[F5-3] familyAfter    : ${final.familyAfter}`);
      console.log(`[F5-3] deactivated    : ${totalDeactivated}`);
      console.log(`[F5-3] inserted       : ${totalInserted}`);
      console.log(`[F5-3] updated        : ${totalUpdated}`);
    } else {
      console.log(`[F5-3] expectedFamilyAfter: ${report.expectedFamilyAfter}`);
    }
    console.log(`[F5-3] report: ${REPORT_PATH}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[F5-3] Fatal:", e.message);
  process.exit(1);
});
