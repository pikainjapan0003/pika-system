#!/usr/bin/env node
/**
 * Step 7N-I8B — thin runner for the manual tracking seed tests.
 * Suite: artifacts/api-server/src/routes/orders.manualTrackingSeed.test.mjs
 *
 * Usage: node scripts/step7/test-manual-provider-tracking-seed.mjs
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
    "--test", "src/routes/orders.manualTrackingSeed.test.mjs",
  ],
  { cwd: path.join(ROOT, "artifacts/api-server"), stdio: "inherit" }
);
process.exit(result.status ?? 1);
