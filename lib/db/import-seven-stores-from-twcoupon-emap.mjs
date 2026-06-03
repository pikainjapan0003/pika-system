/**
 * Step 7E: twcoupon 7-11 門市清單抓取 + EmapSDK 官方驗證 PoC
 *
 * 此工具只用於門市資料登記，不建立正式物流單，不串 ECPay。
 *
 * 執行：
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs \
 *     --url "https://twcoupon.com/brandshop-7_11-..." \
 *     --limit 20 --delay 1000 --verify-emap
 *
 * 資料流：
 *   twcoupon city page → parse storeName/storeAddress/storePhone
 *   → EmapSDK SearchStore by keyword → verify / supplement POIID / coords
 *   → upsert cvs_stores
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? (args[i + 1] ?? null) : null; }
function hasFlag(flag) { return args.includes(flag); }

const urlArg = getArg("--url") ?? "https://twcoupon.com/brandshopcity-7_11-%e9%87%91%e9%96%80%e7%b8%a3-%e9%9b%bb%e8%a9%b1-%e5%9c%b0%e5%9d%80.html";
const limitRaw = getArg("--limit");
const limit = limitRaw != null ? parseInt(limitRaw, 10) : 20;
const delayMs = parseInt(getArg("--delay") ?? "1200", 10);
const dryRun = hasFlag("--dry-run");
const verifyEmap = hasFlag("--verify-emap") || !hasFlag("--no-verify-emap");

const TWCOUPON_BASE = "https://twcoupon.com";

// ── 金門縣 is the default small-county PoC target ──────────────────────────
const DEFAULT_CITY_URL = "https://twcoupon.com/brandshopcity-7_11-%e9%87%91%e9%96%80%e7%b8%a3-%e9%9b%bb%e8%a9%b1-%e5%9c%b0%e5%9d%80.html";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = dryRun ? null : new Pool({ connectionString: process.env.DATABASE_URL });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── HTTP helper ────────────────────────────────────────────────────────────
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

// ── twcoupon parsing ────────────────────────────────────────────────────────
function isCityPageUrl(url) {
  return url.includes("brandshopcity-");
}

function extractCityLinksFromMain(html) {
  const links = [];
  const re = /href="(brandshopcity-7_11-[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!links.includes(href)) links.push(TWCOUPON_BASE + "/" + href);
  }
  return links;
}

function parseStoresFromCityPage(html, sourceUrl) {
  const stores = [];
  // Pattern: <li class="name">NAME</li><li><em>地址：</em>ADDR</li><li><em>電話：</em>PHONE</li>
  const blockRe = /<li\s+class="name">([^<]+)<\/li>\s*<li><em>地址：<\/em>([^<]+)<\/li>\s*<li><em>電話：<\/em>([^<]+)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const storeName = m[1].trim();
    const storeAddress = m[2].trim();
    const storePhone = m[3].trim() || null;
    stores.push({ storeName, storeAddress, storePhone, sourceUrl });
  }
  return stores;
}

// ── keyword extraction ─────────────────────────────────────────────────────
function toEmapKeyword(storeName) {
  return storeName
    .replace(/7-11/g, "")
    .replace(/7\s*ELEVEN/gi, "")
    .replace(/門市$/g, "")
    .trim();
}

// ── EmapSDK ────────────────────────────────────────────────────────────────
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
    results.push({ poiId, poiName, storeName, storeAddress: address, storePhone: telno || null, businessHours: opTime || null, latitude, longitude, city, district });
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

// Address similarity: count shared substrings ≥ 2 chars
function addressSimilarity(a, b) {
  if (!a || !b) return 0;
  let score = 0;
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= a.length - len; i++) {
      const sub = a.slice(i, i + len);
      if (b.includes(sub)) score += len;
    }
  }
  return score;
}

// ── DB upsert ───────────────────────────────────────────────────────────────
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
       store_name        = EXCLUDED.store_name,
       store_address     = EXCLUDED.store_address,
       store_phone       = EXCLUDED.store_phone,
       city              = EXCLUDED.city,
       district          = EXCLUDED.district,
       business_hours    = EXCLUDED.business_hours,
       latitude          = EXCLUDED.latitude,
       longitude         = EXCLUDED.longitude,
       source            = EXCLUDED.source,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at        = now()
     RETURNING (xmax = 0) AS inserted`,
    [row.storeId, row.storeName, row.storeAddress, row.storePhone,
     row.city, row.district, row.businessHours, row.latitude, row.longitude,
     row.source]
  );
  return result.rows[0]?.inserted === true ? "inserted" : "updated";
}

async function getTotalStoreCount() {
  const r = await pool.query("SELECT COUNT(*) FROM cvs_stores WHERE provider = 'seven' AND is_active = true");
  return parseInt(r.rows[0].count, 10);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n7-11 twcoupon + EmapSDK 匯入 PoC — 門市資料登記工具");
  console.log("此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n");

  // Step 1: Determine city page URL
  let cityPageUrl = urlArg;
  if (!isCityPageUrl(urlArg)) {
    console.log(`來源 URL 為主頁，抓取縣市清單...`);
    const mainHtml = await fetchHtml(urlArg);
    const cityLinks = extractCityLinksFromMain(mainHtml);
    if (cityLinks.length === 0) throw new Error("無法從主頁解析縣市連結");
    // Use last city in list = 金門縣 / 連江縣 (small) for PoC
    const smallCities = cityLinks.filter(u => u.includes("%e9%87%91%e9%96%80") || u.includes("%e9%80%a3%e6%b1%9f"));
    cityPageUrl = smallCities[0] ?? cityLinks[cityLinks.length - 1];
    console.log(`選用縣市頁（PoC 小樣本）：${decodeURIComponent(cityPageUrl)}\n`);
  }

  // Step 2: Parse stores from city page
  console.log(`抓取城市頁：${cityPageUrl}`);
  const cityHtml = await fetchHtml(cityPageUrl);
  const allStores = parseStoresFromCityPage(cityHtml, cityPageUrl);
  console.log(`twcoupon 解析出 ${allStores.length} 筆門市`);

  if (allStores.length === 0) {
    console.error("解析失敗：未找到任何門市資料，請檢查 HTML 結構");
    process.exit(1);
  }

  const stores = allStores.slice(0, limit);
  console.log(`本次處理前 ${stores.length} 筆（limit=${limit}）`);
  console.log(`EmapSDK 驗證：${verifyEmap ? "開啟" : "關閉（--no-verify-emap）"}`);
  console.log(`每次間隔：${delayMs}ms`);
  if (dryRun) console.log("[DRY-RUN] 不會寫入 DB\n");
  else console.log("");

  const stats = {
    twcouponTotal: allStores.length,
    processed: stores.length,
    emapVerified: 0,
    emapUnverified: 0,
    emapMultiCandidates: 0,
    emapFailed: 0,
    inserted: 0,
    updated: 0,
    dbFailed: 0,
    unverifiedList: [],
    multipleCandidatesList: [],
    failedList: [],
  };

  for (let i = 0; i < stores.length; i++) {
    const tw = stores[i];
    const keyword = toEmapKeyword(tw.storeName);
    process.stdout.write(`[${i + 1}/${stores.length}] 「${tw.storeName}」(keyword: ${keyword}) ... `);

    let dbRow = null;

    if (verifyEmap && !dryRun) {
      try {
        const xml = await queryEmap(keyword);
        const candidates = parseEmapCandidates(xml);

        if (candidates.length === 0) {
          // Unverified — use twcoupon data
          const storeId = "twcoupon-" + stableHash(tw.storeName + tw.storeAddress);
          let city = null, district = null;
          if (tw.storeAddress) {
            const cm = tw.storeAddress.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
            const dm = tw.storeAddress.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
          }
          dbRow = {
            storeId,
            storeName: tw.storeName,
            storeAddress: tw.storeAddress,
            storePhone: tw.storePhone,
            businessHours: null,
            latitude: null,
            longitude: null,
            city,
            district,
            source: "twcoupon_unverified",
          };
          stats.emapUnverified++;
          stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
          process.stdout.write(`EmapSDK 無結果 → unverified`);
        } else if (candidates.length === 1) {
          const c = candidates[0];
          dbRow = {
            storeId: c.poiId,
            storeName: c.storeName,
            storeAddress: c.storeAddress,
            storePhone: c.storePhone,
            businessHours: c.businessHours,
            latitude: c.latitude,
            longitude: c.longitude,
            city: c.city,
            district: c.district,
            source: "twcoupon_emap_verified",
          };
          stats.emapVerified++;
          process.stdout.write(`verified (POIID=${c.poiId})`);
        } else {
          // Multiple candidates — pick best by address similarity
          let best = candidates[0];
          let bestScore = addressSimilarity(tw.storeAddress, candidates[0].storeAddress);
          for (const c of candidates.slice(1)) {
            const score = addressSimilarity(tw.storeAddress, c.storeAddress);
            if (score > bestScore) { best = c; bestScore = score; }
          }
          dbRow = {
            storeId: best.poiId,
            storeName: best.storeName,
            storeAddress: best.storeAddress,
            storePhone: best.storePhone,
            businessHours: best.businessHours,
            latitude: best.latitude,
            longitude: best.longitude,
            city: best.city,
            district: best.district,
            source: "twcoupon_emap_verified",
          };
          stats.emapVerified++;
          stats.emapMultiCandidates++;
          stats.multipleCandidatesList.push({
            storeName: tw.storeName,
            keyword,
            candidates: candidates.map(c => `${c.poiId} ${c.storeName} ${c.storeAddress}`),
            chosen: best.poiId,
          });
          process.stdout.write(`verified (${candidates.length} candidates, chosen ${best.poiId})`);
        }
      } catch (err) {
        stats.emapFailed++;
        stats.failedList.push({ storeName: tw.storeName, error: err.message });
        process.stdout.write(`EmapSDK 失敗 (${err.message})`);
        // Fall back to twcoupon unverified
        const storeId = "twcoupon-" + stableHash(tw.storeName + tw.storeAddress);
        let city = null, district = null;
        if (tw.storeAddress) {
          const cm = tw.storeAddress.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
          const dm = tw.storeAddress.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
        }
        dbRow = {
          storeId,
          storeName: tw.storeName,
          storeAddress: tw.storeAddress,
          storePhone: tw.storePhone,
          businessHours: null,
          latitude: null,
          longitude: null,
          city,
          district,
          source: "twcoupon_unverified",
        };
        stats.emapUnverified++;
        stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
      }
    } else if (dryRun) {
      process.stdout.write(`[DRY-RUN]`);
    } else {
      // --no-verify-emap
      const storeId = "twcoupon-" + stableHash(tw.storeName + tw.storeAddress);
      let city = null, district = null;
      if (tw.storeAddress) {
        const cm = tw.storeAddress.match(/^(.{2,4}[市縣])/); if (cm) city = cm[1];
        const dm = tw.storeAddress.match(/[市縣](.{2,4}[區鄉鎮市])/); if (dm) district = dm[1];
      }
      dbRow = {
        storeId,
        storeName: tw.storeName,
        storeAddress: tw.storeAddress,
        storePhone: tw.storePhone,
        businessHours: null,
        latitude: null,
        longitude: null,
        city,
        district,
        source: "twcoupon_unverified",
      };
      stats.emapUnverified++;
      stats.unverifiedList.push({ storeName: tw.storeName, storeAddress: tw.storeAddress, keyword });
      process.stdout.write(`unverified (--no-verify-emap)`);
    }

    if (!dryRun && dbRow) {
      try {
        const action = await upsertStore(dbRow);
        if (action === "inserted") stats.inserted++;
        else stats.updated++;
        process.stdout.write(` → DB ${action}\n`);
      } catch (err) {
        stats.dbFailed++;
        process.stdout.write(` → DB 失敗 (${err.message})\n`);
      }
    } else {
      process.stdout.write("\n");
    }

    if (i < stores.length - 1) await sleep(delayMs);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const totalStores = (!dryRun && pool) ? await getTotalStoreCount() : 0;

  console.log("\n── twcoupon + EmapSDK PoC 統計 ────────────────────────────");
  console.log(`twcoupon 抓到：          ${stats.twcouponTotal} 筆`);
  console.log(`實際處理：               ${stats.processed} 筆（limit=${limit}）`);
  console.log(`EmapSDK verified：       ${stats.emapVerified} 筆`);
  console.log(`  其中多候選 (best pick)：${stats.emapMultiCandidates} 筆`);
  console.log(`unverified：             ${stats.emapUnverified} 筆`);
  console.log(`EmapSDK 失敗：           ${stats.emapFailed} 筆`);
  console.log(`DB 新增：                ${stats.inserted} 筆`);
  console.log(`DB 更新：                ${stats.updated} 筆`);
  console.log(`DB 失敗：                ${stats.dbFailed} 筆`);
  if (!dryRun) console.log(`DB 7-11 門市總數：       ${totalStores} 筆`);

  if (stats.unverifiedList.length > 0) {
    console.log("\n── unverified 清單 ─────────────────────────────────────");
    stats.unverifiedList.forEach((s, i) =>
      console.log(`  ${i + 1}. ${s.storeName}（keyword: ${s.keyword}）${s.storeAddress}`)
    );
  }

  if (stats.multipleCandidatesList.length > 0) {
    console.log("\n── multiple_candidates 清單 ────────────────────────────");
    stats.multipleCandidatesList.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.storeName}（keyword: ${s.keyword}）→ chosen: ${s.chosen}`);
      s.candidates.forEach(c => console.log(`     - ${c}`));
    });
  }

  // Save report to file (next to script, or cwd/data/cvs if it exists)
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const altDir = path.resolve(process.cwd(), "data/cvs");
  const reportDir = fs.existsSync(altDir) ? altDir : __dir;
  const reportFile = path.join(reportDir, "twcoupon-emap-poc-report.json");
  if (!dryRun) {
    const report = {
      sourceUrl: cityPageUrl,
      twcouponTotal: stats.twcouponTotal,
      processed: stats.processed,
      emapVerified: stats.emapVerified,
      emapMultiCandidates: stats.emapMultiCandidates,
      emapUnverified: stats.emapUnverified,
      emapFailed: stats.emapFailed,
      dbInserted: stats.inserted,
      dbUpdated: stats.updated,
      dbFailed: stats.dbFailed,
      totalStoresInDb: totalStores,
      unverifiedList: stats.unverifiedList,
      multipleCandidatesList: stats.multipleCandidatesList,
      failedList: stats.failedList,
      completedAt: new Date().toISOString(),
    };
    if (fs.existsSync(reportDir)) {
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`\n報表已存至：${reportFile}`);
    }
  }

  console.log("──────────────────────────────────────────────────────────\n");

  if (pool) await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); if (pool) pool.end(); process.exit(1); });
