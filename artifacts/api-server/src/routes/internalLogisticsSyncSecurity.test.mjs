/**
 * BATCH-20 package 16: internal logistics endpoint secret safety.
 * The invalid-secret paths return before any database work, so this test uses
 * synthetic headers and does not require a DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const CRON_SECRET = "batch20-internal-secret-not-for-logs";
const WRONG_SECRET = "batch20-wrong-secret";
const ENDPOINTS = [
  "/internal/logistics/sync/scheduled",
  "/internal/logistics/manual-snapshot-refresh",
];

const { default: express } = await import("express");
const { default: internalLogisticsSyncRouter } =
  await import("./internalLogisticsSync.ts");

const app = express();
app.use(express.json());
app.use("/api", internalLogisticsSyncRouter);

let server;
let baseUrl;
let previousSecret;
let previousConsoleError;
const consoleErrors = [];

before(async () => {
  previousSecret = process.env.CRON_SYNC_SECRET;
  previousConsoleError = console.error;
  console.error = (...args) => consoleErrors.push(args.map(String).join(" "));
  process.env.CRON_SYNC_SECRET = CRON_SECRET;
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  if (previousSecret === undefined) delete process.env.CRON_SYNC_SECRET;
  else process.env.CRON_SYNC_SECRET = previousSecret;
  console.error = previousConsoleError;
  await new Promise((resolve) => server.close(resolve));
});

async function post(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
  });
  const text = await response.text();
  return { status: response.status, text };
}

test("wrong cron secrets are rejected without echoing secret material", async () => {
  for (const endpoint of ENDPOINTS) {
    const response = await post(endpoint, {
      "x-internal-sync-secret": WRONG_SECRET,
    });
    assert.equal(response.status, 401, endpoint);
    assert.equal(response.text.includes(CRON_SECRET), false, endpoint);
    assert.equal(response.text.includes(WRONG_SECRET), false, endpoint);
    assert.equal(response.text.includes("x-internal-sync-secret"), false);
  }
});

test("disabled cron endpoints fail closed without logging or returning a secret", async () => {
  delete process.env.CRON_SYNC_SECRET;
  consoleErrors.length = 0;
  for (const endpoint of ENDPOINTS) {
    const response = await post(endpoint);
    assert.equal(response.status, 404, endpoint);
    assert.equal(response.text.includes(CRON_SECRET), false, endpoint);
    assert.equal(response.text.includes(WRONG_SECRET), false, endpoint);
  }
  assert.deepEqual(consoleErrors, []);
});
