/**
 * Server-side manual commit kill-switch integration test.
 * Uses only synthetic data and skips unless a disposable DATABASE_URL is supplied.
 * Never point this test at production or an existing database.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "manual commit kill-switch route requires a disposable DATABASE_URL",
    {
      skip: "DATABASE_URL not set",
    },
    () => {},
  );
} else {
  const TEST_MERCHANT_ID = "manual_commit_kill_switch_fake_merchant";
  const previousEnabled = process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;
  delete process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;

  mock.module("@clerk/express", {
    namedExports: {
      getAuth: (req) => {
        const userId = req.headers?.["x-test-user-id"] ?? null;
        return { userId, sessionClaims: userId ? { userId } : undefined };
      },
      clerkMiddleware: () => (_req, _res, next) => next(),
    },
  });

  const { default: express } = await import("express");
  const { db, pool, storesTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: logisticsSyncRouter } = await import("./logisticsSync.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", logisticsSyncRouter);

  let server;
  let baseUrl;
  let storeId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;
    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: TEST_MERCHANT_ID,
        name: "Manual commit kill-switch fake store",
        slug: `manual-commit-kill-switch-${Date.now()}`,
      })
      .returning();
    storeId = store.id;
  });

  after(async () => {
    if (storeId)
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    if (previousEnabled === undefined) {
      delete process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;
    } else {
      process.env.LOGISTICS_MANUAL_COMMIT_ENABLED = previousEnabled;
    }
  });

  const callCommit = async (authenticated = true) => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/logistics/sync/manual-provider/commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authenticated ? { "x-test-user-id": TEST_MERCHANT_ID } : {}),
        },
        body: JSON.stringify({ provider: "invalid" }),
      },
    );
    return { status: response.status, body: await response.json() };
  };

  test("manual commit is default-off, false stays off, and true opens the existing route", async () => {
    const unauthenticated = await callCommit(false);
    assert.equal(unauthenticated.status, 401);

    delete process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;
    const defaultOff = await callCommit();
    assert.equal(defaultOff.status, 403);
    assert.equal(defaultOff.body.errorCode, "COMMIT_DISABLED");

    process.env.LOGISTICS_MANUAL_COMMIT_ENABLED = "false";
    const explicitOff = await callCommit();
    assert.equal(explicitOff.status, 403);
    assert.equal(explicitOff.body.errorCode, "COMMIT_DISABLED");

    process.env.LOGISTICS_MANUAL_COMMIT_ENABLED = "true";
    const enabled = await callCommit();
    assert.equal(enabled.status, 400);
    assert.equal(enabled.body.errorCode, "INVALID_PROVIDER");
  });
}
