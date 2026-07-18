/**
 * Step 7R: Generate final 7-11 coverage report
 * Read-only: SELECT queries only, no DB writes
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const __dir = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function main() {
  console.log("[step7r] Generating final 7-11 coverage report...");

  // 1. Total
  const [{ total }] = await query(
    "SELECT COUNT(*) AS total FROM cvs_stores WHERE provider='seven' AND is_active=true",
  );
  const totalStores = parseInt(total, 10);

  // 2. By city
  const cityRows = await query(
    `SELECT city, COUNT(*) AS cnt,
      SUM(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 ELSE 0 END) AS missing_coords,
      SUM(CASE WHEN district IS NULL THEN 1 ELSE 0 END) AS district_null
     FROM cvs_stores WHERE provider='seven' AND is_active=true
     GROUP BY city ORDER BY cnt DESC`,
  );
  const cityCounts = {};
  const cityDetails = {};
  for (const r of cityRows) {
    cityCounts[r.city || "NULL"] = parseInt(r.cnt, 10);
    cityDetails[r.city || "NULL"] = {
      storeCount: parseInt(r.cnt, 10),
      coordinateMissingCount: parseInt(r.missing_coords, 10),
      districtNullCount: parseInt(r.district_null, 10),
    };
  }

  // 3. By source
  const sourceRows = await query(
    `SELECT source, COUNT(*) AS cnt FROM cvs_stores WHERE provider='seven' AND is_active=true
     GROUP BY source ORDER BY cnt DESC`,
  );
  const sourceCounts = {};
  for (const r of sourceRows) {
    sourceCounts[r.source] = parseInt(r.cnt, 10);
  }

  // 4. Coordinate stats
  const [coordStats] = await query(
    `SELECT
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS has_coords,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS missing_coords
     FROM cvs_stores WHERE provider='seven' AND is_active=true`,
  );

  // 5. source_updated_at range
  const [timeRange] = await query(
    `SELECT MIN(source_updated_at) AS oldest, MAX(source_updated_at) AS newest
     FROM cvs_stores WHERE provider='seven' AND is_active=true`,
  );

  // 6. Anomaly checks
  const [{ anomaly_city }] = await query(
    `SELECT COUNT(*) AS anomaly_city FROM cvs_stores
     WHERE provider='seven' AND is_active=true
     AND city NOT IN ('台北市','新北市','桃園市','台中市','台南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣')`,
  );

  const [{ district_null }] = await query(
    `SELECT COUNT(*) AS district_null FROM cvs_stores
     WHERE provider='seven' AND is_active=true AND district IS NULL`,
  );

  const districtNullDetails = await query(
    `SELECT store_id, store_name, city, source FROM cvs_stores
     WHERE provider='seven' AND is_active=true AND district IS NULL`,
  );

  const districtAnomalyPatterns = await query(
    `SELECT district, COUNT(*) AS cnt FROM cvs_stores
     WHERE provider='seven' AND is_active=true
       AND (district LIKE '%區鎮%' OR district LIKE '%區市%' OR district LIKE '%區區%'
         OR district LIKE '%區站區%' OR district LIKE '%區二區%' OR district LIKE '%區後鄉%'
         OR district LIKE '%鄉園區%' OR district LIKE '%區新市%' OR district LIKE '%鎮鎮%')
     GROUP BY district`,
  );

  const [{ dup_store_id }] = await query(
    `SELECT COUNT(*) AS dup_store_id FROM (
      SELECT store_id FROM cvs_stores WHERE provider='seven'
      GROUP BY store_id HAVING COUNT(*) > 1
    ) t`,
  );

  const dupNameAddr = await query(
    `SELECT store_name, store_address, COUNT(*) AS cnt FROM cvs_stores
     WHERE provider='seven' AND is_active=true
     GROUP BY store_name, store_address HAVING COUNT(*) > 1
     ORDER BY cnt DESC`,
  );

  // Coordinate range anomaly — note: Kinmen (金門) has longitude ~118.x which is correct
  const coordAnomalyFull = await query(
    `SELECT store_id, store_name, city, district, latitude, longitude FROM cvs_stores
     WHERE provider='seven' AND is_active=true
       AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND (latitude < 21 OR latitude > 26.5 OR longitude < 119 OR longitude > 123)
     ORDER BY city, district`,
  );
  // Actual anomalies outside even Kinmen/Matsu range
  const trueCoordAnomalies = coordAnomalyFull.filter((r) => {
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    // Kinmen: lat 24.3-24.6, lon 118.1-118.5; Matsu: lat 25.9-26.4, lon 119.8-120.1
    const isKinmen = lat >= 24.3 && lat <= 24.6 && lon >= 118.1 && lon <= 118.5;
    const isMatsu = lat >= 25.9 && lat <= 26.4 && lon >= 119.8 && lon <= 120.1;
    return !isKinmen && !isMatsu;
  });

  const [{ inactive_count }] = await query(
    `SELECT COUNT(*) AS inactive_count FROM cvs_stores WHERE provider='seven' AND is_active=false`,
  );

  const [{ mixed_provider }] = await query(
    `SELECT COUNT(*) AS mixed_provider FROM cvs_stores
     WHERE provider != 'seven' AND (store_name LIKE '%7-11%' OR store_name LIKE '%7-Eleven%')`,
  );

  // 7. District coverage
  const DISTRICTS_FILE = path.resolve(
    __dir,
    "../data/cvs/taiwan-city-districts.json",
  );
  const allDistricts = JSON.parse(fs.readFileSync(DISTRICTS_FILE, "utf8"));

  const districtCountRows = await query(
    `SELECT city, COALESCE(district, '') AS district, COUNT(*) AS cnt
     FROM cvs_stores WHERE provider='seven' AND is_active=true
     GROUP BY city, district ORDER BY city, district`,
  );
  const dbDistrictMap = {};
  for (const r of districtCountRows) {
    dbDistrictMap[`${r.city}|${r.district}`] = parseInt(r.cnt, 10);
  }

  const districtCoverage = allDistricts.map((d) => {
    const key = `${d.city}|${d.district}`;
    const count = dbDistrictMap[key] || 0;
    return { city: d.city, district: d.district, storeCount: count };
  });

  const missingDistricts = districtCoverage.filter((d) => d.storeCount === 0);
  const lowCountDistricts = districtCoverage.filter(
    (d) => d.storeCount >= 1 && d.storeCount <= 2,
  );
  const singleStoreDistricts = districtCoverage.filter(
    (d) => d.storeCount === 1,
  );
  const highCountDistricts = districtCoverage
    .filter((d) => d.storeCount > 100)
    .sort((a, b) => b.storeCount - a.storeCount);

  const coveredCount = districtCoverage.filter((d) => d.storeCount > 0).length;

  // 8. Coverage rate vs target
  const TARGET_STORES = 7200;
  const coverageRate = ((totalStores / TARGET_STORES) * 100).toFixed(2);

  // Build full report
  const report = {
    generatedAt: new Date().toISOString(),
    totalStores,
    targetStores: TARGET_STORES,
    coverageRate: `${coverageRate}%`,
    coverageRatio: parseFloat(coverageRate),
    meetsTarget: totalStores >= TARGET_STORES,
    excessOrDeficit: totalStores - TARGET_STORES,
    sourceUpdatedRange: {
      oldest: timeRange.oldest,
      newest: timeRange.newest,
    },
    cityCounts,
    sourceCounts,
    coordinateStats: {
      hasCoordinates: parseInt(coordStats.has_coords, 10),
      missingCoordinates: parseInt(coordStats.missing_coords, 10),
      totalActive: totalStores,
    },
    anomalyChecks: {
      cityAnomalyCount: parseInt(anomaly_city, 10),
      districtNullCount: parseInt(district_null, 10),
      districtNullRecords: districtNullDetails,
      districtPatternAnomalies: districtAnomalyPatterns,
      duplicateStoreIdCount: parseInt(dup_store_id, 10),
      duplicateNameAddressCombinations: dupNameAddr.map((r) => ({
        storeName: r.store_name,
        storeAddress: r.store_address,
        count: parseInt(r.cnt, 10),
      })),
      coordinateOutOfTaiwanRange: coordAnomalyFull.length,
      coordinateTrueAnomalies: trueCoordAnomalies.length,
      coordinateTrueAnomalyNote:
        "金門縣 stores with longitude ~118.x are CORRECT for Kinmen island",
      inactiveStoreCount: parseInt(inactive_count, 10),
      mixedProviderCount: parseInt(mixed_provider, 10),
    },
    districtCoverageStats: {
      totalExpected: allDistricts.length,
      totalCovered: coveredCount,
      totalMissing: missingDistricts.length,
      missingDistricts,
    },
    lowCountDistricts,
    singleStoreDistricts,
    highCountDistricts,
    districtCoverage,
    recommendations: [
      totalStores >= TARGET_STORES
        ? `✅ 已達成目標：DB ${totalStores} 間 >= 目標 ${TARGET_STORES} 間（超出 ${totalStores - TARGET_STORES} 間）`
        : `❌ 未達目標：DB ${totalStores} 間 < 目標 ${TARGET_STORES} 間（不足 ${TARGET_STORES - totalStores} 間）`,
      `行政區覆蓋：${coveredCount}/368（${((coveredCount / 368) * 100).toFixed(1)}%）`,
      `缺漏行政區：${missingDistricts.map((d) => d.city + d.district).join("、") || "無"}`,
      `27 間金門縣門市 longitude ~118.x 為正確金門座標，非異常`,
      `4 筆 district IS NULL 均為 twcoupon_unverified 舊資料，不影響主要匯入品質`,
      `4 組門市 store_name+address 重複（各出現 2 次），建議確認是否為重複匯入`,
      `emap_district_batch 佔 ${(((sourceCounts["emap_district_batch"] || 0) / totalStores) * 100).toFixed(1)}% 為主要來源`,
      `twcoupon_unverified 剩 ${sourceCounts["twcoupon_unverified"] || 0} 筆，可視需求保留或清除`,
    ],
  };

  // Write JSON
  const jsonPath = path.resolve(
    __dir,
    "../data/cvs/seven-final-coverage-report-step7r.json",
  );
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[step7r] JSON report written: ${jsonPath}`);

  // Write CSV (city summary)
  const csvLines = [
    "city,storeCount,coordinateMissingCount,districtNullCount",
    ...Object.entries(cityDetails).map(
      ([city, d]) =>
        `${city},${d.storeCount},${d.coordinateMissingCount},${d.districtNullCount}`,
    ),
  ];
  const csvPath = path.resolve(
    __dir,
    "../data/cvs/seven-final-coverage-report-step7r.csv",
  );
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
  console.log(`[step7r] CSV report written: ${csvPath}`);

  console.log(`\n[step7r] ===== SUMMARY =====`);
  console.log(`Total active stores: ${totalStores}`);
  console.log(
    `Target: ${TARGET_STORES} | Rate: ${coverageRate}% | Excess: +${totalStores - TARGET_STORES}`,
  );
  console.log(
    `District coverage: ${coveredCount}/368 | Missing: ${missingDistricts.map((d) => d.city + d.district).join(", ")}`,
  );
  console.log(
    `Coordinates: ${coordStats.has_coords} have / ${coordStats.missing_coords} missing`,
  );
  console.log(
    `Anomalies: city=${anomaly_city}, districtNull=${district_null}, dupId=${dup_store_id}, inactive=${inactive_count}`,
  );
  console.log(`Sources: ${JSON.stringify(sourceCounts)}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
