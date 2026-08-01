/**
 * BATCH-20 package 14: second-tier authorization gap coverage.
 *
 * This file uses only synthetic stores, products, and orders in a disposable
 * DATABASE_URL.  The trips routes are intentionally excluded until their
 * store-ownership decision is made.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "BATCH-20 authorization gap routes require a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_A = "batch20_authz_merchant_a";
  const MERCHANT_B = "batch20_authz_merchant_b";

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
  const { db, ordersTable, pool, productsTable, storesTable } =
    await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { default: auditLogsRouter } = await import("./auditLogs.ts");
  const { default: exchangeRateReferenceRouter } =
    await import("./exchangeRateReference.ts");
  const { default: internalLogisticsSyncRouter } =
    await import("./internalLogisticsSync.ts");
  const { default: logisticsExceptionsRouter } =
    await import("./logisticsExceptions.ts");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use("/api", auditLogsRouter);
  app.use("/api", exchangeRateReferenceRouter);
  app.use("/api", internalLogisticsSyncRouter);
  app.use("/api", logisticsExceptionsRouter);
  app.use("/api", ordersRouter);

  let server;
  let baseUrl;
  let storeAId;
  let storeBId;
  let productAId;
  let orderAId;
  let previousCronSecret;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [storeA, storeB] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: MERCHANT_A,
          name: "BATCH-20 synthetic store A",
          slug: `batch20-authz-a-${Date.now()}`,
        },
        {
          merchantId: MERCHANT_B,
          name: "BATCH-20 synthetic store B",
          slug: `batch20-authz-b-${Date.now()}`,
        },
      ])
      .returning();
    storeAId = storeA.id;
    storeBId = storeB.id;

    const [productA] = await db
      .insert(productsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-20 synthetic product",
        price: "100.00",
        shareToken: `batch20-authz-product-${Date.now()}`,
        isActive: true,
      })
      .returning();
    productAId = productA.id;

    const [orderA] = await db
      .insert(ordersTable)
      .values({
        storeId: storeAId,
        productId: productAId,
        productName: productA.name,
        publicToken: `batch20-authz-order-${Date.now()}`,
        buyerName: "BATCH-20 Buyer",
        buyerPhone: "0900000000",
        pickupMethod: "self_pickup",
        quantity: 1,
        unitPrice: "100.00",
        totalPrice: "100.00",
        shippingStatus: "not_shipped",
      })
      .returning();
    orderAId = orderA.id;
  });

  after(async () => {
    if (orderAId) {
      await db.delete(ordersTable).where(eq(ordersTable.id, orderAId));
    }
    if (productAId) {
      await db.delete(productsTable).where(eq(productsTable.id, productAId));
    }
    if (storeAId || storeBId) {
      await db
        .delete(storesTable)
        .where(inArray(storesTable.id, [storeAId, storeBId].filter(Boolean)));
    }
    if (previousCronSecret === undefined) delete process.env.CRON_SYNC_SECRET;
    else process.env.CRON_SYNC_SECRET = previousCronSecret;
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(
    method,
    path,
    { body, userId = MERCHANT_A, headers = {} } = {},
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const contentType = response.headers.get("content-type") ?? "";
    return {
      status: response.status,
      data: contentType.includes("json")
        ? await response.json()
        : await response.text(),
    };
  }

  test("logistics exception routes require auth and store ownership", async () => {
    const paths = [
      ["GET", `/stores/${storeAId}/logistics/exceptions`, undefined],
      [
        "PATCH",
        `/stores/${storeAId}/logistics/exceptions/999999999`,
        { status: "resolved" },
      ],
      [
        "POST",
        `/stores/${storeAId}/logistics/exceptions/999999999/retry`,
        undefined,
      ],
    ];
    for (const [method, path, body] of paths) {
      const unauthenticated = await request(method, path, {
        body,
        userId: null,
      });
      const crossStore = await request(method, path, {
        body,
        userId: MERCHANT_B,
      });
      assert.equal(unauthenticated.status, 401, `${method} ${path}`);
      assert.equal(crossStore.status, 403, `${method} ${path}`);
    }
  });

  test("shipping list and tracking import require auth and reject cross-store orders", async () => {
    const shippingBody = { orderIds: [orderAId] };
    for (const path of ["/orders/shipping-list", "/orders/shipping-list.csv"]) {
      const unauthenticated = await request("POST", path, {
        body: shippingBody,
        userId: null,
      });
      const crossStore = await request("POST", path, {
        body: shippingBody,
        userId: MERCHANT_B,
      });
      assert.equal(unauthenticated.status, 401, path);
      assert.equal(crossStore.status, 403, path);
    }

    const trackingBody = {
      rows: [
        {
          orderId: String(orderAId),
          trackingProvider: "familymart",
          trackingCode: "BATCH20TRACK",
        },
      ],
    };
    const unauthenticated = await request("POST", "/orders/tracking-import", {
      body: trackingBody,
      userId: null,
    });
    const crossStore = await request("POST", "/orders/tracking-import", {
      body: trackingBody,
      userId: MERCHANT_B,
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(crossStore.status, 403);
  });

  test("monthly profit and audit logs require auth and isolate stores", async () => {
    for (const path of [
      `/stores/${storeAId}/orders/monthly-profit?month=2026-07`,
      `/stores/${storeAId}/audit-logs`,
    ]) {
      const unauthenticated = await request("GET", path, { userId: null });
      const crossStore = await request("GET", path, { userId: MERCHANT_B });
      assert.equal(unauthenticated.status, 401, path);
      assert.equal(crossStore.status, 403, path);
    }

    const eventBody = {
      action: "reveal_customer_pii",
      target: "customer:batch20-a",
    };
    const unauthenticatedEvent = await request(
      "POST",
      `/stores/${storeAId}/audit-events`,
      { body: eventBody, userId: null },
    );
    const crossStoreEvent = await request(
      "POST",
      `/stores/${storeAId}/audit-events`,
      { body: eventBody, userId: MERCHANT_B },
    );
    assert.equal(unauthenticatedEvent.status, 401);
    assert.equal(crossStoreEvent.status, 403);
  });

  test("exchange-rate reference endpoints require authentication", async () => {
    for (const path of [
      "/exchange-rate-reference/jpy",
      "/exchange-rate-reference/jpy/compare",
    ]) {
      const response = await request("GET", path, { userId: null });
      assert.equal(response.status, 401, path);
    }
  });

  test("internal logistics cron endpoints fail closed without a valid secret", async () => {
    previousCronSecret = process.env.CRON_SYNC_SECRET;
    delete process.env.CRON_SYNC_SECRET;
    for (const path of [
      "/internal/logistics/sync/scheduled",
      "/internal/logistics/manual-snapshot-refresh",
    ]) {
      const disabled = await request("POST", path);
      assert.equal(disabled.status, 404, `${path} disabled`);
    }

    process.env.CRON_SYNC_SECRET = "batch20-test-cron-secret";
    for (const path of [
      "/internal/logistics/sync/scheduled",
      "/internal/logistics/manual-snapshot-refresh",
    ]) {
      const invalid = await request("POST", path, {
        headers: { "x-internal-sync-secret": "wrong-secret" },
      });
      assert.equal(invalid.status, 401, `${path} invalid secret`);
    }
  });
}
