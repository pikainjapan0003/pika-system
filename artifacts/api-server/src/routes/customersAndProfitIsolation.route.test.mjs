/**
 * BATCH-10 CI-only route coverage for customer ownership, export gates, and
 * profit-summary store isolation. All rows are synthetic and the test skips
 * unless CI supplies its disposable DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "customer and profit route integration requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_A = "batch10_fake_merchant_a";
  const MERCHANT_B = "batch10_fake_merchant_b";

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
  const { eq } = await import("drizzle-orm");
  const { default: customersRouter } = await import("./customers.ts");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use("/api", customersRouter);
  app.use("/api", ordersRouter);

  let server;
  let baseUrl;
  let storeAId;
  let storeBId;
  let productAId;
  let productBId;

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
          name: "BATCH-10 假店鋪 A",
          slug: `batch10-customer-a-${Date.now()}`,
        },
        {
          merchantId: MERCHANT_B,
          name: "BATCH-10 假店鋪 B",
          slug: `batch10-customer-b-${Date.now()}`,
        },
      ])
      .returning();
    storeAId = storeA.id;
    storeBId = storeB.id;

    const [productA, productB] = await db
      .insert(productsTable)
      .values([
        {
          storeId: storeAId,
          name: "BATCH-10 假商品 A",
          price: "100.00",
          shareToken: `batch10-profit-a-${Date.now()}`,
        },
        {
          storeId: storeBId,
          name: "BATCH-10 假商品 B",
          price: "100.00",
          shareToken: `batch10-profit-b-${Date.now()}`,
        },
      ])
      .returning();
    productAId = productA.id;
    productBId = productB.id;

    await db.insert(ordersTable).values([
      capturedOrder({
        storeId: storeAId,
        productId: productAId,
        publicToken: `batch10-order-a-${Date.now()}`,
        unitProfit: "10.000000000000",
        quantity: 2,
      }),
      capturedOrder({
        storeId: storeBId,
        productId: productBId,
        publicToken: `batch10-order-b-${Date.now()}`,
        unitProfit: "999.000000000000",
        quantity: 1,
      }),
    ]);
  });

  after(async () => {
    if (storeAId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeAId));
    }
    if (storeBId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeBId));
    }
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

  test("customer CRUD stays in its owner store and rejects cross-store access", async () => {
    const created = await request("POST", `/stores/${storeAId}/customers`, {
      body: {
        code: "B10-A",
        name: "假客戶甲",
        phone: "0900000000",
        tier: "vip",
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.storeId, storeAId);

    const listed = await request("GET", `/stores/${storeAId}/customers`);
    assert.equal(listed.status, 200);
    assert.equal(
      listed.data.some((customer) => customer.id === created.data.id),
      true,
    );

    const patched = await request(
      "PATCH",
      `/stores/${storeAId}/customers/${created.data.id}`,
      {
        body: {
          code: "B10-A",
          name: "假客戶甲更新",
          phone: null,
          tier: "general",
        },
      },
    );
    assert.equal(patched.status, 200);
    assert.equal(patched.data.name, "假客戶甲更新");

    const wrongMerchant = await request("GET", `/stores/${storeBId}/customers`);
    assert.equal(wrongMerchant.status, 403);

    const crossStoreCustomer = await request(
      "GET",
      `/stores/${storeBId}/customers/${created.data.id}`,
      { userId: MERCHANT_B },
    );
    assert.equal(crossStoreCustomer.status, 404);
  });

  test("customer routes reject unauthenticated requests", async () => {
    const response = await request("GET", `/stores/${storeAId}/customers`, {
      userId: null,
    });

    assert.equal(response.status, 401);
  });

  test("customer cleartext export needs its header and CSV formulas stay neutralized", async () => {
    const formulaCustomer = await request(
      "POST",
      `/stores/${storeAId}/customers`,
      {
        body: { code: "=BATCH10", name: "假客戶乙", tier: "general" },
      },
    );
    assert.equal(formulaCustomer.status, 201);

    const denied = await request(
      "GET",
      `/stores/${storeAId}/customers/export?mode=cleartext`,
    );
    assert.equal(denied.status, 400);

    const masked = await request("GET", `/stores/${storeAId}/customers/export`);
    assert.equal(masked.status, 200);
    assert.equal(masked.data.includes("'=BATCH10"), true);
    assert.equal(masked.data.includes("假客戶乙"), false);

    const cleartext = await request(
      "GET",
      `/stores/${storeAId}/customers/export?mode=cleartext`,
      { headers: { "x-confirm-cleartext-export": "true" } },
    );
    assert.equal(cleartext.status, 200);
    assert.equal(cleartext.data.includes("假客戶乙"), true);
  });

  test("the literal customers/export route is not captured by :customerId", async () => {
    const exported = await request(
      "GET",
      `/stores/${storeAId}/customers/export`,
    );

    assert.equal(exported.status, 200);
    assert.equal(typeof exported.data, "string");
    assert.equal(
      exported.data.includes("customerId must be a positive integer"),
      false,
    );
  });

  test("profit summary includes only the authenticated store", async () => {
    const summary = await request(
      "GET",
      `/stores/${storeAId}/orders/profit-summary`,
    );
    assert.equal(summary.status, 200);
    assert.equal(summary.data.capturedProfitSubtotalTwd, "20.000000000000");
    assert.equal(summary.data.capturedProfitSubtotalDisplayTwd, "20");

    const crossStore = await request(
      "GET",
      `/stores/${storeBId}/orders/profit-summary`,
    );
    assert.equal(crossStore.status, 403);
  });

  function capturedOrder({
    storeId,
    productId,
    publicToken,
    unitProfit,
    quantity,
  }) {
    return {
      storeId,
      productId,
      productName: "BATCH-10 假商品",
      publicToken,
      buyerName: "BATCH-10 假買家",
      buyerPhone: "0900000000",
      pickupMethod: "假資料面交",
      quantity,
      unitPrice: "100.00",
      totalPrice: "100.00",
      profitSnapshotCostJpy: "0.000000000000",
      profitSnapshotExchangeRate: "0.000000000000",
      profitSnapshotProductCostTwd: "0.000000000000",
      profitSnapshotTransportCostTwd: "0.000000000000",
      profitSnapshotUnitProfitTwd: unitProfit,
      profitSnapshotFullUnitProfitTwd: unitProfit,
      profitSnapshotStatus: "captured",
      profitSnapshotCapturedAt: new Date(),
    };
  }
}
