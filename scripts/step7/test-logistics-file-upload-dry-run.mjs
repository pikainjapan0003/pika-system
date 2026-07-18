#!/usr/bin/env node
/**
 * Step 7B — thin runner for the logistics upload dry-run endpoint tests.
 * The actual suite lives with the other route tests so workspace deps resolve:
 *   artifacts/api-server/src/routes/logisticsImports.route.test.mjs
 *
 * Usage: node scripts/step7/test-logistics-file-upload-dry-run.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const result = spawnSync(
  "node",
  [
    "--experimental-test-module-mocks",
    "--import",
    path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"),
    "--test",
    "src/routes/logisticsImports.route.test.mjs",
  ],
  { cwd: path.join(ROOT, "artifacts/api-server"), stdio: "inherit" },
);
process.exit(result.status ?? 1);
