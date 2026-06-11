#!/usr/bin/env node
/**
 * Step 7F — FamilyMart tracking worker 排程入口（Replit Workflow / cron 用）。
 *
 * Usage:
 *   pnpm step7:familymart-worker
 *   node scripts/step7/run-familymart-worker-scheduled.mjs
 * Env（皆 optional）:
 *   LIMIT=20 TIMEOUT_MS=15000 DRY_RUN=1 STORE_ID=1
 *
 * 與 run-familymart-worker-once.mjs 差異：
 *   - run_type = scheduled_worker
 *   - 預設 LIMIT=20、TIMEOUT_MS=15000
 *   - 啟動前查 shipment_tracking_run_logs：若 provider=familymart、status=running、
 *     started_at 在最近 30 分鐘內，直接 already_running 退出（exit 0），防止重疊執行。
 *
 * 輸出只含遮罩後 trackingCode 與狀態摘要，不輸出個資 / raw response。
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (!process.env.__FAMI_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--import", path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"), fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __FAMI_TSX: "1" } }
  );
  process.exit(r.status ?? 1);
}

const { runFamilyMartTrackingWorker } = await import(
  pathToFileURL(path.join(ROOT, "artifacts/api-server/src/lib/logistics/workers/familyMartTrackingWorker.ts"))
);
const { db, shipmentTrackingRunLogsTable } = await import(
  pathToFileURL(path.join(ROOT, "lib/db/src/index.ts"))
);
const { and, eq, gte } = await import(
  pathToFileURL(path.join(ROOT, "artifacts/api-server/node_modules/drizzle-orm/index.js"))
);

export function maskCode(code) {
  if (!code || code.length < 8) return "****";
  return `${code.slice(0, 4)}****${code.slice(-4)}`;
}

/** running lock window：30 分鐘內仍 running 的 scheduled run 視為進行中 */
const LOCK_WINDOW_MS = 30 * 60 * 1000;

const dryRun = process.env.DRY_RUN === "1";

// 防重前置檢查（方案 B：不改 worker 本體）
const lockCutoff = new Date(Date.now() - LOCK_WINDOW_MS);
const runningRows = await db
  .select({ id: shipmentTrackingRunLogsTable.id, startedAt: shipmentTrackingRunLogsTable.startedAt })
  .from(shipmentTrackingRunLogsTable)
  .where(
    and(
      eq(shipmentTrackingRunLogsTable.provider, "familymart"),
      eq(shipmentTrackingRunLogsTable.runType, "scheduled_worker"),
      eq(shipmentTrackingRunLogsTable.status, "running"),
      gte(shipmentTrackingRunLogsTable.startedAt, lockCutoff),
    ),
  )
  .limit(1);

if (runningRows.length > 0) {
  console.log(
    `already_running: runLogId=${runningRows[0].id} startedAt=${runningRows[0].startedAt.toISOString()} — skip this round`
  );
  process.exit(0);
}

const result = await runFamilyMartTrackingWorker({
  limit: process.env.LIMIT ? Number(process.env.LIMIT) : 20,
  storeId: process.env.STORE_ID ? Number(process.env.STORE_ID) : undefined,
  dryRun,
  timeoutMs: process.env.TIMEOUT_MS ? Number(process.env.TIMEOUT_MS) : 15000,
  runType: "scheduled_worker",
  createdBy: "scheduled-script",
});

console.log(`provider=${result.provider} dryRun=${result.dryRun} runLogId=${result.runLogId}`);
console.log(`totalJobs=${result.totalJobs} success=${result.successCount} failed=${result.failedCount} skipped=${result.skippedCount}`);
for (const r of result.results) {
  const parts = [`#${r.shipmentTrackingId}`, maskCode(r.trackingCode), r.status];
  if (r.normalizedStatus) parts.push(r.normalizedStatus);
  if (r.latestStatusText) parts.push(`"${r.latestStatusText}"`);
  if (r.errorCode) parts.push(`error=${r.errorCode}`);
  if (r.insertedEventCount !== undefined) parts.push(`+${r.insertedEventCount}ev`);
  console.log(`  ${parts.join(" ")}`);
}
process.exit(0);
