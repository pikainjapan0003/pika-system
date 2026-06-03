/**
 * Thin wrapper — delegates to lib/db/import-seven-stores-from-twcoupon-emap.mjs
 * where the `pg` package is installed.
 *
 * Usage from workspace root:
 *   node scripts/import-seven-stores-from-twcoupon-emap.mjs \
 *     --url "https://twcoupon.com/brandshop-7_11-..." \
 *     --limit 20 --delay 1000 --verify-emap
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(dir, "../lib/db/import-seven-stores-from-twcoupon-emap.mjs");

const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(dir, "../lib/db"),
  env: { ...process.env },
});
child.on("close", (code) => process.exit(code ?? 0));
