/**
 * Step 7E/7F: twcoupon 7-11 門市清單抓取 + EmapSDK 官方驗證
 *
 * 此工具只用於門市資料登記，不建立正式物流單，不串 ECPay。
 *
 * 執行：
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs \
 *     --url "https://twcoupon.com/brandshopcity-7_11-金門縣-..." \
 *     --limit 50 --delay 1200 --verify-emap
 *
 * 資料流：
 *   twcoupon city/area page → parse inline stores + fetch all brandshoparea sub-pages
 *   → deduplicate by storeName+storeAddress
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

// Default to 連江縣 for testing
const urlArg = getArg("--url") ?? "https://twcoupon.com/brandshopcity-7_11-%e9%80%a3%e6%b1%9f%e7%b8%a3-%e9%9b%bb%e8%a9%b1-%e5%9c%b0%e5%9d%80.html";
const limitRaw = getArg("--limit");
const limit = limitRaw != null ? parseInt(limitRaw, 10) : Infinity;
const delayMs = parseInt(getArg("--delay") ?? "1200", 10);
const dryRun = hasFlag("--dry-run");
const noVerify = hasFlag("--no-verify-emap");
const verifyEmap = !noVerify;
const noSubPages = hasFlag("--no-sub-pages");  // skip brandshoparea fetching

const TWCOUPON_BASE = "https://twcoupon.com";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = dryRun ? null : new Pool({ connectionString: process.env.DATABASE_URL });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── HTTP ────────────────────────────────────────────────────────────────────
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

// ── URL classification ──────────────────────────────────────────────────────
function isMainPageUrl(url) { return url.includes("brandshop-7_11-") && !url.includes("brandshopcity") && !url.includes("brandshoparea"); }
function isCityPageUrl(url) { return url.includes("brandshopcity-"); }

// ── twcoupon parsing ────────────────────────────────────────────────────────
function extractCityLinksFromMain(html) {
  const links = [];
  const re = /href="(brandshopcity-7_11-[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const full = TWCOUPON_BASE + "/" + href;
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

function extractAreaLinksFromCityPage(html) {
  const links = [];
  const re = /href="(brandshoparea-7_11-[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const full = TWCOUPON_BASE + "/" + href;
    if (!links.includes(full)) links.push(full);
  }
  return links;
}

function parseStoresFromHtml(html, sourceUrl) {
  const stores = [];
  const blockRe = /<li\s+class="name">([^<]+)<\/li>\s*<li><em>地址：<\/em>([^<]+)<\/li>\s*<li><em>電話：<\/em>([^<]*)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const storeName = m[1].trim();
    const storeAddress = m[2].trim();
    const storePhone = m[3].trim() || null;
    stores.push({ storeName, storeAddress, storePhone, sourceUrl });
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

// ── keyword extraction ──────────────────────────────────────────────────────
function toEmapKeyword(storeName) {
  return storeName.replace(/7-11/g, "").replace(/7\s*ELEVEN/gi, "").replace(/門市$/g, "").trim();
}

// ── EmapSDK ─────────────────────────────────────────────────────────────────
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

// ── DB upsert ────────────────────────────────────────────────────────────────
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

// ── store discovery ───────────────────────────────────────────────────────
async function collectStoresFromCityPage(cityUrl) {
  console.log(`  抓取城市頁：${decodeURIComponent(cityUrl)}`);
  const cityHtml = await fetchHtml(cityUrl);
  const inlineStores = parseStoresFromHtml(cityHtml, cityUrl);
  console.log(`    city inline：${inlineStores.length} 筆`);

  let allStores = [...inlineStores];

  if (!noSubPages) {
    const areaLinks = extractAreaLinksFromCityPage(cityHtml);
    console.log(`    brandshoparea 子分頁：${areaLinks.length} 個`);

    for (const areaUrl of areaLinks) {
      await sleep(delayMs);
      try {
        const areaHtml = await fetchHtml(areaUrl);
        const areaStores = parseStoresFromHtml(areaHtml, areaUrl);
        // decode the area name for display
        const areaName = decodeURIComponent(areaUrl.split("brandshoparea-7_11-")[1]?.split("-電話")[0] ?? areaUrl);
        console.log(`    [area] ${areaName}：${areaStores.length} 筆`);
        allStores.push(...areaStores);
      } catch (err) {
        console.log(`    [area] 抓取失敗 ${decodeURIComponent(areaUrl)}：${err.message}`);
      }
    }
  }

  const deduped = deduplicateStores(allStores);
  console.log(`    合併後（dedup）：${deduped.length} 筆（raw=${allStores.length}）`);
  return deduped;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n7-11 twcoupon + EmapSDK 匯入 — 門市資料登記工具");
  console.log("此工具只用於門市資料查詢 / 匯入，不建立正式物流單。\n");

  // Step 1: Resolve starting URL
  let cityPageUrls = [];
  if (isMainPageUrl(urlArg)) {
    console.log(`來源：主頁，抓縣市清單...`);
    const mainHtml = await fetchHtml(urlArg);
    const cityLinks = extractCityLinksFromMain(mainHtml);
    console.log(`發現 ${cityLinks.length} 個縣市頁`);
    // PoC: default to small city (連江縣)
    const pocTarget = cityLinks.filter(u =>
      u.includes("%e9%80%a3%e6%b1%9f") || u.includes("連江")
    );
    cityPageUrls = pocTarget.length > 0 ? [pocTarget[0]] : [cityLinks[cityLinks.length - 1]];
    console.log(`PoC 選用：${decodeURIComponent(cityPageUrls[0])}\n`);
  } else if (isCityPageUrl(urlArg)) {
    cityPageUrls = [urlArg];
  } else {
    // area page
    cityPageUrls = [urlArg];
  }

  // Step 2: Collect stores
  let allStores = [];
  for (const cityUrl of cityPageUrls) {
    const stores = await collectStoresFromCityPage(cityUrl);
    allStores.push(...stores);
  }
  allStores = deduplicateStores(allStores);

  const twcouponTotal = allStores.length;
  const stores = limit < Infinity ? allStores.slice(0, limit) : allStores;

  console.log(`\ntwcoupon 總計：${twcouponTotal} 筆，本次處理：${stores.length} 筆`);
  console.log(`EmapSDK 驗證：${verifyEmap ? "開啟" : "關閉"}`);
  console.log(`每次間隔：${delayMs}ms`);
  if (dryRun) console.log("[DRY-RUN] 不會寫入 DB");
  console.log("");

  const stats = {
    twcouponTotal,
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

  // Step 3: EmapSDK verify + upsert
  for (let i = 0; i < stores.length; i++) {
    const tw = stores[i];
    const keyword = toEmapKeyword(tw.storeName);
    process.stdout.write(`[${i + 1}/${stores.length}] 「${tw.storeName}」(kw:${keyword}) ... `);

    let dbRow = null;

    if (verifyEmap && !dryRun) {
      try {
        await sleep(i === 0 ? 0 : delayMs);
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
          process.stdout.write(`verified(${candidates.length}cand,chose ${best.poiId})`);
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
      process.stdout.write(`unverified(no-verify)`);
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

  // ── Report ────────────────────────────────────────────────────────────────
  const totalStores = (!dryRun && pool) ? await getTotalStoreCount() : 0;

  console.log("\n── twcoupon + EmapSDK 匯入統計 ─────────────────────────────");
  console.log(`twcoupon 抓到：           ${stats.twcouponTotal} 筆`);
  console.log(`實際處理：                ${stats.processed} 筆`);
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
    stats.unverifiedList.forEach((s, i) =>
      console.log(`  ${i + 1}. ${s.storeName}（kw:${s.keyword}）${s.storeAddress}`)
    );
  }

  if (stats.multipleCandidatesList.length > 0) {
    console.log("\n── multiple_candidates ──────────────────────────────────────");
    stats.multipleCandidatesList.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.storeName}（kw:${s.keyword}）→ chose ${s.chosen}`);
      s.candidates.forEach(c => console.log(`     - ${c}`));
    });
  }

  // Save report
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const altDir = path.resolve(process.cwd(), "data/cvs");
  const reportDir = fs.existsSync(altDir) ? altDir : __dir;
  if (!dryRun) {
    fs.writeFileSync(path.join(reportDir, "twcoupon-emap-poc-report.json"), JSON.stringify({
      sourceUrl: urlArg, twcouponTotal: stats.twcouponTotal,
      processed: stats.processed, emapVerified: stats.emapVerified,
      emapMultiCandidates: stats.emapMultiCandidates, emapUnverified: stats.emapUnverified,
      emapFailed: stats.emapFailed, dbInserted: stats.inserted, dbUpdated: stats.updated,
      dbFailed: stats.dbFailed, totalStoresInDb: totalStores,
      unverifiedList: stats.unverifiedList, multipleCandidatesList: stats.multipleCandidatesList,
      failedList: stats.failedList, completedAt: new Date().toISOString(),
    }, null, 2));
  }

  console.log("─────────────────────────────────────────────────────────────\n");
  if (pool) await pool.end();
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

main().catch((err) => { console.error("Fatal:", err); if (pool) pool.end(); process.exit(1); });
