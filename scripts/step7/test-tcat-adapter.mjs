/**
 * Smoke test：黑貓宅急便 tcatAdapter
 * 測試貨號：135063214096（spike 已驗證）
 *
 * 用法：node scripts/step7/test-tcat-adapter.mjs
 *
 * 不寫 DB、不接 worker。
 */

import { queryTcatTracking } from "../../artifacts/api-server/src/lib/logistics/adapters/tcatAdapter.ts";

const TRACKING_CODE = "135063214096";
const EXPECTED_LATEST_STATUS = "順利送達";

console.log("=== tcatAdapter smoke test ===");
console.log("Tracking code:", TRACKING_CODE);
console.log("Time:", new Date().toISOString());
console.log("");

const result = await queryTcatTracking({ trackingCode: TRACKING_CODE });

if (!result.ok) {
  console.error("FAIL:", result.errorCode, "-", result.message);
  process.exit(1);
}

console.log("PASS: ok=true");
console.log("provider:", result.provider);
console.log("trackingCode:", result.trackingCode);
console.log("normalizedStatus:", result.normalizedStatus);
console.log("latestStatusText:", result.latestStatusText);
console.log("latestEventAt:", result.latestEventAt);
console.log("events:", result.events.length);
console.log("");

result.events.forEach((e, i) => {
  console.log(`  [${i}] ${e.occurredAt ?? "?"} | ${e.eventStatus} | ${e.eventLocation ?? ""}`);
});

// Minimal assertions
const checks = [
  [result.provider === "tcat", "provider === tcat"],
  [result.trackingCode === TRACKING_CODE, "trackingCode matches"],
  [result.events.length >= 4, `events >= 4 (got ${result.events.length})`],
  [
    result.latestStatusText === EXPECTED_LATEST_STATUS,
    `latestStatus === ${EXPECTED_LATEST_STATUS} (got ${result.latestStatusText})`,
  ],
  [result.latestEventAt?.startsWith("2026/05/29"), `latestEventAt starts with 2026/05/29 (got ${result.latestEventAt})`],
  [result.normalizedStatus === "delivered", `normalizedStatus === delivered (got ${result.normalizedStatus})`],
];

let allPassed = true;
for (const [pass, label] of checks) {
  if (!pass) {
    console.error("  CHECK FAILED:", label);
    allPassed = false;
  }
}

if (allPassed) {
  console.log("\nAll checks passed.");
} else {
  process.exit(1);
}
