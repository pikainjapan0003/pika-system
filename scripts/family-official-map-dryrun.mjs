/**
 * FamilyMart F5-2: 官方 Map 全台 dry-run
 *
 * 此工具只做資料研究 / dry-run，不建立物流單，不串 ECPay，不串全家物流 API，不寫 DB。
 *
 * 使用方式（從 workspace root）：
 *   node scripts/family-official-map-dryrun.mjs --all-cities --delay 1000 --report data/cvs/family-official-allcities-dryrun-stepf52.json
 *   node scripts/family-official-map-dryrun.mjs --city 台北市 --delay 1000
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
const delayMs = parseInt(getArg("--delay") ?? "1000", 10);
const reportArg = getArg("--report");
const progressArg =
  getArg("--progress") ??
  path.join(
    WORKSPACE_ROOT,
    "data/cvs/family-official-map-progress-stepf52.json",
  );

const DEFAULT_REPORT = path.join(
  WORKSPACE_ROOT,
  "data/cvs/family-official-allcities-dryrun-stepf52.json",
);
const REPORT_PATH = reportArg
  ? path.isAbsolute(reportArg)
    ? reportArg
    : path.resolve(WORKSPACE_ROOT, reportArg)
  : DEFAULT_REPORT;
const PROGRESS_PATH = path.isAbsolute(progressArg)
  ? progressArg
  : path.resolve(WORKSPACE_ROOT, progressArg);

if (!allCities && !cityArg) {
  console.error("用法: --all-cities 或 --city <縣市>");
  process.exit(1);
}

// ── 全台行政區 fallback ───────────────────────────────────────────────────────
const CITY_DISTRICTS_PATH = path.join(
  WORKSPACE_ROOT,
  "data/cvs/taiwan-city-districts.json",
);
const cityDistrictsFallback = JSON.parse(
  fs.readFileSync(CITY_DISTRICTS_PATH, "utf8"),
);
// 轉換成 { 台北市: [{city,district}, ...], ... }
const fallbackMap = {};
for (const r of cityDistrictsFallback) {
  if (!fallbackMap[r.city]) fallbackMap[r.city] = [];
  fallbackMap[r.city].push(r);
}
const ALL_CITIES = [
  ...new Set(cityDistrictsFallback.map((r) => r.city)),
].sort();

// ── 目前 DB family 統計（只 SELECT）───────────────────────────────────────────
async function queryDbStats() {
  if (!process.env.DATABASE_URL) {
    console.warn("[DB] DATABASE_URL 未設定，跳過 DB 比對");
    return {
      total: 0,
      byCity: {},
      storeIds: new Set(),
      nameAddrSet: new Set(),
    };
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });
  try {
    const [cntRes, storeRes] = await Promise.all([
      pool.query(
        "SELECT city, COUNT(*) as cnt FROM cvs_stores WHERE provider='family' AND is_active=true GROUP BY city",
      ),
      pool.query(
        "SELECT store_id, store_name, store_address, city, district FROM cvs_stores WHERE provider='family' AND is_active=true",
      ),
    ]);
    const byCity = {};
    let total = 0;
    for (const r of cntRes.rows) {
      byCity[r.city] = parseInt(r.cnt);
      total += parseInt(r.cnt);
    }
    const storeIds = new Set(storeRes.rows.map((r) => r.store_id));
    const nameAddrSet = new Set(
      storeRes.rows.map(
        (r) => normalizeStr(r.store_name) + "|" + normalizeStr(r.store_address),
      ),
    );
    return { total, byCity, storeIds, nameAddrSet };
  } finally {
    await pool.end();
  }
}

function normalizeStr(s) {
  if (!s) return "";
  return s.replace(/[^一-龥a-zA-Z0-9]/g, "").toLowerCase();
}

// ── 工具函數 ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, headers, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (i < retries) {
          await sleep(2000);
          continue;
        }
        return null;
      }
      return await res.text();
    } catch (e) {
      if (i < retries) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

// 取得官方 API key（只在記憶體使用，不輸出、不寫入任何檔案）
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

// ShowTownList：取得某縣市的行政區列表
async function fetchTownList(city, key) {
  const url = `https://api.map.com.tw/net/familyShop.aspx?searchType=ShowTownList&type=&city=${encodeURIComponent(city)}&fun=storeTownList&key=${key}`;
  const raw = await fetchWithRetry(url, BASE_HEADERS);
  if (!raw || raw.includes("DOCTYPE")) return null;
  const match = raw.match(/storeTownList\(\s*(\[[\s\S]*\])\s*\)/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data.map((r) => ({
      city: r.city || city,
      district: r.town,
      post: r.post,
    }));
  } catch {
    return null;
  }
}

// ShopList：取得某縣市/行政區的門市列表
async function fetchShopList(city, district, key) {
  const url = `https://api.map.com.tw/net/familyShop.aspx?searchType=ShopList&type=&city=${encodeURIComponent(city)}&area=${encodeURIComponent(district)}&road=&fun=showStoreList&key=${key}`;
  const raw = await fetchWithRetry(url, BASE_HEADERS);
  if (!raw || raw.includes("DOCTYPE") || raw.includes("ERROR")) return null;
  // JSONP: showStoreList([...])
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

// 驗證座標合理性
function checkCoord(lon, lat) {
  if (lon == null || lat == null) return false;
  const lonN = parseFloat(lon);
  const latN = parseFloat(lat);
  if (isNaN(lonN) || isNaN(latN)) return false;
  // 台灣範圍（含離島）：lon 118~122.5, lat 21~26.5
  if (lonN < 118 || lonN > 122.5) return false;
  if (latN < 21 || latN > 26.5) return false;
  return true;
}

// 官方資料轉 normalized store 格式
function normalizeStore(raw, city, district) {
  const lon = raw.px != null ? parseFloat(raw.px) : null;
  const lat = raw.py != null ? parseFloat(raw.py) : null;
  return {
    provider: "family",
    officialStoreId: raw.pkey ?? null,
    storeId: raw.pkey ? `family-${raw.pkey}` : null,
    storeName: raw.NAME ?? null,
    storeAddress: raw.addr ?? null,
    phone: raw.TEL ?? null,
    postalCode: raw.post ?? null,
    city,
    district,
    longitude: lon,
    latitude: lat,
    source: "family_official_map",
    serviceId: raw.SERID != null ? String(raw.SERID) : null,
    oldPkey: raw.oldpkey ?? null,
    services: raw.all
      ? raw.all
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    roadName: raw.road ?? null,
  };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("[F5-2] 官方全家 Map 全台 dry-run 開始");
  console.log(`[F5-2] delay=${delayMs}ms | report=${REPORT_PATH}`);

  // 載入 progress（resume 用）
  let progress = { completedDistricts: [] };
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"));
      console.log(
        `[F5-2] 恢復進度：已完成 ${progress.completedDistricts.length} 區`,
      );
    } catch {
      progress = { completedDistricts: [] };
    }
  }
  const completedSet = new Set(progress.completedDistricts);

  // 取得目標縣市
  const targetCities = allCities ? ALL_CITIES : [cityArg];
  console.log(`[F5-2] 目標縣市：${targetCities.join(", ")}`);

  // DB 統計（只 SELECT）
  console.log("[F5-2] 查詢 DB 目前 family 統計...");
  const dbStats = await queryDbStats();
  console.log(`[F5-2] DB family 總計：${dbStats.total}`);

  // 取得官方 key（記憶體only）
  console.log("[F5-2] 取得官方 API key...");
  const key = await getOfficialKey();
  console.log("[F5-2] key 取得成功（不輸出）");

  // 結果收集
  const allStores = [];
  const cityReports = [];
  const districtReports = [];
  const failedDistricts = [];
  const anomalies = [];

  for (const city of targetCities) {
    console.log(`\n[F5-2] === ${city} ===`);
    await sleep(delayMs);

    // 取得行政區列表
    let districts = null;
    const townListRaw = await fetchTownList(city, key);
    if (townListRaw && townListRaw.length > 0) {
      districts = townListRaw;
      console.log(`[F5-2]   ShowTownList OK: ${districts.length} 區`);
    } else {
      // fallback
      districts = fallbackMap[city] || [];
      console.log(
        `[F5-2]   ShowTownList 失敗，fallback: ${districts.length} 區`,
      );
      anomalies.push({ type: "ShowTownList_failed", city });
    }

    const cityStores = [];
    const cityFailedDistricts = [];

    for (const d of districts) {
      const district = d.district ?? d;
      const distKey = `${city}|${district}`;

      if (completedSet.has(distKey)) {
        console.log(`[F5-2]   跳過（已完成）: ${district}`);
        continue;
      }

      await sleep(delayMs);
      const raw = await fetchShopList(city, district, key);

      if (raw === null) {
        console.log(`[F5-2]   失敗: ${city} ${district}`);
        cityFailedDistricts.push({ city, district });
        failedDistricts.push({ city, district });
        continue;
      }

      const stores = raw.map((s) => normalizeStore(s, city, district));

      // 欄位缺失與座標異常統計
      let missingPhone = 0,
        missingAddr = 0,
        missingCoord = 0,
        missingPostal = 0;
      for (const s of stores) {
        if (!s.phone) missingPhone++;
        if (!s.storeAddress) missingAddr++;
        if (!s.postalCode) missingPostal++;
        if (!checkCoord(s.longitude, s.latitude)) {
          missingCoord++;
          anomalies.push({
            type: "bad_coord",
            city,
            district,
            pkey: s.officialStoreId,
            name: s.storeName,
            px: s.longitude,
            py: s.latitude,
          });
        }
      }

      const dbDistCount = 0; // 行政區層級不容易快速比對，城市層級比對
      districtReports.push({
        city,
        district,
        officialRaw: stores.length,
        officialDeduped: stores.length,
        currentDbFamily: null, // 後面城市層級填
        estimatedNew: null,
        missingPhone,
        missingAddress: missingAddr,
        missingPostalCode: missingPostal,
        missingCoordinates: missingCoord,
        sample: stores.slice(0, 2).map((s) => ({
          pkey: s.officialStoreId,
          name: s.storeName,
          addr: s.storeAddress,
          phone: s.phone,
          postal: s.postalCode,
          lon: s.longitude,
          lat: s.latitude,
        })),
      });

      cityStores.push(...stores);
      completedSet.add(distKey);

      // 寫進度
      progress.completedDistricts = [...completedSet];
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));

      console.log(`[F5-2]   ${city} ${district}: ${stores.length} 店`);
    }

    // 城市去重（以 pkey 為主鍵）
    const seenPkeys = new Set();
    const dedupedCityStores = [];
    for (const s of cityStores) {
      const key_ = s.officialStoreId ?? s.storeName + s.storeAddress;
      if (!seenPkeys.has(key_)) {
        seenPkeys.add(key_);
        dedupedCityStores.push(s);
      }
    }

    const dbCityCount = dbStats.byCity[city] ?? 0;
    cityReports.push({
      city,
      officialRaw: cityStores.length,
      officialDeduped: dedupedCityStores.length,
      currentDbFamily: dbCityCount,
      estimatedNew: Math.max(0, dedupedCityStores.length - dbCityCount),
      districtCount: districts.length,
      failedDistrictCount: cityFailedDistricts.length,
    });

    allStores.push(...dedupedCityStores);
    console.log(
      `[F5-2] ${city} 小計: raw=${cityStores.length}, deduped=${dedupedCityStores.length}, DB=${dbCityCount}`,
    );
  }

  // 全台去重
  const globalSeen = new Set();
  const dedupedAll = [];
  const duplicates = [];
  for (const s of allStores) {
    const k = s.officialStoreId ?? s.storeName + s.storeAddress;
    if (!globalSeen.has(k)) {
      globalSeen.add(k);
      dedupedAll.push(s);
    } else {
      duplicates.push({
        pkey: s.officialStoreId,
        name: s.storeName,
        city: s.city,
        district: s.district,
      });
    }
  }

  // missingStats
  let missingOfficialStoreId = 0,
    missingName = 0,
    missingAddress = 0;
  let missingPhone = 0,
    missingPostalCode = 0,
    missingCity = 0,
    missingDistrict = 0,
    missingCoordinates = 0;
  for (const s of dedupedAll) {
    if (!s.officialStoreId) missingOfficialStoreId++;
    if (!s.storeName) missingName++;
    if (!s.storeAddress) missingAddress++;
    if (!s.phone) missingPhone++;
    if (!s.postalCode) missingPostalCode++;
    if (!s.city) missingCity++;
    if (!s.district) missingDistrict++;
    if (!checkCoord(s.longitude, s.latitude)) missingCoordinates++;
  }

  // 與 DB 比對（name+address 近似）
  let matchedByNameAddr = 0;
  for (const s of dedupedAll) {
    const k = normalizeStr(s.storeName) + "|" + normalizeStr(s.storeAddress);
    if (dbStats.nameAddrSet.has(k)) matchedByNameAddr++;
  }

  // 估算 insertable（官方有、DB 沒有）
  const estimatedInsertable = dedupedAll.length - matchedByNameAddr;
  const estimatedUpdatable = matchedByNameAddr;

  // 更新 districtReports 的 currentDbFamily（城市層級近似）
  for (const dr of districtReports) {
    dr.currentDbFamily = dbStats.byCity[dr.city] ?? 0; // 城市層級，非行政區層級
  }

  // 組 report
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "official-map-allcities-dry-run",
    provider: "family",
    source: "family_official_map",
    totalRaw: allStores.length,
    totalDeduped: dedupedAll.length,
    cityCount: targetCities.length,
    districtCount: districtReports.length,
    cityReports,
    districtReports,
    duplicates: duplicates.slice(0, 50),
    duplicateCount: duplicates.length,
    anomalies: anomalies.slice(0, 100),
    anomalyCount: anomalies.length,
    failedDistricts,
    failedDistrictCount: failedDistricts.length,
    missingStats: {
      missingOfficialStoreId,
      missingName,
      missingAddress,
      missingPhone,
      missingPostalCode,
      missingCity,
      missingDistrict,
      missingCoordinates,
    },
    comparisonWithCurrentDb: {
      familyDbBefore: dbStats.total,
      officialDeduped: dedupedAll.length,
      matchedByNameAddr,
      estimatedInsertable,
      estimatedUpdatable,
      estimatedFinalFamilyCount: dbStats.total + estimatedInsertable,
    },
    samples: dedupedAll.slice(0, 5).map((s) => ({
      pkey: s.officialStoreId,
      storeId: s.storeId,
      name: s.storeName,
      addr: s.storeAddress,
      phone: s.phone,
      postal: s.postalCode,
      city: s.city,
      district: s.district,
      lon: s.longitude,
      lat: s.latitude,
      services: s.services,
    })),
    officialEndpointNote: {
      shopListEndpoint: "https://api.map.com.tw/net/familyShop.aspx",
      params:
        "searchType=ShopList&type=&city=<縣市>&area=<行政區>&road=&fun=showStoreList&key=***REDACTED***",
      townListEndpoint: "https://api.map.com.tw/net/familyShop.aspx",
      townListParams:
        "searchType=ShowTownList&type=&city=<縣市>&fun=storeTownList&key=***REDACTED***",
      note: "key 已遮蔽，不記錄於 report",
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n[F5-2] ========================================`);
  console.log(`[F5-2] 完成！`);
  console.log(`[F5-2] totalRaw       : ${report.totalRaw}`);
  console.log(`[F5-2] totalDeduped   : ${report.totalDeduped}`);
  console.log(`[F5-2] failedDistricts: ${report.failedDistrictCount}`);
  console.log(`[F5-2] duplicates     : ${report.duplicateCount}`);
  console.log(`[F5-2] anomalies      : ${report.anomalyCount}`);
  console.log(`[F5-2] DB before      : ${dbStats.total}`);
  console.log(
    `[F5-2] estimatedNew   : ${report.comparisonWithCurrentDb.estimatedInsertable}`,
  );
  console.log(
    `[F5-2] estimatedFinal : ${report.comparisonWithCurrentDb.estimatedFinalFamilyCount}`,
  );
  console.log(`[F5-2] report         : ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error("[F5-2] 致命錯誤:", e.message);
  process.exit(1);
});
