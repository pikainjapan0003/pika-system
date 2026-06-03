/**
 * Thin wrapper — delegates to lib/db/import-seven-stores-from-emap.mjs
 * where the `pg` package is installed.
 *
 * Usage from workspace root:
 *   node scripts/import-seven-stores-from-emap.mjs --file data/cvs/seven-import-keywords.txt
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(dir, "../lib/db/import-seven-stores-from-emap.mjs");

// Pass all args except --file: resolve relative file paths against cwd first
const rawArgs = process.argv.slice(2);
const fileIdx = rawArgs.indexOf("--file");
if (fileIdx !== -1 && rawArgs[fileIdx + 1]) {
  rawArgs[fileIdx + 1] = path.resolve(process.cwd(), rawArgs[fileIdx + 1]);
}

const child = spawn(process.execPath, [script, ...rawArgs], {
  stdio: "inherit",
  cwd: path.resolve(dir, "../lib/db"),
});
child.on("close", (code) => process.exit(code ?? 0));
