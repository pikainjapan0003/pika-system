/**
 * Full owner store-credit lifecycle against CI's disposable PostgreSQL only.
 * All identities, products, and customer records are synthetic.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "store-credit lifecycle requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_ID = "batch18_lifecycle_fake_owner";

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
  const {
    customersTable,
    db,
    ordersTable,
    pool,
    productsTable,
    storeCreditTransactionsTable,
    storesTable,
  } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: customersRouter } = await import("./customers.ts");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", customersRouter);
  app.use("/api", ordersRouter);

  let server;
  let baseUrl;
  let storeId;
  let customerId;
  let productId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const suffix = Date.now();
    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: MERCHANT_ID,
        name: "Batch 18 Lifecycle Store",
        slug: `batch18-credit-lifecycle-${suffix}`,
        purchaseExchangeRate: "0.2",
      })
      .returning();
    storeId = store.id;
    const [customer] = await db
      .insert(customersTable)
      .values({
        storeId,
        code: `B18-LIFECYCLE-${suffix}`,
        name: "Synthetic Lifecycle Customer",
      })
      .returning();
    customerId = customer.id;
    const [product] = await db
      .insert(productsTable)
      .values({
        storeId,
        name: "Synthetic Exempt Product",
        price: "220.00",
        shareToken: `batch18-lifecycle-product-${suffix}`,
        isActive: true,
        costJpy: "100",
        isTransportCostExempt: true,
      })
      .returning();
    productId = product.id;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function jsonRequest(method, path, body, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": MERCHANT_ID,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }

  const creditPath = () =>
    `/stores/${storeId}/customers/${customerId}/store-credit`;

  test("grant, spend, cancellation, and repeated cancellation preserve the frozen profit snapshot", async () => {
    const grant = await jsonRequest(
      "POST",
      creditPath(),
      {
        type: "grant",
        amount: "5000",
        reasonCode: "lifecycle_test",
        idempotencyKey: "batch18-lifecycle-grant",
      },
      { "x-confirm-store-credit": "true" },
    );
    assert.equal(grant.status, 201);
    assert.equal(grant.data.balance, "5000.000000000000");

    const created = await jsonRequest("POST", `/stores/${storeId}/orders`, {
      productId,
      customerId,
      buyerName: "Synthetic Buyer",
      buyerPhone: "0900000000",
      pickupMethod: "batch18-free-pickup",
      quantity: 1,
      creditSpent: "220",
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.creditSpent, "220.000000000000");
    assert.equal(created.data.payableAfterCredit, "0.000000000000");

    const [beforeCancellation] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, created.data.id));
    const frozenSnapshot = {
      costJpy: beforeCancellation.profitSnapshotCostJpy,
      exchangeRate: beforeCancellation.profitSnapshotExchangeRate,
      productCostTwd: beforeCancellation.profitSnapshotProductCostTwd,
      transportCostTwd: beforeCancellation.profitSnapshotTransportCostTwd,
      unitProfitTwd: beforeCancellation.profitSnapshotUnitProfitTwd,
      fullUnitProfitTwd: beforeCancellation.profitSnapshotFullUnitProfitTwd,
      status: beforeCancellation.profitSnapshotStatus,
      capturedAt: beforeCancellation.profitSnapshotCapturedAt?.toISOString(),
      backfilledAt:
        beforeCancellation.profitSnapshotBackfilledAt?.toISOString() ?? null,
    };
    assert.deepEqual(frozenSnapshot, {
      costJpy: "100.000000000000",
      exchangeRate: "0.200000000000",
      productCostTwd: "20.000000000000",
      transportCostTwd: "0.000000000000",
      unitProfitTwd: "200.000000000000",
      fullUnitProfitTwd: "200.000000000000",
      status: "exempt",
      capturedAt: frozenSnapshot.capturedAt,
      backfilledAt: null,
    });

    const afterSpend = await jsonRequest("GET", creditPath());
    assert.equal(afterSpend.status, 200);
    assert.equal(afterSpend.data.balance, "4780.000000000000");

    const cancelled = await jsonRequest(
      "PATCH",
      `/orders/${created.data.id}/status`,
      { status: "cancelled" },
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.status, "cancelled");

    const afterCancellation = await jsonRequest("GET", creditPath());
    assert.equal(afterCancellation.status, 200);
    assert.equal(afterCancellation.data.balance, "5000.000000000000");

    const repeatedCancellation = await jsonRequest(
      "PATCH",
      `/orders/${created.data.id}/status`,
      { status: "cancelled" },
    );
    assert.equal(repeatedCancellation.status, 200);

    const finalLedger = await db
      .select()
      .from(storeCreditTransactionsTable)
      .where(eq(storeCreditTransactionsTable.customerId, customerId));
    assert.equal(
      finalLedger.filter((entry) => entry.type === "reversal").length,
      1,
    );
    const finalBalance = await jsonRequest("GET", creditPath());
    assert.equal(finalBalance.data.balance, "5000.000000000000");

    const [afterRepeatedCancellation] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, created.data.id));
    assert.deepEqual(
      {
        costJpy: afterRepeatedCancellation.profitSnapshotCostJpy,
        exchangeRate: afterRepeatedCancellation.profitSnapshotExchangeRate,
        productCostTwd: afterRepeatedCancellation.profitSnapshotProductCostTwd,
        transportCostTwd:
          afterRepeatedCancellation.profitSnapshotTransportCostTwd,
        unitProfitTwd: afterRepeatedCancellation.profitSnapshotUnitProfitTwd,
        fullUnitProfitTwd:
          afterRepeatedCancellation.profitSnapshotFullUnitProfitTwd,
        status: afterRepeatedCancellation.profitSnapshotStatus,
        capturedAt:
          afterRepeatedCancellation.profitSnapshotCapturedAt?.toISOString(),
        backfilledAt:
          afterRepeatedCancellation.profitSnapshotBackfilledAt?.toISOString() ??
          null,
      },
      frozenSnapshot,
    );
  });
}
