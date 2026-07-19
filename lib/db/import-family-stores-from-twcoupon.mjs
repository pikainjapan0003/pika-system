/**
 * FamilyMart Step F2/F3: twcoupon 全家門市 dry-run / DB upsert 工具
 *
 * 此工具只用於門市資料研究 / dry-run，不建立正式物流單，不串 ECPay，不串全家物流 API。
 *
 * 使用方式（dry-run，不寫 DB）：
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 台北市 --district 大安區
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 新北市 --district 板橋區
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 高雄市 --district 鳳山區
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 連江縣 --district 南竿鄉
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 台北市
 *   node scripts/import-family-stores-from-twcoupon.mjs --list-cities
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --limit-cities 3 --delay 1000
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --only-city 連江縣 --report data/cvs/family-f2.json
 *
 * 使用方式（DB upsert，需 DATABASE_URL）：
 *   node scripts/import-family-stores-from-twcoupon.mjs --upsert --city 台北市 --district 大安區
 *   node scripts/import-family-stores-from-twcoupon.mjs --upsert --city 新北市 --district 板橋區
 *   node scripts/import-family-stores-from-twcoupon.mjs --upsert --city 連江縣 --district 南竿鄉
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}
function hasFlag(flag) {
  return args.includes(flag);
}

const dryRun = hasFlag("--dry-run");
const upsertMode = hasFlag("--upsert");
const cityArg = getArg("--city");
const districtArg = getArg("--district");
const onlyCityArg = getArg("--only-city"); // alias: single city from main page
const limitCitiesRaw = getArg("--limit-cities");
const limitCities =
  limitCitiesRaw != null ? parseInt(limitCitiesRaw, 10) : Infinity;
const listCities = hasFlag("--list-cities");
const delayMs = parseInt(getArg("--delay") ?? "1000", 10);
const reportArgRaw = getArg("--report");

const TWCOUPON_BASE = "https://twcoupon.com";
const MAIN_PAGE_URL = `${TWCOUPON_BASE}/brandshop-%e5%85%a8%e5%ae%b6%e4%be%bf%e5%88%a9%e5%95%86%e5%ba%97-%e9%9b%bb%e8%a9%b1-%e5%9c%b0%e5%9d%80.html`;
const BRAND_URL_FRAG = "%e5%85%a8%e5%ae%b6%e4%be%bf%e5%88%a9%e5%95%86%e5%ba%97"; // 全家便利商店

// Default report path: data/cvs/ relative to workspace root
const WORKSPACE_ROOT = path.resolve(__dir, "../../");
const DEFAULT_REPORT_PATH = path.join(
  WORKSPACE_ROOT,
  "data/cvs/family-twcoupon-research-stepf2.json",
);
const REPORT_PATH = reportArgRaw
  ? path.isAbsolute(reportArgRaw)
    ? reportArgRaw
    : path.resolve(WORKSPACE_ROOT, reportArgRaw)
  : DEFAULT_REPORT_PATH;

// Validate: must specify mode
if (!dryRun && !upsertMode && !listCities) {
  console.error("Error: --dry-run or --upsert is required.");
  console.error(
    "Usage: node scripts/import-family-stores-from-twcoupon.mjs --dry-run [--city X] [--district Y]",
  );
  console.error(
    "       node scripts/import-family-stores-from-twcoupon.mjs --upsert --city X --district Y",
  );
  process.exit(1);
}

// Upsert mode: require --city and --district, OR explicit --limit-cities for full upsert
const upsertAllMode =
  upsertMode && limitCitiesRaw != null && !cityArg && !districtArg;
if (upsertMode && !upsertAllMode && (!cityArg || !districtArg)) {
  console.error(
    "Error: --upsert requires --city and --district to limit scope.",
  );
  console.error("Example: --upsert --city 台北市 --district 大安區");
  console.error("For full upsert: --upsert --limit-cities 22");
  process.exit(1);
}

// DB pool: only created in upsert mode
let pool = null;
if (upsertMode) {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL must be set for --upsert mode");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── URL construction ──────────────────────────────────────────────────────────
function encodeChineseName(name) {
  return encodeURIComponent(name).toLowerCase();
}

function buildCityUrl(city) {
  const c = encodeChineseName(city);
  const phone = encodeChineseName("電話");
  const addr = encodeChineseName("地址");
  return `${TWCOUPON_BASE}/brandshopcity-${BRAND_URL_FRAG}-${c}-${phone}-${addr}.html`;
}

function buildDistrictUrl(city, district) {
  const c = encodeChineseName(city);
  const d = encodeChineseName(district);
  const phone = encodeChineseName("電話");
  const addr = encodeChineseName("地址");
  return `${TWCOUPON_BASE}/brandshoparea-${BRAND_URL_FRAG}-${c}-${d}-${phone}-${addr}.html`;
}

function extractCityNameFromUrl(url) {
  const decoded = decodeURIComponent(url);
  // brandshopcity-全家便利商店-{city}-電話-地址.html
  const m = decoded.match(/brandshopcity-全家便利商店-(.+?)-電話-地址/);
  return m ? m[1] : decoded;
}

function extractDistrictNameFromUrl(url) {
  const decoded = decodeURIComponent(url);
  // brandshoparea-全家便利商店-{city}-{district}-電話-地址.html
  const m = decoded.match(/brandshoparea-全家便利商店-.+?-(.+?)-電話-地址/);
  return m ? m[1] : decoded;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-TW,zh;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return resp.text();
}

// ── twcoupon link extraction ──────────────────────────────────────────────────
function extractCityLinksFromMain(html) {
  const links = [];
  const re = new RegExp(`href="(brandshopcity-${BRAND_URL_FRAG}[^"]+)"`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = `${TWCOUPON_BASE}/${m[1]}`;
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

function extractAreaLinksFromCityPage(html) {
  const links = [];
  const re = new RegExp(`href="(brandshoparea-${BRAND_URL_FRAG}[^"]+)"`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = `${TWCOUPON_BASE}/${m[1]}`;
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

// ── store parsing ─────────────────────────────────────────────────────────────
function parseStoresFromHtml(html, sourceUrl) {
  const stores = [];
  const blockRe =
    /<li\s+class="name">([^<]+)<\/li>\s*<li><em>地址：<\/em>([^<]+)<\/li>\s*<li><em>電話：<\/em>([^<]*)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    stores.push({
      storeName: m[1].trim(),
      rawAddress: m[2].trim(),
      phone: m[3].trim() || null,
      sourceUrl,
    });
  }
  return stores;
}

// ── address normalization ─────────────────────────────────────────────────────
function parseAddress(rawAddress) {
  if (!rawAddress)
    return {
      postalCode: null,
      storeAddress: rawAddress,
      city: null,
      district: null,
    };

  let address = rawAddress.trim();
  let postalCode = null;

  // Extract leading 3~6 digit postal code
  const postalMatch = address.match(/^(\d{3,6})/);
  if (postalMatch) {
    postalCode = postalMatch[1].slice(0, 3);
    address = address.slice(postalMatch[1].length).trim();
  }

  // Extract city (ends with 市 or 縣)
  let city = null;
  const cityMatch = address.match(/^(.{2,4}?[市縣])/);
  if (cityMatch) city = cityMatch[1];

  // Extract district (ends with 區/鄉/鎮/市, after city)
  let district = null;
  const districtMatch = address.match(/[市縣](.{1,5}?[區鄉鎮市])/);
  if (districtMatch) district = districtMatch[1];

  return { postalCode, storeAddress: address, city, district };
}

// ── store ID generation ───────────────────────────────────────────────────────
function generateStoreId(storeName, storeAddress) {
  const normalized = storeAddress.trim() + "|" + storeName.trim();
  const hash = crypto
    .createHash("sha1")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `family-${hash}`;
}

// ── store enrichment ──────────────────────────────────────────────────────────
function enrichStore(raw) {
  const { postalCode, storeAddress, city, district } = parseAddress(
    raw.rawAddress,
  );
  const generatedStoreId = generateStoreId(
    raw.storeName,
    storeAddress || raw.rawAddress,
  );

  return {
    provider: "family",
    generatedStoreId,
    storeName: raw.storeName,
    storeAddress: storeAddress || raw.rawAddress,
    phone: raw.phone,
    postalCode,
    city,
    district,
    source: "twcoupon_family",
    sourceUrl: raw.sourceUrl,
  };
}

// ── deduplication ─────────────────────────────────────────────────────────────
function deduplicateStores(stores) {
  const seen = new Map();
  const duplicates = [];
  for (const s of stores) {
    const key = s.storeName + "|" + s.storeAddress;
    if (seen.has(key)) {
      duplicates.push({
        storeName: s.storeName,
        storeAddress: s.storeAddress,
        duplicateOf: seen.get(key).generatedStoreId,
      });
    } else {
      seen.set(key, s);
    }
  }
  return { deduped: [...seen.values()], duplicates };
}

function findIdDuplicates(stores) {
  const idCount = new Map();
  for (const s of stores) {
    idCount.set(s.generatedStoreId, (idCount.get(s.generatedStoreId) ?? 0) + 1);
  }
  return stores.filter((s) => (idCount.get(s.generatedStoreId) ?? 0) > 1);
}

// ── district-level fetch ──────────────────────────────────────────────────────
async function fetchAndParseDistrict(districtUrl, city, district) {
  console.log(`    行政區頁：${decodeURIComponent(districtUrl)}`);
  let html;
  try {
    html = await fetchHtml(districtUrl);
  } catch (err) {
    console.log(`    [ERROR] 抓取失敗：${err.message}`);
    return { rawStores: [], error: err.message };
  }
  const rawStores = parseStoresFromHtml(html, districtUrl);
  console.log(`    解析到 ${rawStores.length} 筆`);
  return { rawStores, error: null };
}

// ── city-level collection ─────────────────────────────────────────────────────
async function collectFromCity(cityName, targetDistrict) {
  const cityUrl = buildCityUrl(cityName);
  console.log(`  抓取縣市頁：${cityName} (${decodeURIComponent(cityUrl)})`);

  let cityHtml;
  try {
    cityHtml = await fetchHtml(cityUrl);
  } catch (err) {
    console.log(`  [ERROR] 縣市頁抓取失敗：${err.message}`);
    return { districtReports: [], error: err.message };
  }

  // Inline stores on city page (some cities have stores directly without district sub-pages)
  const cityInlineRaw = parseStoresFromHtml(cityHtml, cityUrl);
  if (cityInlineRaw.length > 0) {
    console.log(`    城市頁 inline：${cityInlineRaw.length} 筆`);
  }

  // District sub-pages
  const areaLinks = extractAreaLinksFromCityPage(cityHtml);
  console.log(`    發現 ${areaLinks.length} 個行政區頁`);

  const districtReports = [];

  // If targetDistrict specified, only process that one
  let linksToProcess = areaLinks;
  if (targetDistrict) {
    const targetUrl = buildDistrictUrl(cityName, targetDistrict);
    // Check if it's in the discovered links; if not, still try it directly
    const found = areaLinks.find((u) => {
      const d = extractDistrictNameFromUrl(u);
      return d === targetDistrict;
    });
    if (found) {
      linksToProcess = [found];
    } else {
      // Try building the URL directly (some cities may have different link format)
      console.log(
        `    [INFO] 主頁未找到 ${targetDistrict} 連結，嘗試直接建構 URL`,
      );
      linksToProcess = [targetUrl];
    }
  }

  // If no area links and no target district, treat city page itself as single district
  if (areaLinks.length === 0 && !targetDistrict) {
    const enriched = cityInlineRaw.map(enrichStore);
    const { deduped, duplicates } = deduplicateStores(enriched);
    const report = buildDistrictReport(
      cityName,
      cityName,
      cityUrl,
      enriched,
      deduped,
      duplicates,
    );
    return { districtReports: [report], error: null };
  }

  let firstDistrict = true;
  for (const areaUrl of linksToProcess) {
    if (!firstDistrict) await sleep(delayMs);
    firstDistrict = false;

    const districtName = extractDistrictNameFromUrl(areaUrl);
    const { rawStores, error } = await fetchAndParseDistrict(
      areaUrl,
      cityName,
      districtName,
    );

    if (error) {
      districtReports.push({
        city: cityName,
        district: districtName,
        url: areaUrl,
        rawCount: 0,
        dedupedCount: 0,
        missingPhone: 0,
        missingAddress: 0,
        missingDistrict: 0,
        duplicateCount: 0,
        sample: [],
        error,
      });
      continue;
    }

    const enriched = rawStores.map(enrichStore);
    const { deduped, duplicates } = deduplicateStores(enriched);
    const report = buildDistrictReport(
      cityName,
      districtName,
      areaUrl,
      enriched,
      deduped,
      duplicates,
    );
    districtReports.push(report);
  }

  // If there were inline city stores and no target district, include them
  if (!targetDistrict && cityInlineRaw.length > 0 && areaLinks.length > 0) {
    const enriched = cityInlineRaw.map(enrichStore);
    const { deduped, duplicates } = deduplicateStores(enriched);
    const report = buildDistrictReport(
      cityName,
      `${cityName}(city-inline)`,
      cityUrl,
      enriched,
      deduped,
      duplicates,
    );
    districtReports.push(report);
  }

  return { districtReports, error: null };
}

function buildDistrictReport(
  city,
  district,
  url,
  enriched,
  deduped,
  duplicates,
) {
  const missingPhone = enriched.filter((s) => !s.phone).length;
  const missingAddress = enriched.filter((s) => !s.storeAddress).length;
  const missingDistrict = enriched.filter((s) => !s.district).length;
  const missingPostalCode = enriched.filter((s) => !s.postalCode).length;

  const anomalies = [];
  if (missingPhone > 0)
    anomalies.push({ type: "missing_phone", count: missingPhone });
  if (missingAddress > 0)
    anomalies.push({ type: "missing_address", count: missingAddress });
  if (missingDistrict > 0)
    anomalies.push({ type: "missing_district", count: missingDistrict });
  if (missingPostalCode > 0)
    anomalies.push({ type: "missing_postal_code", count: missingPostalCode });

  return {
    city,
    district,
    url,
    rawCount: enriched.length,
    dedupedCount: deduped.length,
    missingPhone,
    missingAddress,
    missingDistrict,
    missingPostalCode,
    duplicateCount: duplicates.length,
    anomalies,
    sample: deduped.slice(0, 5),
    stores: deduped,
  };
}

// ── report output ─────────────────────────────────────────────────────────────
function saveReport(report, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n[report] 已儲存：${filePath}`);
}

// ── main modes ────────────────────────────────────────────────────────────────
async function runListCities() {
  console.log("全家 twcoupon — 縣市清單（--list-cities）\n");
  const html = await fetchHtml(MAIN_PAGE_URL);
  const cityUrls = extractCityLinksFromMain(html);
  console.log(`發現 ${cityUrls.length} 個縣市頁：\n`);
  cityUrls.forEach((url, i) => {
    const name = extractCityNameFromUrl(url);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${name}  ${decodeURIComponent(url)}`,
    );
  });
  console.log(`\n共 ${cityUrls.length} 個縣市`);
}

async function runDryRun() {
  console.log("═".repeat(60));
  console.log("全家 twcoupon 門市資料研究 — dry-run 模式");
  console.log("此工具只用於門市資料研究，不建立物流單，不串 ECPay。");
  console.log("═".repeat(60));
  console.log(`delay：${delayMs}ms`);
  if (cityArg) {
    if (districtArg) {
      console.log(`模式：單行政區  city=${cityArg}  district=${districtArg}`);
    } else {
      console.log(`模式：單縣市  city=${cityArg}`);
    }
  } else if (onlyCityArg) {
    console.log(`模式：--only-city  city=${onlyCityArg}`);
  } else {
    const limitLabel =
      limitCities < Infinity ? `最多 ${limitCities} 個縣市` : "全部縣市";
    console.log(`模式：主頁全縣市（${limitLabel}）`);
  }
  console.log("[DRY-RUN] 不會寫入 DB\n");

  const reportData = {
    generatedAt: new Date().toISOString(),
    provider: "family",
    mode: "dry-run",
    source: "twcoupon",
    totalRaw: 0,
    totalDeduped: 0,
    cities: [],
    districtReports: [],
    duplicates: [],
    anomalies: [],
    samples: [],
  };

  let citiesToProcess = [];

  if (cityArg) {
    citiesToProcess = [cityArg];
  } else if (onlyCityArg) {
    citiesToProcess = [onlyCityArg];
  } else {
    // Fetch main page to get city list
    console.log("抓取主頁縣市清單...");
    const mainHtml = await fetchHtml(MAIN_PAGE_URL);
    const cityUrls = extractCityLinksFromMain(mainHtml);
    console.log(`發現 ${cityUrls.length} 個縣市\n`);
    citiesToProcess = cityUrls
      .slice(0, limitCities < Infinity ? limitCities : cityUrls.length)
      .map(extractCityNameFromUrl);
  }

  let allStores = [];

  for (let ci = 0; ci < citiesToProcess.length; ci++) {
    const cityName = citiesToProcess[ci];
    console.log(`\n${"─".repeat(50)}`);
    console.log(`[${ci + 1}/${citiesToProcess.length}] ${cityName}`);
    console.log("─".repeat(50));

    if (ci > 0) await sleep(delayMs);

    const { districtReports, error } = await collectFromCity(
      cityName,
      districtArg ?? null,
    );

    if (error) {
      console.log(`  [ERROR] ${cityName} 失敗：${error}`);
      reportData.cities.push({ city: cityName, status: "error", error });
      continue;
    }

    let cityTotal = 0;
    for (const dr of districtReports) {
      reportData.districtReports.push({
        city: dr.city,
        district: dr.district,
        url: dr.url,
        rawCount: dr.rawCount,
        dedupedCount: dr.dedupedCount,
        missingPhone: dr.missingPhone,
        missingAddress: dr.missingAddress,
        missingDistrict: dr.missingDistrict,
        missingPostalCode: dr.missingPostalCode ?? 0,
        duplicateCount: dr.duplicateCount,
        anomalies: dr.anomalies,
        sample: dr.sample,
        ...(dr.error ? { error: dr.error } : {}),
      });

      cityTotal += dr.dedupedCount;
      allStores.push(...(dr.stores || []));

      if (dr.duplicates && dr.duplicates.length > 0) {
        reportData.duplicates.push(...dr.duplicates);
      }
      if (dr.anomalies && dr.anomalies.length > 0) {
        for (const a of dr.anomalies) {
          reportData.anomalies.push({
            city: dr.city,
            district: dr.district,
            ...a,
          });
        }
      }
    }

    const cityStores = districtReports.flatMap((dr) => dr.stores || []);
    const cityMissingPhone = cityStores.filter((s) => !s.phone).length;
    const cityMissingAddress = cityStores.filter((s) => !s.storeAddress).length;
    const cityMissingDistrict = cityStores.filter((s) => !s.district).length;
    const cityMissingPostalCode = cityStores.filter(
      (s) => !s.postalCode,
    ).length;
    const cityDupCount = districtReports.reduce(
      (sum, dr) => sum + dr.duplicateCount,
      0,
    );
    console.log(
      `  ${cityName} 合計：${cityTotal} 筆（行政區 ${districtReports.length} 個）`,
    );
    reportData.cities.push({
      city: cityName,
      districtCount: districtReports.length,
      storeCount: cityTotal,
      rawCount: districtReports.reduce((s, dr) => s + dr.rawCount, 0),
      dedupedCount: cityTotal,
      missingPhone: cityMissingPhone,
      missingAddress: cityMissingAddress,
      missingDistrict: cityMissingDistrict,
      missingPostalCode: cityMissingPostalCode,
      duplicateCount: cityDupCount,
    });
  }

  // Global dedup (cross-district)
  const { deduped: globalDeduped, duplicates: globalDups } =
    deduplicateStores(allStores);
  if (globalDups.length > 0) {
    reportData.duplicates.push(...globalDups);
    reportData.anomalies.push({
      type: "cross_district_duplicate",
      count: globalDups.length,
    });
  }

  const idDups = findIdDuplicates(globalDeduped);
  if (idDups.length > 0) {
    reportData.anomalies.push({
      type: "id_collision",
      count: idDups.length,
      detail: idDups.slice(0, 10).map((s) => s.generatedStoreId),
    });
  }

  reportData.totalRaw = allStores.length;
  reportData.totalDeduped = globalDeduped.length;
  reportData.cityCount = reportData.cities.length;
  reportData.districtCount = reportData.districtReports.length;
  reportData.samples = globalDeduped.slice(0, 20);

  // Global missing stats
  reportData.missingStats = {
    missingPhone: globalDeduped.filter((s) => !s.phone).length,
    missingAddress: globalDeduped.filter((s) => !s.storeAddress).length,
    missingCity: globalDeduped.filter((s) => !s.city).length,
    missingDistrict: globalDeduped.filter((s) => !s.district).length,
    missingPostalCode: globalDeduped.filter((s) => !s.postalCode).length,
  };

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("全家 twcoupon dry-run — 統計");
  console.log("═".repeat(60));
  console.log(`處理縣市：          ${citiesToProcess.length} 個`);
  console.log(`行政區：            ${reportData.districtReports.length} 個`);
  console.log(`門市（raw）：       ${reportData.totalRaw} 筆`);
  console.log(`門市（deduped）：   ${reportData.totalDeduped} 筆`);
  console.log(`重複記錄：          ${reportData.duplicates.length} 筆`);
  console.log(`異常：              ${reportData.anomalies.length} 項`);
  console.log(`missingPhone：      ${reportData.missingStats.missingPhone}`);
  console.log(`missingAddress：    ${reportData.missingStats.missingAddress}`);
  console.log(`missingCity：       ${reportData.missingStats.missingCity}`);
  console.log(`missingDistrict：   ${reportData.missingStats.missingDistrict}`);
  console.log(
    `missingPostalCode： ${reportData.missingStats.missingPostalCode}`,
  );
  if (reportData.cities.length > 0) {
    reportData.cities.forEach((c) => {
      console.log(
        `  ${c.city}：${c.storeCount ?? 0} 筆（${c.districtCount ?? 0} 個行政區）`,
      );
    });
  }
  console.log(`\n[DRY-RUN] 未寫入 DB。`);
  console.log("═".repeat(60));

  saveReport(reportData, REPORT_PATH);
  return reportData;
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertStore(store) {
  const result = await pool.query(
    `INSERT INTO cvs_stores
       (provider, store_id, store_name, store_address, store_phone, city, district,
        is_active, source, source_updated_at)
     VALUES ('family', $1, $2, $3, $4, $5, $6, true, 'twcoupon_family', now())
     ON CONFLICT (provider, store_id) DO UPDATE SET
       store_name = EXCLUDED.store_name,
       store_address = EXCLUDED.store_address,
       store_phone = EXCLUDED.store_phone,
       city = EXCLUDED.city,
       district = EXCLUDED.district,
       source = EXCLUDED.source,
       source_updated_at = EXCLUDED.source_updated_at,
       is_active = true,
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      store.generatedStoreId,
      store.storeName,
      store.storeAddress,
      store.phone ?? null,
      store.city ?? null,
      store.district ?? null,
    ],
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

async function countProvider(provider) {
  const r = await pool.query(
    "SELECT COUNT(*) AS cnt FROM cvs_stores WHERE provider = $1 AND is_active = true",
    [provider],
  );
  return parseInt(r.rows[0].cnt, 10);
}

async function runUpsert() {
  console.log("═".repeat(60));
  console.log("全家 twcoupon 門市資料 — DB upsert 模式");
  console.log("此工具只用於門市資料登記，不建立物流單，不串 ECPay。");
  console.log("═".repeat(60));
  console.log(`city：${cityArg}  district：${districtArg}`);
  console.log(`delay：${delayMs}ms\n`);

  const sevenBefore = await countProvider("seven");
  const familyBefore = await countProvider("family");
  console.log(`DB 寫入前 — seven: ${sevenBefore}，family: ${familyBefore}`);

  const { districtReports, error } = await collectFromCity(
    cityArg,
    districtArg,
  );
  if (error) throw new Error(`抓取失敗：${error}`);

  // Global dedup across districts (should be single district, but be safe)
  const allRaw = districtReports.flatMap((dr) => dr.stores || []);
  const { deduped: stores, duplicates } = deduplicateStores(allRaw);

  console.log(
    `\n抓取完成：raw ${allRaw.length} 筆，deduped ${stores.length} 筆`,
  );

  let inserted = 0,
    updated = 0,
    failed = 0;
  const failedList = [];

  for (let i = 0; i < stores.length; i++) {
    const s = stores[i];
    try {
      const action = await upsertStore(s);
      if (action === "inserted") inserted++;
      else updated++;
    } catch (err) {
      failed++;
      failedList.push({ storeName: s.storeName, error: err.message });
      console.error(`  [ERROR] upsert 失敗：${s.storeName} — ${err.message}`);
    }
  }

  const sevenAfter = await countProvider("seven");
  const familyAfter = await countProvider("family");
  await pool.end();

  console.log(
    `\nupsert 完成：inserted ${inserted}，updated ${updated}，failed ${failed}`,
  );
  console.log(`DB 寫入後 — seven: ${sevenAfter}，family: ${familyAfter}`);

  const missingPhone = stores.filter((s) => !s.phone).length;
  const missingAddress = stores.filter((s) => !s.storeAddress).length;
  const missingDistrict = stores.filter((s) => !s.district).length;

  const districtReport = {
    city: cityArg,
    district: districtArg,
    rawCount: allRaw.length,
    dedupedCount: stores.length,
    inserted,
    updated,
    failed,
    missingPhone,
    missingAddress,
    missingDistrict,
    sample: stores.slice(0, 5),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    provider: "family",
    mode: "upsert-small-scope",
    targets: [{ city: cityArg, district: districtArg }],
    totalRaw: allRaw.length,
    totalDeduped: stores.length,
    inserted,
    updated,
    failed,
    dbCounts: {
      familyBefore,
      familyAfter,
      sevenBefore,
      sevenAfter,
      sevenUnchanged: sevenBefore === sevenAfter,
    },
    districtReports: [districtReport],
    duplicates,
    anomalies:
      failedList.length > 0
        ? [
            {
              type: "upsert_failed",
              count: failedList.length,
              detail: failedList,
            },
          ]
        : [],
    samples: stores.slice(0, 10),
  };

  saveReport(report, REPORT_PATH);

  console.log("═".repeat(60));
  console.log(
    `[UPSERT] seven 筆數不變：${sevenBefore === sevenAfter ? "✓" : "✗（異常！）"}`,
  );
  console.log("═".repeat(60));

  return report;
}

// ── full-city upsert ──────────────────────────────────────────────────────────
async function runUpsertAll() {
  console.log("═".repeat(60));
  console.log("全家 twcoupon 門市資料 — DB upsert 全台模式");
  console.log("此工具只用於門市資料登記，不建立物流單，不串 ECPay。");
  console.log("═".repeat(60));
  const limitLabel =
    limitCities < Infinity ? `最多 ${limitCities} 個縣市` : "全部縣市";
  console.log(`模式：全台 upsert（${limitLabel}），delay：${delayMs}ms\n`);

  const sevenBefore = await countProvider("seven");
  const familyBefore = await countProvider("family");
  console.log(`DB 寫入前 — seven: ${sevenBefore}，family: ${familyBefore}`);

  console.log("\n抓取主頁縣市清單...");
  const mainHtml = await fetchHtml(MAIN_PAGE_URL);
  const cityUrls = extractCityLinksFromMain(mainHtml);
  const allCityNames = cityUrls
    .slice(0, limitCities < Infinity ? limitCities : cityUrls.length)
    .map(extractCityNameFromUrl);
  console.log(
    `發現 ${cityUrls.length} 個縣市，本次處理 ${allCityNames.length} 個\n`,
  );

  const reportData = {
    generatedAt: new Date().toISOString(),
    provider: "family",
    mode: "upsert-all-cities",
    totalRaw: 0,
    totalDeduped: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    dbCounts: {
      familyBefore,
      familyAfter: 0,
      sevenBefore,
      sevenAfter: 0,
      sevenUnchanged: false,
    },
    cities: [],
    districtReports: [],
    duplicates: [],
    anomalies: [],
    missingStats: {},
    errors: [],
    samples: [],
  };

  let allStores = [];

  for (let ci = 0; ci < allCityNames.length; ci++) {
    const cityName = allCityNames[ci];
    console.log(`\n${"─".repeat(50)}`);
    console.log(`[${ci + 1}/${allCityNames.length}] ${cityName}`);
    console.log("─".repeat(50));

    if (ci > 0) await sleep(delayMs);

    const { districtReports, error } = await collectFromCity(cityName, null);

    if (error) {
      console.log(`  [ERROR] ${cityName} 失敗：${error}`);
      reportData.cities.push({ city: cityName, status: "error", error });
      reportData.errors.push({ city: cityName, error });
      continue;
    }

    let cityRaw = 0;
    let cityDeduped = 0;
    for (const dr of districtReports) {
      cityRaw += dr.rawCount;
      cityDeduped += dr.dedupedCount;
      reportData.districtReports.push({
        city: dr.city,
        district: dr.district,
        rawCount: dr.rawCount,
        dedupedCount: dr.dedupedCount,
        missingPhone: dr.missingPhone,
        missingAddress: dr.missingAddress,
        missingDistrict: dr.missingDistrict,
        missingPostalCode: dr.missingPostalCode ?? 0,
        duplicateCount: dr.duplicateCount,
        anomalies: dr.anomalies,
        sample: dr.sample,
        ...(dr.error ? { error: dr.error } : {}),
      });
      if (dr.duplicates && dr.duplicates.length > 0)
        reportData.duplicates.push(...dr.duplicates);
      if (dr.anomalies && dr.anomalies.length > 0) {
        for (const a of dr.anomalies)
          reportData.anomalies.push({
            city: dr.city,
            district: dr.district,
            ...a,
          });
      }
    }

    const cityStores = districtReports.flatMap((dr) => dr.stores || []);
    allStores.push(...cityStores);

    console.log(
      `  ${cityName} 合計：${cityDeduped} 筆（行政區 ${districtReports.length} 個）`,
    );
    reportData.cities.push({
      city: cityName,
      districtCount: districtReports.length,
      storeCount: cityDeduped,
      rawCount: cityRaw,
      dedupedCount: cityDeduped,
      missingPhone: cityStores.filter((s) => !s.phone).length,
      missingAddress: cityStores.filter((s) => !s.storeAddress).length,
      missingDistrict: cityStores.filter((s) => !s.district).length,
      missingPostalCode: cityStores.filter((s) => !s.postalCode).length,
      duplicateCount: districtReports.reduce(
        (sum, dr) => sum + dr.duplicateCount,
        0,
      ),
    });
  }

  // Global dedup (cross-district)
  const { deduped: globalDeduped, duplicates: globalDups } =
    deduplicateStores(allStores);
  if (globalDups.length > 0) {
    reportData.duplicates.push(...globalDups);
    reportData.anomalies.push({
      type: "cross_district_duplicate",
      count: globalDups.length,
    });
  }
  const idDups = findIdDuplicates(globalDeduped);
  if (idDups.length > 0) {
    reportData.anomalies.push({
      type: "id_collision",
      count: idDups.length,
      detail: idDups.slice(0, 10).map((s) => s.generatedStoreId),
    });
  }

  reportData.totalRaw = allStores.length;
  reportData.totalDeduped = globalDeduped.length;

  // Upsert all globally deduped stores
  console.log(`\n${"═".repeat(60)}`);
  console.log(`開始寫入 DB：${globalDeduped.length} 筆（全台 deduped）`);
  console.log("═".repeat(60));

  let totalInserted = 0,
    totalUpdated = 0,
    totalFailed = 0;
  const failedList = [];

  for (let i = 0; i < globalDeduped.length; i++) {
    const s = globalDeduped[i];
    try {
      const action = await upsertStore(s);
      if (action === "inserted") totalInserted++;
      else totalUpdated++;
    } catch (err) {
      totalFailed++;
      failedList.push({ storeName: s.storeName, error: err.message });
      console.error(`  [ERROR] upsert 失敗：${s.storeName} — ${err.message}`);
    }
    if ((i + 1) % 200 === 0) {
      console.log(
        `  進度：${i + 1}/${globalDeduped.length}（inserted ${totalInserted}，updated ${totalUpdated}，failed ${totalFailed}）`,
      );
    }
  }

  const sevenAfter = await countProvider("seven");
  const familyAfter = await countProvider("family");
  await pool.end();

  reportData.inserted = totalInserted;
  reportData.updated = totalUpdated;
  reportData.failed = totalFailed;
  reportData.dbCounts = {
    familyBefore,
    familyAfter,
    sevenBefore,
    sevenAfter,
    sevenUnchanged: sevenBefore === sevenAfter,
  };
  reportData.cityCount = reportData.cities.length;
  reportData.districtCount = reportData.districtReports.length;
  reportData.samples = globalDeduped.slice(0, 20);
  reportData.missingStats = {
    missingPhone: globalDeduped.filter((s) => !s.phone).length,
    missingAddress: globalDeduped.filter((s) => !s.storeAddress).length,
    missingCity: globalDeduped.filter((s) => !s.city).length,
    missingDistrict: globalDeduped.filter((s) => !s.district).length,
    missingPostalCode: globalDeduped.filter((s) => !s.postalCode).length,
  };
  if (failedList.length > 0) {
    reportData.anomalies.push({
      type: "upsert_failed",
      count: failedList.length,
      detail: failedList,
    });
  }
  reportData.errors = failedList;

  console.log(`\n${"═".repeat(60)}`);
  console.log("全家 twcoupon 全台 upsert — 統計");
  console.log("═".repeat(60));
  console.log(`處理縣市：          ${reportData.cities.length} 個`);
  console.log(`行政區：            ${reportData.districtReports.length} 個`);
  console.log(`門市（raw）：       ${reportData.totalRaw} 筆`);
  console.log(`門市（deduped）：   ${reportData.totalDeduped} 筆`);
  console.log(`inserted：          ${totalInserted}`);
  console.log(`updated：           ${totalUpdated}`);
  console.log(`failed：            ${totalFailed}`);
  console.log(`DB — family before：${familyBefore}，after：${familyAfter}`);
  console.log(`DB — seven before： ${sevenBefore}，after：${sevenAfter}`);
  console.log(
    `seven 不變：        ${sevenBefore === sevenAfter ? "✓" : "✗（異常！）"}`,
  );
  reportData.cities.forEach((c) => {
    console.log(
      `  ${c.city}：${c.storeCount ?? 0} 筆（${c.districtCount ?? 0} 個行政區）`,
    );
  });
  console.log("═".repeat(60));

  saveReport(reportData, REPORT_PATH);
  return reportData;
}

// ── entry point ───────────────────────────────────────────────────────────────
async function main() {
  if (listCities) {
    await runListCities();
  } else if (upsertAllMode) {
    await runUpsertAll();
  } else if (upsertMode) {
    await runUpsert();
  } else {
    await runDryRun();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
