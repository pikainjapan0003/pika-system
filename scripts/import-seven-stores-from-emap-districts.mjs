/**
 * Thin wrapper — delegates to lib/db/import-seven-stores-from-emap-districts.mjs
 * where the `pg` package is installed.
 *
 * Usage from workspace root:
 *   node scripts/import-seven-stores-from-emap-districts.mjs --city 新北市 --district 板橋區 --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --limit 5 --delay 1200
 *   node scripts/import-seven-stores-from-emap-districts.mjs --all-districts --list
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(
  dir,
  "../lib/db/import-seven-stores-from-emap-districts.mjs",
);

const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(dir, "../lib/db"),
});
child.on("close", (code) => process.exit(code ?? 0));
