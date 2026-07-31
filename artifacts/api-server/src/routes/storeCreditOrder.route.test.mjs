/**
 * Store-credit order integration against CI's disposable PostgreSQL only.
 * Every identity and customer value below is synthetic.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "store-credit order route requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_ID = "batch17_credit_order_fake_owner";

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
    auditLogsTable,
    customersTable,
    db,
    ordersTable,
    pool,
    productsTable,
    storeCreditTransactionsTable,
    storesTable,
  } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
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

    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: MERCHANT_ID,
        name: "假資料購物金店",
        slug: `batch17-credit-order-${Date.now()}`,
      })
      .returning();
    storeId = store.id;
    const [customer] = await db
      .insert(customersTable)
      .values({
        storeId,
        code: `demo-credit-${Date.now()}`,
        name: "假資料顧客",
      })
      .returning();
    customerId = customer.id;
    const [product] = await db
      .insert(productsTable)
      .values({
        storeId,
        name: "假資料百元商品",
        price: "100.00",
        shareToken: `batch17-credit-product-${Date.now()}`,
        isActive: true,
      })
      .returning();
    productId = product.id;
    await db.insert(storeCreditTransactionsTable).values({
      storeId,
      customerId,
      direction: "credit",
      type: "grant",
      amount: "100.000000000000",
      relatedOrderId: null,
      note: "synthetic test grant",
      createdBy: MERCHANT_ID,
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function createOrder(body) {
    const response = await fetch(`${baseUrl}/stores/${storeId}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": MERCHANT_ID,
      },
      body: JSON.stringify({
        productId,
        buyerName: "假資料買家",
        buyerPhone: "0900000000",
        pickupMethod: "假資料面交",
        quantity: 1,
        ...body,
      }),
    });
    return { status: response.status, data: await response.json() };
  }

  async function deleteOrder(orderId) {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/orders/${orderId}`,
      {
        method: "DELETE",
        headers: {
          "x-test-user-id": MERCHANT_ID,
        },
      },
    );
    return { status: response.status, data: await response.json() };
  }

  test("linked customer spends exact credit to zero in the same order transaction", async () => {
    const missingCustomer = await createOrder({ creditSpent: "1" });
    assert.equal(missingCustomer.status, 422);
    assert.match(missingCustomer.data.error, /linked customer/);

    const created = await createOrder({
      customerId,
      creditSpent: "100.000000000000",
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.creditSpent, 100);
    assert.equal(created.data.payableAfterCredit, 0);
    assert.equal(created.data.remainingAmount, 0);

    const [storedOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, created.data.id));
    assert.equal(storedOrder.creditSpent, "100.000000000000");
    assert.equal(storedOrder.payableAfterCredit, "0.000000000000");

    const ledger = await db
      .select()
      .from(storeCreditTransactionsTable)
      .where(eq(storeCreditTransactionsTable.customerId, customerId));
    assert.equal(ledger.length, 2);
    const spend = ledger.find((entry) => entry.type === "spend");
    assert.equal(spend.amount, "100.000000000000");
    assert.equal(spend.relatedOrderId, created.data.id);

    const overdraw = await createOrder({
      customerId,
      creditSpent: "0.000000000001",
    });
    assert.equal(overdraw.status, 422);
    assert.match(overdraw.data.error, /exceeds available balance/);

    const cancel = () =>
      fetch(`${baseUrl}/orders/${created.data.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": MERCHANT_ID,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
    const concurrentCancellations = await Promise.all([cancel(), cancel()]);
    assert.deepEqual(
      concurrentCancellations.map((response) => response.status),
      [200, 200],
    );
    const cancellationBodies = await Promise.all(
      concurrentCancellations.map((response) => response.json()),
    );
    assert.ok(cancellationBodies.every((body) => body.status === "cancelled"));

    const repeatedCancellation = await cancel();
    assert.equal(repeatedCancellation.status, 200);
    assert.equal((await repeatedCancellation.json()).status, "cancelled");

    const ledgerAfterCancellation = await db
      .select()
      .from(storeCreditTransactionsTable)
      .where(eq(storeCreditTransactionsTable.customerId, customerId));
    const reversals = ledgerAfterCancellation.filter(
      (entry) =>
        entry.type === "reversal" && entry.relatedOrderId === created.data.id,
    );
    assert.equal(reversals.length, 1);
    assert.equal(reversals[0].amount, "100.000000000000");

    const creditAuditRows = (
      await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.storeId, storeId))
    ).filter((row) => row.action.startsWith("store_credit_"));
    assert.deepEqual(creditAuditRows.map((row) => row.action).sort(), [
      "store_credit_reversal",
      "store_credit_spend",
    ]);
    for (const row of creditAuditRows) {
      assert.equal(row.actor, MERCHANT_ID);
      assert.match(
        row.target,
        new RegExp(
          `^customer-${customerId}:ledger-\\d+:order-${created.data.id}:amount-100\\.000000000000$`,
        ),
      );
      assert.doesNotMatch(
        row.target,
        /0900000000|batch17-credit-product|publicToken/i,
      );
    }

    const linkedDelete = await deleteOrder(created.data.id);
    assert.equal(linkedDelete.status, 409);
    assert.equal(
      linkedDelete.data.error,
      "這筆訂單已有物流或完成紀錄，為避免帳務與物流資料不一致，請保留紀錄或改用取消訂單。",
    );

    const unusedPendingOrder = await createOrder({});
    assert.equal(unusedPendingOrder.status, 201);
    const unusedDelete = await deleteOrder(unusedPendingOrder.data.id);
    assert.equal(unusedDelete.status, 200);
    assert.deepEqual(unusedDelete.data, { ok: true });
  });
}
