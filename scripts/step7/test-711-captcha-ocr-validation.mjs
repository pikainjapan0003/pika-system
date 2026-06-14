/**
 * Step 7O-711-OCR-OR-SOURCE-VALIDATION
 * 最小 captcha-only OCR 驗證：只做 GET + 圖片下載 + OCR。
 * 不送 tracking code、不查詢貨態、不寫 DB、不修改任何正式路徑。
 *
 * 目的：確認此環境可否用 tesseract + ImageMagick 辨識 7-11 驗證碼圖片。
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const SEARCH_URL = "https://eservice.7-11.com.tw/e-tracking/search.aspx";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BASE_URL = "https://eservice.7-11.com.tw/e-tracking/";

const TESSERACT =
  process.env.TESSERACT_BIN ||
  "/nix/store/89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00/bin/tesseract";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "s7-711-captcha-"));

console.log("=== Step 7O-711-OCR-OR-SOURCE-VALIDATION ===");
console.log("Mode: captcha-only (GET + image download + OCR, NO tracking submission)");
console.log("tesseract:", TESSERACT);
console.log("");

// ---------------------------------------------------------------------------
// Step 1: 確認 tesseract binary
// ---------------------------------------------------------------------------
console.log("--- [1] tesseract binary check ---");
const versionResult = spawnSync(TESSERACT, ["--version"], { encoding: "utf8" });
if (versionResult.status !== 0 || versionResult.error) {
  console.log("  RESULT: BLOCKED — tesseract binary not found or not executable");
  console.log("  error:", versionResult.error?.message ?? versionResult.stderr);
  process.exit(1);
}
const version = (versionResult.stdout || versionResult.stderr || "").split("\n")[0];
console.log("  version:", version);
console.log("  RESULT: OK");
console.log("");

// ---------------------------------------------------------------------------
// Step 2: GET 7-11 search page（取 captcha URL）— 不送 tracking code
// ---------------------------------------------------------------------------
console.log("--- [2] GET eservice.7-11.com.tw/e-tracking/search.aspx ---");
let captchaUrl = null;
let cookie = "";
let getReachable = false;

try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const res = await fetch(SEARCH_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  getReachable = res.ok;
  console.log("  HTTP status:", res.status, res.ok ? "OK" : "FAIL");

  if (res.ok) {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const html = await res.text();
    const m = html.match(/src="(ValidateImage\.aspx\?ts=[0-9]+)"/i);
    if (m) {
      captchaUrl = BASE_URL + m[1];
      console.log("  captcha URL found: ValidateImage.aspx?ts=XXXXX (masked)");
    } else {
      console.log("  WARNING: captcha URL not found in HTML — page structure may have changed");
    }
  }
} catch (err) {
  console.log("  RESULT: NETWORK_FAILED —", err.message);
}

if (!getReachable) {
  console.log("  RESULT: BLOCKED — cannot reach 7-11 server");
  console.log("  Conclusion: Network access to eservice.7-11.com.tw is blocked in this environment.");
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}
console.log("  RESULT:", captchaUrl ? "OK (captcha URL extracted)" : "PARTIAL (page reached, no captcha URL)");
console.log("");

if (!captchaUrl) {
  console.log("=== CONCLUSION: PARTIAL ===");
  console.log("  server reachable, but captcha URL extraction failed");
  console.log("  Possible cause: page structure changed since adapter was written");
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 3: 下載 captcha 圖片
// ---------------------------------------------------------------------------
console.log("--- [3] Download captcha image ---");
let imageBytes = null;
try {
  const ctrl2 = new AbortController();
  const timer2 = setTimeout(() => ctrl2.abort(), 8000);
  const imgRes = await fetch(captchaUrl, {
    headers: { "User-Agent": USER_AGENT, Cookie: cookie, Referer: SEARCH_URL },
    signal: ctrl2.signal,
  });
  clearTimeout(timer2);
  if (imgRes.ok) {
    const buf = await imgRes.arrayBuffer();
    imageBytes = Buffer.from(buf);
    console.log("  image size:", imageBytes.length, "bytes");
    console.log("  RESULT: OK");
  } else {
    console.log("  RESULT: FAIL — HTTP", imgRes.status);
  }
} catch (err) {
  console.log("  RESULT: FAIL —", err.message);
}

if (!imageBytes) {
  console.log("=== CONCLUSION: PARTIAL ===");
  console.log("  captcha image download failed");
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

const srcImg = path.join(tmpDir, "captcha.jpg");
writeFileSync(srcImg, imageBytes);

// ---------------------------------------------------------------------------
// Step 4: OCR — 複數前處理バリアントを試す
// ---------------------------------------------------------------------------
console.log("");
console.log("--- [4] OCR with preprocessing variants ---");

const VARIANTS = [
  { label: "raw (no preprocess)",   args: null },
  { label: "Gray+400%+threshold45", args: ["-colorspace", "Gray", "-resize", "400%", "-threshold", "45%"] },
  { label: "Gray+400%+threshold55", args: ["-colorspace", "Gray", "-resize", "400%", "-threshold", "55%"] },
  { label: "Gray+400%+threshold65", args: ["-colorspace", "Gray", "-resize", "400%", "-threshold", "65%"] },
  { label: "Gray+400%+normalize",   args: ["-colorspace", "Gray", "-resize", "400%", "-normalize", "-threshold", "50%"] },
];

const results = [];
for (let i = 0; i < VARIANTS.length; i++) {
  const { label, args } = VARIANTS[i];
  let inputImg = srcImg;

  if (args) {
    const preOut = path.join(tmpDir, `pre${i}.png`);
    const magickResult = spawnSync("magick", [srcImg, ...args, preOut], { encoding: "utf8" });
    if (magickResult.status !== 0) {
      results.push({ label, digit: null, error: "magick preprocess failed" });
      continue;
    }
    inputImg = preOut;
  }

  const tessResult = spawnSync(
    TESSERACT,
    [inputImg, "stdout", "--psm", "8", "-c", "tessedit_char_whitelist=0123456789"],
    { encoding: "utf8" },
  );
  const raw = (tessResult.stdout || "").replace(/\D/g, "");
  const is4digit = raw.length === 4;
  results.push({ label, digit: raw, is4digit });
  console.log(`  [${i}] ${label}`);
  console.log(`      OCR: "${raw}" — ${is4digit ? "4-digit PASS" : "not 4-digit"}`);
}

const anyPass = results.some((r) => r.is4digit);
const passCount = results.filter((r) => r.is4digit).length;
console.log("");
console.log(`  Variants with 4-digit output: ${passCount}/${VARIANTS.length}`);
console.log(`  RESULT: ${anyPass ? "PARTIAL PASS (at least one variant produced 4 digits)" : "FAIL (no variant produced 4 digits)"}`);
console.log("");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("=== SUMMARY ===");
console.log("tesseract binary:         OK (" + version + ")");
console.log("server reachable:         " + (getReachable ? "YES" : "NO"));
console.log("captcha URL extracted:    " + (captchaUrl ? "YES" : "NO"));
console.log("captcha image download:   " + (imageBytes ? "YES (" + imageBytes.length + " bytes)" : "NO"));
console.log("OCR 4-digit success rate: " + passCount + "/" + VARIANTS.length + " variants");
console.log("external tracking query:  NONE (captcha-only, no code submitted)");
console.log("DB write:                 NONE");
console.log("");

if (anyPass) {
  console.log("CONCLUSION: PARTIAL — OCR pipeline CAN produce 4-digit output from real 7-11 captcha.");
  console.log("Next step: run full test (test-seven-eleven-adapter.mjs) with a safe tracking code");
  console.log("  to verify end-to-end captcha solve + tracking query success rate.");
} else {
  console.log("CONCLUSION: BLOCKED — OCR cannot reliably produce 4-digit code from real 7-11 captcha.");
  console.log("Next step: investigate captcha-free alternative API or improve preprocessing.");
}

rmSync(tmpDir, { recursive: true, force: true });
