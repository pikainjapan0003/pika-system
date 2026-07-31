/**
 * Owner-only Maihuobian preview/export integration tests. Every row is fake
 * and this file skips unless CI or a disposable local PostgreSQL supplies
 * DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "Maihuobian route integration requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const OWNER_ID = "batch17_fake_maihuobian_owner";
  const OTHER_OWNER_ID = "batch17_fake_maihuobian_other";
  const runId = `${Date.now()}-${process.pid}`;

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
  const { auditLogsTable, db, ordersTable, pool, productsTable, storesTable } =
    await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use("/api", ordersRouter);

  let server;
  let baseUrl;
  let storeId;
  let otherStoreId;
  let normalProductId;
  let frozenProductId;
  let eligibleOrderId;
  let pendingOrderId;
  let mixedOrderId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [store, otherStore] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: OWNER_ID,
          name: "BATCH-17 假店鋪",
          slug: `batch17-maihuobian-${runId}`,
        },
        {
          merchantId: OTHER_OWNER_ID,
          name: "BATCH-17 其他假店鋪",
          slug: `batch17-maihuobian-other-${runId}`,
        },
      ])
      .returning();
    storeId = store.id;
    otherStoreId = otherStore.id;

    const [normalProduct, frozenProduct] = await db
      .insert(productsTable)
      .values([
        {
          storeId,
          name: "BATCH-17 常溫假商品",
          price: "100.00",
          shareToken: `batch17-normal-${runId}`,
          storageTempClass: "normal",
        },
        {
          storeId,
          name: "BATCH-17 冷凍假商品",
          price: "200.00",
          shareToken: `batch17-frozen-${runId}`,
          storageTempClass: "frozen",
        },
      ])
      .returning();
    normalProductId = normalProduct.id;
    frozenProductId = frozenProduct.id;

    const createdAt = new Date("2026-07-19T04:00:00.000Z");
    const [eligible, pending, mixed] = await db
      .insert(ordersTable)
      .values([
        fakeOrder({
          productId: normalProductId,
          publicToken: `batch17-eligible-${runId}`,
          createdAt,
        }),
        fakeOrder({
          productId: normalProductId,
          publicToken: `batch17-pending-${runId}`,
          createdAt,
          status: "pending",
        }),
        fakeOrder({
          productId: normalProductId,
          publicToken: `batch17-mixed-${runId}`,
          createdAt,
          items: [
            {
              productId: normalProductId,
              productName: "BATCH-17 常溫假商品",
              quantity: 1,
              specValues: {},
            },
            {
              productId: frozenProductId,
              productName: "BATCH-17 冷凍假商品",
              quantity: 1,
              specValues: {},
            },
          ],
        }),
      ])
      .returning();
    eligibleOrderId = eligible.id;
    pendingOrderId = pending.id;
    mixedOrderId = mixed.id;
  });

  after(async () => {
    if (storeId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    }
    if (otherStoreId) {
      await db.delete(storesTable).where(eq(storesTable.id, otherStoreId));
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(
    method,
    path,
    { body, userId = OWNER_ID, headers = {} } = {},
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
    return { status: response.status, data: await response.json() };
  }

  test("Maihuobian preview requires authentication", async () => {
    const response = await request(
      "GET",
      `/stores/${storeId}/orders/maihuobian-export`,
      { userId: null },
    );
    assert.equal(response.status, 401);
  });

  test("Maihuobian preview rejects cross-store access", async () => {
    const response = await request(
      "GET",
      `/stores/${otherStoreId}/orders/maihuobian-export`,
    );
    assert.equal(response.status, 403);
  });

  test("Maihuobian preview separates eligible, wrong-status, and mixed-temperature orders", async () => {
    const response = await request(
      "GET",
      `/stores/${storeId}/orders/maihuobian-export?from=2026-07-19&to=2026-07-19`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.eligibleCount, 1);
    assert.equal(response.data.ineligibleCount, 2);
    assert.equal(response.data.eligible[0].orderId, eligibleOrderId);
    assert.equal(typeof response.data.eligible[0].productSummary, "string");

    const serializedPreview = JSON.stringify(response.data);
    assert.equal(serializedPreview.includes("recipientName"), false);
    assert.equal(serializedPreview.includes("recipientPhone"), false);
    assert.equal(serializedPreview.includes("cvsStoreId"), false);
    assert.doesNotMatch(serializedPreview, /09\d{8}/u);

    const pending = response.data.ineligible.find(
      (entry) => entry.orderId === pendingOrderId,
    );
    assert.ok(
      pending.reasons.some(
        (reason) => reason.code === "ORDER_STATUS_INELIGIBLE",
      ),
    );
    const mixed = response.data.ineligible.find(
      (entry) => entry.orderId === mixedOrderId,
    );
    assert.ok(
      mixed.reasons.some(
        (reason) => reason.code === "STORAGE_TEMPERATURE_INVALID",
      ),
    );
  });

  test("Maihuobian preview rejects an incomplete date range", async () => {
    const response = await request(
      "GET",
      `/stores/${storeId}/orders/maihuobian-export?from=2026-07-19`,
    );
    assert.equal(response.status, 422);
  });

  test("Maihuobian cleartext export requires both confirmation headers", async () => {
    const missingBoth = await request(
      "POST",
      `/stores/${storeId}/orders/maihuobian-export`,
      {
        body: {
          from: "2026-07-19",
          to: "2026-07-19",
          orderIds: [eligibleOrderId],
        },
      },
    );
    assert.equal(missingBoth.status, 400);
    assert.equal(missingBoth.data.code, "CLEAR_TEXT_CONFIRMATION_REQUIRED");

    const missingPurpose = await request(
      "POST",
      `/stores/${storeId}/orders/maihuobian-export`,
      {
        body: {
          from: "2026-07-19",
          to: "2026-07-19",
          orderIds: [eligibleOrderId],
        },
        headers: { "x-confirm-cleartext-export": "true" },
      },
    );
    assert.equal(missingPurpose.status, 400);
  });

  test("Maihuobian write rejects unauthenticated, cross-store, and oversized selections", async () => {
    const body = {
      from: "2026-07-19",
      to: "2026-07-19",
      orderIds: [eligibleOrderId],
    };
    const confirmationHeaders = {
      "x-confirm-cleartext-export": "true",
      "x-confirm-maihuobian-export": "true",
    };
    const unauthenticated = await request(
      "POST",
      `/stores/${storeId}/orders/maihuobian-export`,
      { body, userId: null, headers: confirmationHeaders },
    );
    assert.equal(unauthenticated.status, 401);

    const crossStore = await request(
      "POST",
      `/stores/${otherStoreId}/orders/maihuobian-export`,
      { body, headers: confirmationHeaders },
    );
    assert.equal(crossStore.status, 403);

    const oversized = await request(
      "POST",
      `/stores/${storeId}/orders/maihuobian-export`,
      {
        body: {
          ...body,
          orderIds: Array.from({ length: 501 }, (_, index) => index + 1),
        },
        headers: confirmationHeaders,
      },
    );
    assert.equal(oversized.status, 422);
    assert.equal(oversized.data.code, "ORDER_SELECTION_TOO_LARGE");
  });

  test("Maihuobian cleartext export returns only eligible rows and writes an anonymous audit", async () => {
    const response = await request(
      "POST",
      `/stores/${storeId}/orders/maihuobian-export`,
      {
        body: {
          from: "2026-07-19",
          to: "2026-07-19",
          orderIds: [eligibleOrderId],
        },
        headers: {
          "x-confirm-cleartext-export": "true",
          "x-confirm-maihuobian-export": "true",
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.eligibleCount, 1);
    assert.equal(response.data.eligible[0].orderId, eligibleOrderId);
    assert.equal(response.data.eligible[0].row.recipientName, "王小明");
    assert.equal(response.data.eligible[0].row.recipientPhone, "0912345678");

    const [audit] = await db
      .select()
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.storeId, storeId),
          eq(auditLogsTable.action, "export_maihuobian_cleartext"),
        ),
      )
      .limit(1);
    assert.equal(audit.actor, OWNER_ID);
    assert.equal(audit.target, "maihuobian-export:orders-1");
    assert.equal(audit.target.includes("0912345678"), false);
    assert.equal(audit.target.includes("假客人"), false);
  });

  function fakeOrder({
    productId,
    publicToken,
    createdAt,
    status = "preparing",
    items = null,
  }) {
    return {
      storeId,
      productId,
      productName: "BATCH-17 常溫假商品",
      publicToken,
      buyerName: "王小明",
      buyerPhone: "0912345678",
      recipientName: "王小明",
      recipientPhone: "0912345678",
      pickupMethod: "7-11 取貨",
      cvsStoreId: "123456",
      quantity: 3,
      unitPrice: "100.00",
      shippingFee: "60.00",
      totalPrice: "300.00",
      status,
      shippingStatus: "not_shipped",
      createdAt,
      notes: "BATCH-17 假備註",
      items,
    };
  }
}
