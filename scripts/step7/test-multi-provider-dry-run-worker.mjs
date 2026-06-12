/**
 * Step 7N-B：multi-provider dry-run worker 測試
 *
 * postoffice / tcat 實跑外部查詢（dry-run，不寫 DB）；
 * 7-11 gate-only（不打外部）。
 *
 * 用法：node --experimental-strip-types scripts/step7/test-multi-provider-dry-run-worker.mjs
 */

import {
  runMultiProviderDryRun,
  DRY_RUN_PROVIDER_GATE,
} from "../../artifacts/api-server/src/lib/logistics/workers/multiProviderDryRunWorker.ts";

const INPUTS = [
  { provider: "postoffice", trackingCode: "97300922002170830005" },
  { provider: "tcat", trackingCode: "135063214096" },
  { provider: "711", trackingCode: "DUMMY-711-GATE-ONLY" },
];

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    console.log(`  PASS: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("=== multi-provider dry-run worker test ===");
console.log("Time:", new Date().toISOString());
console.log("");

const summary = await runMultiProviderDryRun(INPUTS);

console.log("--- run summary preview ---");
console.log(
  JSON.stringify(
    {
      dryRun: summary.dryRun,
      totalJobs: summary.totalJobs,
      successCount: summary.successCount,
      failedCount: summary.failedCount,
      skippedCount: summary.skippedCount,
      errorCodeSummary: summary.errorCodeSummary,
    },
    null,
    2,
  ),
);
console.log("");

check("summary.dryRun === true", summary.dryRun === true);
check("totalJobs === 3", summary.totalJobs === 3, `got ${summary.totalJobs}`);

// --- postoffice ---
const po = summary.results.find((r) => r.provider === "postoffice");
console.log("");
console.log("--- postoffice dry-run result ---");
console.log(JSON.stringify(po, null, 2));
check("postoffice ok=true", po?.ok === true, po?.errorCode ?? po?.skippedReason ?? "");
check("postoffice wouldWriteEvents=5", po?.wouldWriteEvents === 5, `got ${po?.wouldWriteEvents}`);
check("postoffice wouldUpdateSnapshot=true", po?.wouldUpdateSnapshot === true);
check("postoffice latestStatusText=投遞成功", po?.latestStatusText === "投遞成功", `got ${po?.latestStatusText}`);
check(
  "postoffice latestEventAt=2026/06/08 11:21:53",
  po?.latestEventAt === "2026/06/08 11:21:53",
  `got ${po?.latestEventAt}`,
);
check(
  "postoffice idempotencyKeysPreview length=5",
  po?.idempotencyKeysPreview?.length === 5,
  `got ${po?.idempotencyKeysPreview?.length}`,
);
check(
  "postoffice keys prefixed with provider:code",
  (po?.idempotencyKeysPreview ?? []).every((k) => k.startsWith("postoffice:97300922002170830005:")),
);

// --- tcat ---
const tc = summary.results.find((r) => r.provider === "tcat");
console.log("");
console.log("--- tcat dry-run result ---");
console.log(JSON.stringify(tc, null, 2));
check("tcat ok=true", tc?.ok === true, tc?.errorCode ?? tc?.skippedReason ?? "");
check("tcat wouldWriteEvents=5", tc?.wouldWriteEvents === 5, `got ${tc?.wouldWriteEvents}`);
check("tcat wouldUpdateSnapshot=true", tc?.wouldUpdateSnapshot === true);
check("tcat latestStatusText=順利送達", tc?.latestStatusText === "順利送達", `got ${tc?.latestStatusText}`);
check(
  "tcat latestEventAt=2026/05/29 08:31",
  tc?.latestEventAt === "2026/05/29 08:31",
  `got ${tc?.latestEventAt}`,
);
check(
  "tcat idempotencyKeysPreview length=5",
  tc?.idempotencyKeysPreview?.length === 5,
  `got ${tc?.idempotencyKeysPreview?.length}`,
);
check(
  "tcat keys prefixed with provider:code",
  (tc?.idempotencyKeysPreview ?? []).every((k) => k.startsWith("tcat:135063214096:")),
);
check(
  "tcat keys unique (location in key, 7N-C)",
  new Set(tc?.idempotencyKeysPreview ?? []).size === (tc?.idempotencyKeysPreview ?? []).length,
);

// --- 711 gate-only ---
const se = summary.results.find((r) => r.provider === "711");
console.log("");
console.log("--- 7-11 gate-only result ---");
console.log(JSON.stringify(se, null, 2));
check("711 skipped (gate-only)", typeof se?.skippedReason === "string" && se.skippedReason.startsWith("GATE_ONLY"));
check("711 no external call (adapterOk=false, no events)", se?.adapterOk === false && se?.wouldWriteEvents === 0);
check("711 gate.controlledWorkerEnabled=false", se?.gate?.controlledWorkerEnabled === false);
check("711 gate.scheduledSyncEnabled=false", se?.gate?.scheduledSyncEnabled === false);
check("711 gate.requiresManualFallback=true", se?.gate?.requiresManualFallback === true);

// --- gate config sanity ---
console.log("");
console.log("--- gate config ---");
console.log(JSON.stringify(DRY_RUN_PROVIDER_GATE, null, 2));
check("postoffice scheduledSyncEnabled=false", DRY_RUN_PROVIDER_GATE.postoffice.scheduledSyncEnabled === false);
check("tcat scheduledSyncEnabled=false", DRY_RUN_PROVIDER_GATE.tcat.scheduledSyncEnabled === false);
check("familymart scheduledSyncEnabled=true", DRY_RUN_PROVIDER_GATE.familymart.scheduledSyncEnabled === true);

// --- gate negative cases（不打外部）---
const negative = await runMultiProviderDryRun([
  { provider: "unknown-provider", trackingCode: "X1" },
  { provider: "postoffice", trackingCode: "" },
]);
console.log("");
console.log("--- negative gate cases ---");
console.log(JSON.stringify(negative.results, null, 2));
check(
  "unknown provider skipped",
  negative.results[0]?.skippedReason?.startsWith("UNSUPPORTED_PROVIDER") === true,
);
check(
  "empty trackingCode skipped",
  negative.results[1]?.skippedReason === "EMPTY_TRACKING_CODE",
);

console.log("");
if (failures > 0) {
  console.error(`RESULT: FAIL (${failures} failed checks)`);
  process.exit(1);
}
console.log("RESULT: ALL PASS");
