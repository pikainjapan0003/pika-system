/**
 * Smoke test：中華郵政 postOfficeAdapter
 * 測試貨號：97300922002170830005（spike 已驗證）
 *
 * 用法：node scripts/step7/test-postoffice-adapter.mjs
 *
 * 不寫 DB、不接 worker。
 */

import { queryPostOfficeTracking } from "../../artifacts/api-server/src/lib/logistics/adapters/postOfficeAdapter.ts";

const TRACKING_CODE = "97300922002170830005";

console.log("=== postOfficeAdapter smoke test ===");
console.log("Tracking code:", TRACKING_CODE);
console.log("Time:", new Date().toISOString());
console.log("");

const result = await queryPostOfficeTracking({ trackingCode: TRACKING_CODE });

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
  console.log(
    `  [${i}] ${e.occurredAt ?? "?"} | ${e.eventStatus} | ${e.eventLocation ?? ""}`,
  );
});

console.log("");
console.log("rawSummary:", JSON.stringify(result.rawSummary));

// Minimal assertions
const checks = [
  [result.provider === "postoffice", "provider === postoffice"],
  [result.trackingCode === TRACKING_CODE, "trackingCode matches"],
  [result.events.length > 0, "events non-empty"],
  [result.latestStatusText.length > 0, "latestStatusText non-empty"],
  [result.latestEventAt !== null, "latestEventAt non-null"],
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
