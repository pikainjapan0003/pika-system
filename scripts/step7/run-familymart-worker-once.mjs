#!/usr/bin/env node
/**
 * Step 7F — 手動跑一次 FamilyMart tracking worker。
 *
 * Usage:
 *   node scripts/step7/run-familymart-worker-once.mjs
 * Env:
 *   LIMIT=5 STORE_ID=1 TRACKING_ID=123 DRY_RUN=1 TIMEOUT_MS=15000
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

export function maskCode(code) {
  if (!code || code.length < 8) return "****";
  return `${code.slice(0, 4)}****${code.slice(-4)}`;
}

const input = {
  limit: process.env.LIMIT ? Number(process.env.LIMIT) : undefined,
  storeId: process.env.STORE_ID ? Number(process.env.STORE_ID) : undefined,
  trackingIds: process.env.TRACKING_ID ? [Number(process.env.TRACKING_ID)] : undefined,
  dryRun: process.env.DRY_RUN === "1",
  timeoutMs: process.env.TIMEOUT_MS ? Number(process.env.TIMEOUT_MS) : undefined,
};

const result = await runFamilyMartTrackingWorker(input);

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
