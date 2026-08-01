import assert from "node:assert/strict";
import { mock, test } from "node:test";

const originalBuildTime = process.env.BUILD_TIME;
process.env.BUILD_TIME = "2026-08-01T00:00:00.000Z";
let databaseAvailable = true;

mock.module("@workspace/db", {
  namedExports: {
    pool: {
      query: async () => {
        if (!databaseAvailable) throw new Error("database is down");
        return { rows: [{ ok: 1 }] };
      },
    },
  },
});

const { default: healthRouter } = await import("./health.ts");
const { default: express } = await import("express");
const app = express();
app.use(healthRouter);
let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (originalBuildTime === undefined) delete process.env.BUILD_TIME;
  else process.env.BUILD_TIME = originalBuildTime;
});

test("healthz reports database, schema version, migration, and build time", async () => {
  databaseAvailable = true;
  const response = await fetch(`${baseUrl}/healthz`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ok");
  assert.match(body.latestMigration, /^\d+_[^/]+\.sql$/);
  assert.match(body.schemaVersion, /^\d+$/);
  assert.equal(body.buildTime, "2026-08-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(body), /DATABASE_URL|password|secret/i);
});

test("healthz returns 503 when the database check fails", async () => {
  databaseAvailable = false;
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).database, "unavailable");
});

test("healthz recovers after the database becomes available", async () => {
  databaseAvailable = true;
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
});
