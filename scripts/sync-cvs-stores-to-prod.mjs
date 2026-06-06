/**
 * sync-cvs-stores-to-prod.mjs
 *
 * 安全同步 cvs_stores：development DB → production DB
 *
 * 使用方式（從 workspace root）：
 *   # dry-run（預設，不寫任何資料）
 *   node scripts/sync-cvs-stores-to-prod.mjs --dry-run
 *
 *   # dry-run + 輸出 report
 *   node scripts/sync-cvs-stores-to-prod.mjs --dry-run --report data/cvs/prod-cvs-sync-dryrun.json
 *
 *   # 只同步特定 provider
 *   node scripts/sync-cvs-stores-to-prod.mjs --dry-run --provider seven
 *
 *   # 限制筆數（測試用）
 *   node scripts/sync-cvs-stores-to-prod.mjs --dry-run --limit 100
 *
 *   # 正式同步（需要 --apply，且需要 PROD_DATABASE_URL）
 *   node scripts/sync-cvs-stores-to-prod.mjs --apply --report data/cvs/prod-cvs-sync-apply.json
 *
 * 安全設計：
 * - 預設 dry-run，沒有 --apply 就不寫任何資料
 * - 只允許操作 cvs_stores 表
 * - 不碰 orders / users / payments / products / sessions 等其他表
 * - 不改 schema
 * - 不 DELETE 任何資料（只 INSERT / UPDATE）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dir, "..");
const req = createRequire(path.join(WORKSPACE_ROOT, "lib/db/package.json"));
const pg = req("pg");
const { Pool } = pg;

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}
function hasFlag(flag) { return args.includes(flag); }

const isDryRun   = !hasFlag("--apply");
const applyMode  = hasFlag("--apply");
const providerFilter = getArg("--provider") ?? null;
const limitArg   = getArg("--limit");
const rowLimit   = limitArg ? parseInt(limitArg, 10) : null;
const reportArg  = getArg("--report");
const REPORT_PATH = reportArg
  ? (path.isAbsolute(reportArg) ? reportArg : path.resolve(WORKSPACE_ROOT, reportArg))
  : null;

// ── 安全確認 ───────────────────────────────────────────────────────────────────
const ALLOWED_TABLES = ["cvs_stores"];

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("[sync-cvs-stores-to-prod] 啟動");
console.log(`  mode       : ${isDryRun ? "dry-run（不寫任何資料）" : "apply（寫入 production DB）"}`);
console.log(`  provider   : ${providerFilter ?? "全部"}`);
console.log(`  limit      : ${rowLimit ?? "不限制"}`);
console.log(`  report     : ${REPORT_PATH ?? "不輸出 report 檔案"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// ── env 確認 ──────────────────────────────────────────────────────────────────
const hasSrcUrl  = Boolean(process.env.DATABASE_URL);
const hasTgtUrl  = Boolean(process.env.PROD_DATABASE_URL);

if (!hasSrcUrl) {
  console.error("[ERROR] DATABASE_URL 未設定，無法連接 development DB");
  process.exit(1);
}

if (applyMode && !hasTgtUrl) {
  console.error("[ERROR] --apply 模式需要 PROD_DATABASE_URL，請先在 Replit Secrets 設定");
  process.exit(1);
}

if (!hasTgtUrl) {
  console.warn("[WARN] PROD_DATABASE_URL 未設定，dry-run 將只讀取 source DB 統計");
  console.warn("[WARN] 請在 Replit Secrets 加入 PROD_DATABASE_URL 後，再執行完整 dry-run");
}

// ── DB 連線 ───────────────────────────────────────────────────────────────────
const srcPool = new Pool({ connectionString: process.env.DATABASE_URL });
const tgtPool = hasTgtUrl ? new Pool({ connectionString: process.env.PROD_DATABASE_URL }) : null;

async function query(pool, sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ── 統計查詢 ──────────────────────────────────────────────────────────────────
async function getStats(pool, label) {
  const providerRows = await query(pool, `
    SELECT provider, is_active, COUNT(*) AS cnt
    FROM cvs_stores
    GROUP BY provider, is_active
    ORDER BY provider, is_active
  `);

  const sourceRows = await query(pool, `
    SELECT provider, source, COUNT(*) AS cnt
    FROM cvs_stores
    WHERE is_active = true
    GROUP BY provider, source
    ORDER BY provider, source
  `);

  const totalActive = providerRows
    .filter(r => r.is_active)
    .reduce((s, r) => s + parseInt(r.cnt, 10), 0);

  const providerCounts = {};
  for (const r of providerRows) {
    const key = `${r.provider}:${r.is_active ? "active" : "inactive"}`;
    providerCounts[key] = parseInt(r.cnt, 10);
  }

  const sourceCounts = {};
  for (const r of sourceRows) {
    sourceCounts[`${r.provider}:${r.source}`] = parseInt(r.cnt, 10);
  }

  console.log(`\n[${label}] cvs_stores 統計：`);
  for (const r of providerRows) {
    console.log(`  ${r.provider} is_active=${r.is_active} : ${r.cnt} 筆`);
  }
  console.log(`  active 總計 : ${totalActive} 筆`);

  return { available: true, activeTotal: totalActive, providerCounts, sourceCounts };
}

// ── 差異計算 ──────────────────────────────────────────────────────────────────
async function calcDiff(srcPool, tgtPool) {
  // 讀 source 全部 store_id（以 provider+store_id 為 key）
  let srcQuery = `SELECT provider, store_id FROM cvs_stores WHERE is_active = true`;
  const srcParams = [];
  if (providerFilter) {
    srcQuery += ` AND provider = $1`;
    srcParams.push(providerFilter);
  }
  if (rowLimit) {
    srcQuery += ` LIMIT ${rowLimit}`;
  }
  const srcIds = await query(srcPool, srcQuery, srcParams);

  // 讀 target 全部 store_id
  let tgtQuery = `SELECT provider, store_id FROM cvs_stores`;
  const tgtParams = [];
  if (providerFilter) {
    tgtQuery += ` WHERE provider = $1`;
    tgtParams.push(providerFilter);
  }
  const tgtIds = await query(tgtPool, tgtQuery, tgtParams);

  const tgtSet = new Set(tgtIds.map(r => `${r.provider}::${r.store_id}`));

  let wouldInsert = 0;
  let wouldUpdate = 0;
  for (const r of srcIds) {
    const key = `${r.provider}::${r.store_id}`;
    if (tgtSet.has(key)) {
      wouldUpdate++;
    } else {
      wouldInsert++;
    }
  }
  const wouldSkip = 0;

  console.log(`\n[diff] 差異統計：`);
  console.log(`  wouldInsert : ${wouldInsert} 筆（target 不存在，需新增）`);
  console.log(`  wouldUpdate : ${wouldUpdate} 筆（target 已存在，需更新）`);
  console.log(`  wouldSkip   : ${wouldSkip} 筆`);

  return { wouldInsert, wouldUpdate, wouldSkip };
}

// ── apply：upsert cvs_stores ──────────────────────────────────────────────────
async function applySync(srcPool, tgtPool) {
  console.log("\n[apply] 開始同步 cvs_stores...");

  let srcQuery = `
    SELECT
      provider, store_id, store_name, store_address, store_phone,
      city, district, latitude, longitude, business_hours, delivery_status,
      is_active, source, source_updated_at
    FROM cvs_stores
  `;
  const srcParams = [];
  if (providerFilter) {
    srcQuery += ` WHERE provider = $1`;
    srcParams.push(providerFilter);
  }
  if (rowLimit) {
    srcQuery += ` LIMIT ${rowLimit}`;
  }

  const rows = await query(srcPool, srcQuery, srcParams);
  console.log(`[apply] 讀取 source ${rows.length} 筆`);

  let inserted = 0;
  let updated = 0;

  // 分批處理，每批 500 筆
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const r of batch) {
      await tgtPool.query(`
        INSERT INTO cvs_stores (
          provider, store_id, store_name, store_address, store_phone,
          city, district, latitude, longitude, business_hours, delivery_status,
          is_active, source, source_updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (provider, store_id) DO UPDATE SET
          store_name       = EXCLUDED.store_name,
          store_address    = EXCLUDED.store_address,
          store_phone      = EXCLUDED.store_phone,
          city             = EXCLUDED.city,
          district         = EXCLUDED.district,
          latitude         = EXCLUDED.latitude,
          longitude        = EXCLUDED.longitude,
          business_hours   = EXCLUDED.business_hours,
          delivery_status  = EXCLUDED.delivery_status,
          is_active        = EXCLUDED.is_active,
          source           = EXCLUDED.source,
          source_updated_at = EXCLUDED.source_updated_at,
          updated_at       = now()
      `, [
        r.provider, r.store_id, r.store_name, r.store_address, r.store_phone,
        r.city, r.district, r.latitude, r.longitude, r.business_hours, r.delivery_status,
        r.is_active, r.source, r.source_updated_at,
      ]);

      // 簡化判斷（實際上 ON CONFLICT 會自動決定）
      inserted++; // 保守統計，apply 後可再查 target stats 確認
    }
    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    console.log(`[apply] 進度 ${i + batch.length}/${rows.length} (${pct}%)`);
  }

  console.log(`[apply] 完成，共處理 ${rows.length} 筆`);
  return { totalProcessed: rows.length };
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const notes = [];
  let srcStats = null;
  let tgtStats = null;
  let diff = { wouldInsert: 0, wouldUpdate: 0, wouldSkip: 0 };
  let applyResult = null;

  try {
    // 1. 讀 source 統計
    srcStats = await getStats(srcPool, "source (dev DB)");

    // 2. 讀 target 統計 + 計算 diff
    if (tgtPool) {
      tgtStats = await getStats(tgtPool, "target (prod DB)");
      diff = await calcDiff(srcPool, tgtPool);
    } else {
      tgtStats = {
        available: false,
        activeTotal: null,
        providerCounts: {},
        sourceCounts: {},
      };
      notes.push("PROD_DATABASE_URL 未設定，target DB 統計及 diff 無法計算");
      notes.push("請在 Replit Secrets 加入 PROD_DATABASE_URL 後，再執行完整 dry-run");
    }

    // 3. apply（只在 --apply 模式）
    if (applyMode) {
      console.log("\n[apply] 確認安全限制：只操作 cvs_stores，不碰其他表");
      applyResult = await applySync(srcPool, tgtPool);
      // apply 後重新讀 target 統計
      tgtStats = await getStats(tgtPool, "target (prod DB) after apply");
    }

  } catch (err) {
    console.error("[ERROR]", err.message);
    notes.push(`執行錯誤：${err.message}`);
  } finally {
    await srcPool.end().catch(() => {});
    if (tgtPool) await tgtPool.end().catch(() => {});
  }

  // ── 組 report ────────────────────────────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? "dry-run" : "apply",
    providerFilter: providerFilter ?? null,
    rowLimit: rowLimit ?? null,
    source: srcStats ?? { available: false },
    target: tgtStats ?? { available: false },
    diff: isDryRun ? diff : {
      wouldInsert: 0,
      wouldUpdate: 0,
      wouldSkip: 0,
      note: "apply 模式，請查看 target 同步後統計",
    },
    applyResult: applyResult ?? null,
    safety: {
      writesEnabled: applyMode,
      tablesAllowed: ALLOWED_TABLES,
      tablesTouched: applyMode ? ["cvs_stores"] : [],
    },
    notes,
  };

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[sync-cvs-stores-to-prod] 完成");
  console.log(`  mode         : ${report.mode}`);
  console.log(`  source total : ${srcStats?.activeTotal ?? "N/A"} active`);
  console.log(`  target total : ${tgtStats?.activeTotal ?? "N/A"} active`);
  if (isDryRun && tgtPool) {
    console.log(`  wouldInsert  : ${diff.wouldInsert}`);
    console.log(`  wouldUpdate  : ${diff.wouldUpdate}`);
  }
  if (notes.length) {
    console.log("  注意事項：");
    notes.forEach(n => console.log(`    - ${n}`));
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (REPORT_PATH) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(`[sync-cvs-stores-to-prod] report 寫入：${REPORT_PATH}`);
  }
}

main().catch(err => {
  console.error("[FATAL]", err);
  process.exit(1);
});
