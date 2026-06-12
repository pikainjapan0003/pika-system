/**
 * Step 7N-C：controlled worker single-order / small batch（no-write）測試
 *
 * 正常流程（實跑外部）：postoffice 單筆、tcat 單筆、mixed batch、711 gate-only。
 * 防護流程（mock，不打外部）：batch>5、unknown provider、empty code、
 * circuit breaker、retryable 不熔斷、rate limit fake sleep。
 *
 * 用法：node --experimental-strip-types scripts/step7/test-multi-provider-controlled-worker.mjs
 */

import { readFileSync } from "node:fs";
import {
  runControlledWorkerBatch,
} from "../../artifacts/api-server/src/lib/logistics/workers/multiProviderDryRunWorker.ts";

const PO_CODE = "97300922002170830005";
const TCAT_CODE = "135063214096";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  PASS: ${name}`);
  else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const noSleep = async () => {};

console.log("=== controlled worker (no-write) test ===");
console.log("Time:", new Date().toISOString());

// 1. postoffice single-order（實跑外部；單筆無 delay 需求，仍給 fake sleep 保險）
console.log("\n--- [1] postoffice single-order ---");
const po = await runControlledWorkerBatch(
  [{ provider: "postoffice", trackingCode: PO_CODE, trackingId: 1, orderId: 101, storeId: 9 }],
  { sleep: noSleep },
);
console.log(JSON.stringify(po.jobs[0], null, 2));
check("noWrite=true / dryRun=true", po.noWrite === true && po.dryRun === true);
check("ok=true", po.jobs[0]?.ok === true, po.jobs[0]?.errorCode ?? "");
check("wouldWriteEvents=5", po.jobs[0]?.wouldWriteEvents === 5, `got ${po.jobs[0]?.wouldWriteEvents}`);
check("latestStatusText=投遞成功", po.jobs[0]?.latestStatusText === "投遞成功");
check("input passthrough (trackingId/orderId/storeId)", po.jobs[0]?.trackingId === 1 && po.jobs[0]?.orderId === 101 && po.jobs[0]?.storeId === 9);

// 2. tcat single-order（實跑外部）
console.log("\n--- [2] tcat single-order ---");
const tc = await runControlledWorkerBatch(
  [{ provider: "tcat", trackingCode: TCAT_CODE }],
  { sleep: noSleep },
);
console.log(JSON.stringify(tc.jobs[0]?.idempotencyKeysPreview, null, 2));
check("ok=true", tc.jobs[0]?.ok === true, tc.jobs[0]?.errorCode ?? "");
check("wouldWriteEvents=5", tc.jobs[0]?.wouldWriteEvents === 5, `got ${tc.jobs[0]?.wouldWriteEvents}`);
check("latestStatusText=順利送達", tc.jobs[0]?.latestStatusText === "順利送達");
const tcKeys = tc.jobs[0]?.idempotencyKeysPreview ?? [];
check("tcat keys length=5", tcKeys.length === 5);
check("tcat keys no collision (location in key)", new Set(tcKeys).size === tcKeys.length);
check(
  "tcat keys contain location segment",
  tcKeys.every((k) => k.split(":").length >= 5),
);

// 3. mixed small batch（實跑外部，fake sleep 計次驗證 rate limit）
console.log("\n--- [3] mixed small batch (postoffice + tcat) ---");
let sleepCalls = [];
const countingSleep = async (ms) => { sleepCalls.push(ms); };
const mixed = await runControlledWorkerBatch(
  [
    { provider: "postoffice", trackingCode: PO_CODE },
    { provider: "tcat", trackingCode: TCAT_CODE },
  ],
  { sleep: countingSleep, delayMs: 300 },
);
check("totalJobs=2", mixed.totalJobs === 2);
check("successCount=2", mixed.successCount === 2, JSON.stringify(mixed.providerSummary));
check("dryRun=true / noWrite=true", mixed.dryRun === true && mixed.noWrite === true);
check("rateLimitApplied=true", mixed.rateLimitApplied === true);
check("appliedDelayMs=300", mixed.appliedDelayMs === 300);
check("sleep called once between 2 jobs", sleepCalls.length === 1 && sleepCalls[0] === 300, JSON.stringify(sleepCalls));

// 4. 711 gate-only（不打外部）
console.log("\n--- [4] 711 gate-only ---");
const se = await runControlledWorkerBatch(
  [{ provider: "711", trackingCode: "12345678901" }],
  { sleep: noSleep },
);
console.log(JSON.stringify(se.jobs[0], null, 2));
check("711 skipped=true", se.jobs[0]?.skipped === true);
check("711 skippedReason=CONTROLLED_WORKER_DISABLED", se.jobs[0]?.skippedReason?.startsWith("CONTROLLED_WORKER_DISABLED") === true);
check("711 no external call (adapterOk=false)", se.jobs[0]?.adapterOk === false && se.jobs[0]?.wouldWriteEvents === 0);

// 5. batch size > 5 → 拒絕
console.log("\n--- [5] batch size > 5 rejected ---");
let batchRejected = false;
try {
  await runControlledWorkerBatch(
    Array.from({ length: 6 }, (_, i) => ({ provider: "tcat", trackingCode: `X${i}` })),
    { sleep: noSleep, adapters: { tcat: async () => { throw new Error("should not be called"); } } },
  );
} catch (err) {
  batchRejected = String(err.message).startsWith("BATCH_SIZE_EXCEEDED");
}
check("batch>5 rejected with BATCH_SIZE_EXCEEDED", batchRejected);

// 6 + 7. unknown provider / empty trackingCode（不打外部）
console.log("\n--- [6][7] unknown provider / empty trackingCode ---");
const guard = await runControlledWorkerBatch(
  [
    { provider: "unknown-x", trackingCode: "A1" },
    { provider: "postoffice", trackingCode: "" },
  ],
  { sleep: noSleep, adapters: { postoffice: async () => { throw new Error("should not be called"); } } },
);
check("unknown provider skipped", guard.jobs[0]?.skippedReason?.startsWith("UNSUPPORTED_PROVIDER") === true);
check("empty trackingCode skipped", guard.jobs[1]?.skippedReason === "EMPTY_TRACKING_CODE");
check("skippedCount=2", guard.skippedCount === 2);

// 8. circuit breaker：mock tcat 連續 non-retryable → 第 3 筆起 skipped
console.log("\n--- [8] circuit breaker (non-retryable) ---");
let cbCalls = 0;
const cb = await runControlledWorkerBatch(
  [
    { provider: "tcat", trackingCode: "C1" },
    { provider: "tcat", trackingCode: "C2" },
    { provider: "tcat", trackingCode: "C3" },
    { provider: "tcat", trackingCode: "C4" },
  ],
  {
    sleep: noSleep,
    circuitBreakerThreshold: 2,
    adapters: {
      tcat: async ({ trackingCode }) => {
        cbCalls++;
        return {
          ok: false, provider: "tcat", trackingCode,
          errorCode: "HTML_PARSE_FAILED", message: "mock parse failure", retryable: false,
        };
      },
    },
  },
);
console.log(JSON.stringify(cb.providerSummary, null, 2));
check("adapter called only 2 times (then circuit open)", cbCalls === 2, `got ${cbCalls}`);
check("jobs 3,4 circuitBreakerSkipped", cb.jobs[2]?.circuitBreakerSkipped === true && cb.jobs[3]?.circuitBreakerSkipped === true);
check("providerSummary.tcat.circuitBreakerTriggered=true", cb.providerSummary.tcat?.circuitBreakerTriggered === true);
check("failedCount=2, skippedCount=2", cb.failedCount === 2 && cb.skippedCount === 2);

// 9. retryable failure 不熔斷
console.log("\n--- [9] retryable failures do NOT trip breaker ---");
let rtCalls = 0;
const rt = await runControlledWorkerBatch(
  [
    { provider: "postoffice", trackingCode: "R1" },
    { provider: "postoffice", trackingCode: "R2" },
    { provider: "postoffice", trackingCode: "R3" },
  ],
  {
    sleep: noSleep,
    circuitBreakerThreshold: 2,
    adapters: {
      postoffice: async ({ trackingCode }) => {
        rtCalls++;
        return {
          ok: false, provider: "postoffice", trackingCode,
          errorCode: "TIMEOUT", message: "mock timeout", retryable: true,
        };
      },
    },
  },
);
check("all 3 retryable jobs executed (no breaker)", rtCalls === 3, `got ${rtCalls}`);
check("circuitBreakerTriggered=false", rt.providerSummary.postoffice?.circuitBreakerTriggered === false);
check("failedCount=3, skippedCount=0", rt.failedCount === 3 && rt.skippedCount === 0);

// 10. rate limit fake sleep（mock adapter，4 jobs → 3 次 delay）
console.log("\n--- [10] rate limit fake sleep ---");
sleepCalls = [];
const rl = await runControlledWorkerBatch(
  [
    { provider: "tcat", trackingCode: "S1" },
    { provider: "tcat", trackingCode: "S2" },
    { provider: "tcat", trackingCode: "S3" },
    { provider: "711", trackingCode: "12345678901" },
    { provider: "tcat", trackingCode: "S4" },
  ],
  {
    sleep: countingSleep,
    delayMs: 250,
    adapters: {
      tcat: async ({ trackingCode }) => ({
        ok: true, provider: "tcat", trackingCode,
        normalizedStatus: "in_transit", latestStatusText: "配送中",
        latestEventAt: "2026/06/01 10:00",
        events: [{ eventStatus: "配送中", eventDescription: "配送中", eventLocation: "mock", occurredAt: "2026/06/01 10:00", rawData: {} }],
        rawSummary: {},
      }),
    },
  },
);
check("sleep called 3 times (between external calls only, skip 不計)", sleepCalls.length === 3, JSON.stringify(sleepCalls));
check("appliedDelayMs=250", rl.appliedDelayMs === 250);
check("rateLimitApplied=true", rl.rateLimitApplied === true);

// 11. no DB import check
console.log("\n--- [11] no DB import check ---");
const workerSrc = readFileSync(
  new URL("../../artifacts/api-server/src/lib/logistics/workers/multiProviderDryRunWorker.ts", import.meta.url),
  "utf8",
);
check("no @workspace/db import", !workerSrc.includes("@workspace/db"));
check("no drizzle import", !workerSrc.includes("drizzle"));
check("no db.insert/db.update/db.select", !/\bdb\.(insert|update|select|delete)\b/.test(workerSrc));

console.log("");
if (failures > 0) {
  console.error(`RESULT: FAIL (${failures} failed checks)`);
  process.exit(1);
}
console.log("RESULT: ALL PASS");
