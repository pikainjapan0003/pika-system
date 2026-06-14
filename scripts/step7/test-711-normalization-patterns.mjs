/**
 * Step 7O-711-E2E-STABILITY-RETRY — normalization pattern test
 * Validates normalizeSevenElevenStatus against the 8 real E2E status texts
 * observed in the previous step (tracking code last4: ****7678).
 *
 * No external HTTP. No OCR. No DB write.
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

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "s7-711-norm-"));

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

const { normalizeSevenElevenStatus } = await loadAdapter();

console.log("=== Step 7O-711-E2E-STABILITY-RETRY: Normalization Pattern Test ===");
console.log("Tracking code: ****7678 (last4 only)");
console.log("");

// 8 real status texts from E2E retry run (****7678, tesseract 5.3.4, attempt #2)
const realE2ECases = [
  ["已完成包裹成功取件",                                        "picked_up"],
  ["包裹配達取件門市",                                           "arrived_store"],
  ["包裹離開【南區】物流中心，前往取件門市",                      "in_transit"],
  ["包裹已於【南區】物流中心理貨完成，即將前往取件門市",          "in_transit"],
  ["包裹已送達【北區】物流中心，進行理貨轉運中",                  "in_transit"],
  ["包裹離開寄件門市，前往【北區】物流中心",                      "in_transit"],
  ["寄件門市已收件",                                            "pending"],
  ["交貨便訂單已成立，尚未至門市寄件",                           "pending"],
];

// Regression: existing patterns must still work
const regressionCases = [
  ["已取件",          "picked_up"],
  ["取貨完成",        "picked_up"],
  ["已到店",          "arrived_store"],
  ["到店",            "arrived_store"],
  ["退回",            "returned"],
  ["異常",            "exception"],
  ["配送中",          "in_transit"],
  ["交寄建立",        "pending"],
  ["",               "unknown"],
  ["UNKNOWN_STATUS", "unknown"],
];

let totalPass = 0;
let totalFail = 0;

function runCases(label, cases) {
  console.log(`--- ${label} ---`);
  let pass = 0;
  for (const [input, expected] of cases) {
    const actual = normalizeSevenElevenStatus(input);
    const ok = actual === expected;
    if (ok) pass++;
    else totalFail++;
    console.log(`  ${ok ? "OK" : "FAIL"} "${input}" -> ${actual} (expected ${expected})`);
  }
  totalPass += pass;
  console.log(`  RESULT: ${pass}/${cases.length} PASS`);
  console.log("");
  return pass;
}

const e2ePass  = runCases("Real E2E status texts (****7678)", realE2ECases);
const regPass  = runCases("Regression: existing patterns",   regressionCases);

console.log("=== SUMMARY ===");
console.log(`Real E2E cases:   ${e2ePass}/${realE2ECases.length} PASS`);
console.log(`Regression cases: ${regPass}/${regressionCases.length} PASS`);
console.log(`Total:            ${totalPass}/${realE2ECases.length + regressionCases.length} PASS`);
console.log("");

if (totalFail === 0) {
  console.log("OVERALL: PASS");
} else {
  console.log(`OVERALL: FAIL (${totalFail} cases failed)`);
  process.exit(1);
}

await fs.rm(tmpDir, { recursive: true, force: true });
