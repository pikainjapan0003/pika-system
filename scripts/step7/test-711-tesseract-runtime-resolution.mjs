/**
 * Step 7O-711-RUNTIME-TESSERACT-FIX — binary resolution test
 *
 * Tests that resolveTesseractBinary() finds a working tesseract binary
 * without requiring TESSERACT_BIN to be set in the environment.
 *
 * Run via: node scripts/step7/test-711-tesseract-runtime-resolution.mjs
 * Does NOT write to DB, does NOT call external services.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// Build the adapter so we can import resolveTesseractBinary
const esbuildPath = path.resolve(
  ROOT,
  "artifacts/api-server/node_modules/esbuild/lib/main.js",
);
const { build } = await import(pathToFileURL(esbuildPath).href);

import os from "node:os";
import fs from "node:fs/promises";

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "s7-711-res-"));
const outfile = path.join(tmpDir, "adapter.mjs");

const ADAPTER = path.resolve(
  ROOT,
  "artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts",
);
await build({
  entryPoints: [ADAPTER],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
  external: ["node:*"],
});

const { resolveTesseractBinary } = await import(pathToFileURL(outfile).href);

// ─── Tests ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(label, condition) {
  if (condition) {
    console.log(`  ✔ ${label}`);
    pass++;
  } else {
    console.error(`  ✘ ${label}`);
    fail++;
  }
}

console.log("\n=== Step 7O: tesseract binary resolution test ===\n");

// Test 1: TESSERACT_BIN unset → should find a binary
delete process.env.TESSERACT_BIN;
const resolved = resolveTesseractBinary();
console.log(`[1] resolveTesseractBinary() (no TESSERACT_BIN) = ${resolved}`);
ok(
  "returns a non-empty string",
  typeof resolved === "string" && resolved.length > 0,
);
ok("not bare 'tesseract' (found nix path)", resolved !== "tesseract");

// Test 2: resolved binary is executable
let versionOut = "";
let versionErr = "";
try {
  const r = spawnSync(resolved, ["--version"], { encoding: "utf8" });
  versionOut = r.stdout || "";
  versionErr = r.stderr || "";
  ok("binary is executable (spawnSync exit 0)", r.status === 0);
  ok(
    "output contains 'tesseract'",
    (versionOut + versionErr).toLowerCase().includes("tesseract"),
  );
  console.log(`   version: ${(versionOut + versionErr).split("\n")[0].trim()}`);
} catch (e) {
  console.error(`   spawn error: ${e.message}`);
  ok("binary is executable", false);
  ok("output contains 'tesseract'", false);
}

// Test 3: TESSERACT_BIN env override works
process.env.TESSERACT_BIN = "/custom/path/tesseract";
const withEnv = resolveTesseractBinary();
ok("TESSERACT_BIN env takes priority", withEnv === "/custom/path/tesseract");
delete process.env.TESSERACT_BIN;

// Test 4: no ENOENT when called via spawn (no PATH fallback needed)
let enoentFree = true;
try {
  const r2 = spawnSync(resolved, ["--version"], { encoding: "utf8" });
  if (r2.error) {
    enoentFree = false;
  }
} catch {
  enoentFree = false;
}
ok("spawn resolved binary does not throw ENOENT", enoentFree);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n=== RESULT: ${pass} PASS, ${fail} FAIL ===\n`);
if (fail > 0) process.exit(1);
