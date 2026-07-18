/**
 * Step 7D 7-11 adapter POC 測試（臨時 spike script，不接正式系統）
 *
 * 做法：
 * 1. 用 esbuild 即時把 sevenElevenAdapter.ts 打包成 ESM 後動態 import。
 * 2. 注入 solveCaptcha：用 ImageMagick(magick) 前處理 + tesseract 辨識
 *    （融合 ThanatosDi 前處理概念 + NCNU --psm 8 數字白名單）。
 * 3. 用 C44951447678 跑 maxAttempts=6，回報每次 attempt。
 *
 * 不寫 DB、不接 worker、不輸出個資。
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// esbuild 安裝在 api-server 的 node_modules，用絕對路徑載入
const esbuildPath = path.resolve(
  __dirname,
  "../../artifacts/api-server/node_modules/esbuild/lib/main.js",
);
const { build } = await import(pathToFileURL(esbuildPath).href);
const ADAPTER = path.resolve(
  __dirname,
  "../../artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts",
);

// tesseract 不在預設 PATH，用解析到的 nix store 路徑（測試環境特有）
const TESSERACT =
  process.env.TESSERACT_BIN ||
  "/nix/store/89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00/bin/tesseract";

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "s7-711-"));

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
  return import(outfile);
}

// ImageMagick 前處理多組變體 + tesseract，回第一個 4 位數
function solveCaptcha(imageBytes) {
  const src = path.join(tmpDir, "cap.jpg");
  // 同步寫檔（spawnSync 路線）
  const buf = Buffer.from(imageBytes);
  require_writeSync(src, buf);
  const variants = [
    ["-colorspace", "Gray", "-resize", "400%", "-threshold", "45%"],
    ["-colorspace", "Gray", "-resize", "400%", "-threshold", "55%"],
    ["-colorspace", "Gray", "-resize", "400%", "-threshold", "65%"],
    [
      "-colorspace",
      "Gray",
      "-resize",
      "400%",
      "-normalize",
      "-threshold",
      "50%",
    ],
    ["-colorspace", "Gray", "-resize", "400%"],
  ];
  for (let i = 0; i < variants.length; i++) {
    const out = path.join(tmpDir, `pre${i}.png`);
    const c = spawnSync("magick", [src, ...variants[i], out]);
    if (c.status !== 0) continue;
    const t = spawnSync(TESSERACT, [
      out,
      "stdout",
      "--psm",
      "8",
      "-c",
      "tessedit_char_whitelist=0123456789",
    ]);
    const text = (t.stdout?.toString() || "").replace(/\D/g, "");
    if (text.length === 4) return Promise.resolve(text);
  }
  return Promise.resolve("");
}

// 小工具：同步寫檔（避免 top-level await 與 spawnSync 混用問題）
import fsSync from "node:fs";
function require_writeSync(p, buf) {
  fsSync.writeFileSync(p, buf);
}

const ORDER = process.argv[2] || "C44951447678";
const MAX = Number(process.argv[3] || 6);

const { trackSevenElevenShipment } = await loadAdapter();

console.log(`[test] tracking=${ORDER} maxAttempts=${MAX}`);

// 為了觀察每次 attempt，逐次以 maxAttempts=1 呼叫，記錄結果
const log = [];
let finalSuccess = null;
const t0 = Date.now();
for (let i = 1; i <= MAX; i++) {
  const r = await trackSevenElevenShipment(
    { trackingCode: ORDER, maxAttempts: 1 },
    { solveCaptcha },
  );
  if (r.ok) {
    log.push(
      `#${i} -> SUCCESS latest="${r.latestStatus}" events=${r.events.length}`,
    );
    finalSuccess = r;
    break;
  } else {
    log.push(`#${i} -> FAIL ${r.errorCode} (${r.message})`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log("\n==== ATTEMPTS ====");
log.forEach((l) => console.log(l));
console.log(`\nelapsed=${elapsed}s`);

if (finalSuccess) {
  console.log("\n==== SUCCESS (verified) ====");
  console.log("trackingCode:", finalSuccess.trackingCode);
  console.log("query_no match:", finalSuccess.rawSummary?.query_no === ORDER);
  console.log("latestStatus:", finalSuccess.latestStatus);
  console.log("pickupStoreName:", finalSuccess.pickupStoreName);
  console.log("pickupDeadline:", finalSuccess.pickupDeadline);
  console.log("paymentInfo:", finalSuccess.paymentInfo);
  console.log("events:");
  for (const e of finalSuccess.events) {
    console.log(`  - ${e.occurredAt ?? "?"} | ${e.statusText}`);
  }
  console.log("RESULT: PASS");
} else {
  console.log(
    "\nRESULT: PARTIAL (adapter ok, all OCR attempts failed this run)",
  );
}

await fs.rm(tmpDir, { recursive: true, force: true });
