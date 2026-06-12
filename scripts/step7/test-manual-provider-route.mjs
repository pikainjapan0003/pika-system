#!/usr/bin/env node
/**
 * Step 7N-I — thin runner for the manual-provider route tests.
 * Suite: artifacts/api-server/src/routes/logisticsSyncManualProvider.route.test.mjs
 *
 * Usage: node scripts/step7/test-manual-provider-route.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const result = spawnSync(
  "node",
  [
    "--experimental-test-module-mocks",
    "--import", path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"),
    "--test", "src/routes/logisticsSyncManualProvider.route.test.mjs",
  ],
  { cwd: path.join(ROOT, "artifacts/api-server"), stdio: "inherit" }
);
process.exit(result.status ?? 1);
