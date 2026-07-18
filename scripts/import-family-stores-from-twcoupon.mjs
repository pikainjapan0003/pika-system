/**
 * 全家 twcoupon dry-run 匯入工具 — thin wrapper
 *
 * 此工具只用於門市資料研究 / dry-run，不建立物流單，不串 ECPay。
 *
 * 使用方式（從 workspace root）：
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 台北市 --district 大安區 --delay 1000
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 新北市 --district 板橋區 --delay 1000
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 高雄市 --district 鳳山區 --delay 1000
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --city 連江縣 --district 南竿鄉 --delay 1000
 *   node scripts/import-family-stores-from-twcoupon.mjs --list-cities
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --only-city 連江縣
 *   node scripts/import-family-stores-from-twcoupon.mjs --dry-run --limit-cities 3 --delay 1000
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(
  dir,
  "../lib/db/import-family-stores-from-twcoupon.mjs",
);

const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(dir, "../lib/db"),
  env: { ...process.env },
});
child.on("close", (code) => process.exit(code ?? 0));
