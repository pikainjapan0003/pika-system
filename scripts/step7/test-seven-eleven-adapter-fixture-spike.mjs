/**
 * Step 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE
 * Fixture-based spike: validates 7-11 adapter parser / normalization / bridge
 * WITHOUT external HTTP calls, WITHOUT OCR/tesseract, WITHOUT DB write.
 *
 * Purpose: preview-only contract test — verify the full data pipeline
 *   fixture HTML → parseResponse → buildEvents → normalizeSevenElevenStatus
 *   → bridgeSevenElevenResult → TrackingAdapterResult<"711">
 *
 * Status: PARTIAL
 * - fixture pipeline: PASS (parser, normalization, bridge all work)
 * - external HTTP: NOT TESTED (no safe tracking code available)
 * - OCR / tesseract: NOT TESTED (tesseract not installed in this env)
 * - DB write: NONE
 *
 * Not production-ready. Does not test external connectivity or OCR reliability.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const esbuildPath = path.resolve(
  __dirname,
  "../../artifacts/api-server/node_modules/esbuild/lib/main.js",
);
const { build } = await import(pathToFileURL(esbuildPath).href);

const ADAPTER = path.resolve(
  __dirname,
  "../../artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts",
);

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "s7-711-fixture-"));

async function loadAdapter() {
  const outfile = path.join(tmpDir, "adapter.mjs");
  await build({
    entryPoints: [ADAPTER],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

// ---------------------------------------------------------------------------
// Fixture HTML (no real tracking codes, no real store names)
// ---------------------------------------------------------------------------

const FIXTURE_TRACKING_CODE = "TESTFIXTURE"; // 11 chars — passes isValidOrderId

const FIXTURE_GET_HTML = `
<html><body>
<form id="form1">
<input type="hidden" id="__VIEWSTATE" value="viewstate_fixture_abc123" />
<input type="hidden" id="__VIEWSTATEGENERATOR" value="gen_fixture_def456" />
</form>
<img src="ValidateImage.aspx?ts=9876543210" />
</body></html>
`.trim();

const FIXTURE_POST_HTML = `
<html><body>
<span id="query_no">${FIXTURE_TRACKING_CODE}</span>
<span id="store_name">測試門市（FIXTURE）</span>
<span id="deadline">2026/07/01</span>
<span id="servicetype">交貨便</span>
<div class="m_news">已到店 2026/06/14 10:30:00</div>
<ul id="timeline_status">
<p>已到店 2026/06/14 10:30:00</p>
<p>配送中 2026/06/14 08:00:00</p>
<p>交寄建立 2026/06/13 15:00:00</p>
</ul>
</body></html>
`.trim();

// ---------------------------------------------------------------------------
// Mock deps — zero external calls
// ---------------------------------------------------------------------------

const mockFetch = async (url, opts = {}) => {
  if (opts && opts.method === "POST") {
    return { ok: true, text: () => Promise.resolve(FIXTURE_POST_HTML), headers: new Headers() };
  }
  if (String(url).includes("ValidateImage")) {
    return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), headers: new Headers() };
  }
  return { ok: true, text: () => Promise.resolve(FIXTURE_GET_HTML), headers: new Headers() };
};

const mockSolveCaptcha = async (_imageBytes) => "1234";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("=== Step 7O 7-11 Minimal Preview Adapter Spike (Fixture Only) ===");
console.log("TRACKING_CODE: FIXTURE (not a real code)");
console.log("Mode: FIXTURE ONLY — no external HTTP, no OCR, no DB write");
console.log("");

const {
  trackSevenElevenShipment,
  normalizeSevenElevenStatus,
  bridgeSevenElevenResult,
} = await loadAdapter();

// ---------------------------------------------------------------------------
// Test 1: normalizeSevenElevenStatus (pure function)
// ---------------------------------------------------------------------------

console.log("--- Test 1: normalizeSevenElevenStatus ---");
const normCases = [
  ["已取件", "picked_up"],
  ["取貨完成", "picked_up"],
  ["已到店", "arrived_store"],
  ["到店", "arrived_store"],
  ["退回", "returned"],
  ["異常", "exception"],
  ["配送中", "in_transit"],
  ["交寄建立", "pending"],
  ["", "unknown"],
  ["UNKNOWN_STATUS", "unknown"],
];
let normPass = 0;
for (const [input, expected] of normCases) {
  const actual = normalizeSevenElevenStatus(input);
  const ok = actual === expected;
  if (ok) normPass++;
  console.log(`  ${ok ? "OK" : "FAIL"} "${input}" -> ${actual} (expected ${expected})`);
}
console.log(`  RESULT: ${normPass}/${normCases.length} PASS`);
console.log("");

// ---------------------------------------------------------------------------
// Test 2: bridgeSevenElevenResult — success path
// ---------------------------------------------------------------------------

console.log("--- Test 2: bridgeSevenElevenResult (success path) ---");
const mockSuccessResult = {
  ok: true,
  provider: "711",
  trackingCode: FIXTURE_TRACKING_CODE,
  latestStatus: "已到店",
  pickupStoreName: "測試門市",
  pickupDeadline: "2026/07/01",
  paymentInfo: "交貨便",
  events: [
    { occurredAt: "2026/06/14 10:30:00", statusText: "已到店", rawText: "已到店 2026/06/14 10:30:00" },
    { occurredAt: "2026/06/14 08:00:00", statusText: "配送中", rawText: "配送中 2026/06/14 08:00:00" },
  ],
  rawSummary: {},
};
const bridgeOk = bridgeSevenElevenResult(mockSuccessResult);
const b2Pass =
  bridgeOk.ok === true &&
  bridgeOk.provider === "711" &&
  bridgeOk.normalizedStatus === "arrived_store" &&
  bridgeOk.events.length === 2 &&
  bridgeOk.latestStatusText === "已到店";
console.log(`  ok: ${bridgeOk.ok}`);
console.log(`  provider: ${bridgeOk.provider}`);
console.log(`  normalizedStatus: ${bridgeOk.normalizedStatus}`);
console.log(`  latestStatusText: ${bridgeOk.latestStatusText}`);
console.log(`  events.length: ${bridgeOk.events.length}`);
console.log(`  RESULT: ${b2Pass ? "PASS" : "FAIL"}`);
console.log("");

// ---------------------------------------------------------------------------
// Test 3: bridgeSevenElevenResult — error path
// ---------------------------------------------------------------------------

console.log("--- Test 3: bridgeSevenElevenResult (error path) ---");
const mockErrorResult = {
  ok: false,
  provider: "711",
  trackingCode: FIXTURE_TRACKING_CODE,
  errorCode: "OCR_FAILED",
  message: "solveCaptcha threw: tesseract not found",
  attempts: 3,
};
const bridgeErr = bridgeSevenElevenResult(mockErrorResult);
const b3Pass =
  bridgeErr.ok === false &&
  bridgeErr.provider === "711" &&
  bridgeErr.errorCode === "OCR_FAILED" &&
  bridgeErr.retryable === false;
console.log(`  ok: ${bridgeErr.ok}`);
console.log(`  errorCode: ${bridgeErr.errorCode}`);
console.log(`  retryable: ${bridgeErr.retryable}`);
console.log(`  RESULT: ${b3Pass ? "PASS" : "FAIL"}`);
console.log("");

// ---------------------------------------------------------------------------
// Test 4: trackSevenElevenShipment with fixture HTML — full pipeline
// ---------------------------------------------------------------------------

console.log("--- Test 4: trackSevenElevenShipment (fixture pipeline) ---");
console.log("  fetchImpl: MOCKED (fixture HTML, no external calls)");
console.log("  solveCaptcha: MOCKED -> returns '1234' (no tesseract)");

const result = await trackSevenElevenShipment(
  { trackingCode: FIXTURE_TRACKING_CODE, maxAttempts: 1 },
  { fetchImpl: mockFetch, solveCaptcha: mockSolveCaptcha },
);

let t4Pass = false;
if (result.ok) {
  const finalBridged = bridgeSevenElevenResult(result);
  t4Pass =
    result.provider === "711" &&
    result.trackingCode === FIXTURE_TRACKING_CODE &&
    result.events.length > 0 &&
    finalBridged.ok === true &&
    finalBridged.normalizedStatus !== undefined;

  console.log("  result.ok: true");
  console.log("  result.provider:", result.provider);
  console.log("  result.latestStatus:", result.latestStatus);
  console.log("  result.pickupStoreName:", result.pickupStoreName);
  console.log("  result.events.length:", result.events.length);
  console.log("  bridged.normalizedStatus:", finalBridged.normalizedStatus);
  console.log("  bridged.latestStatusText:", finalBridged.latestStatusText);
  console.log("  bridged.latestEventAt:", finalBridged.latestEventAt);
  console.log("");
  console.log("  Preview-only event shape (tracking code REDACTED):");
  console.log(`    provider: "711"`);
  console.log(`    normalizedStatus: "${finalBridged.normalizedStatus}"`);
  console.log(`    latestStatusText: "${finalBridged.latestStatusText}"`);
  console.log(`    latestEventAt: "${finalBridged.latestEventAt}"`);
  for (const e of finalBridged.events) {
    console.log(`    - occurredAt: "${e.occurredAt}" | status: "${e.eventStatus}"`);
  }
  console.log(`  RESULT: ${t4Pass ? "PASS" : "FAIL"}`);
} else {
  console.log("  result.ok: false");
  console.log("  errorCode:", result.errorCode);
  console.log("  message:", result.message);
  console.log("  RESULT: FAIL");
}
console.log("");

// ---------------------------------------------------------------------------
// Test 5: invalid tracking code (validation gate)
// ---------------------------------------------------------------------------

console.log("--- Test 5: invalid tracking code validation ---");
const invalidResult = await trackSevenElevenShipment(
  { trackingCode: "SHORT" },
  { fetchImpl: mockFetch, solveCaptcha: mockSolveCaptcha },
);
const t5Pass = !invalidResult.ok && invalidResult.errorCode === "NO_RESULT";
console.log(`  ok: ${invalidResult.ok}`);
console.log(`  errorCode: ${invalidResult.errorCode}`);
console.log(`  RESULT: ${t5Pass ? "PASS" : "FAIL"}`);
console.log("");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const allFixturePassed = normPass === normCases.length && b2Pass && b3Pass && t4Pass && t5Pass;

console.log("=== SPIKE SUMMARY ===");
console.log(`adapter POC exists:         YES (sevenElevenAdapter.ts)`);
console.log(`endpoint known:             YES (https://eservice.7-11.com.tw/e-tracking/search.aspx)`);
console.log(`fixture parser:             ${t4Pass ? "PASS" : "FAIL"}`);
console.log(`normalizeSevenElevenStatus: ${normPass}/${normCases.length} PASS`);
console.log(`bridgeSevenElevenResult:    ${b2Pass && b3Pass ? "PASS" : "FAIL"}`);
console.log(`full fixture pipeline:      ${t4Pass ? "PASS" : "FAIL"}`);
console.log(`external HTTP calls:        NONE (mocked)`);
console.log(`OCR / tesseract:            NOT_TESTED (mocked captcha; tesseract NOT_FOUND in env)`);
console.log(`DB write:                   NONE`);
console.log(`supportsAutoSync changed:   NO`);
console.log(`provider whitelist changed: NO`);
console.log(`COMMIT_ENABLED changed:     NO`);
console.log("");
console.log(
  `OVERALL: ${allFixturePassed ? "PARTIAL — fixture OK, external/OCR NOT tested" : "FAIL — see above"}`,
);
console.log(`Recommended next step: Step 7O-711-OCR-OR-SOURCE-VALIDATION`);

await fs.rm(tmpDir, { recursive: true, force: true });
