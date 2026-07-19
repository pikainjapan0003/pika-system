/**
 * MVP-3 package 2 route integration test.
 * Uses only synthetic data and skips cleanly when no disposable DATABASE_URL
 * is supplied. Never point this test at production or an existing database.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "order profit snapshot route integration requires a disposable DATABASE_URL",
    {
      skip: "DATABASE_URL not set",
    },
    () => {},
  );
} else {
  const TEST_MERCHANT_ID = "mvp3_pkg2_fake_merchant";

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
  const { db, customersTable, ordersTable, pool, productsTable, storesTable } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: publicRouter } = await import("./public.ts");
  const { default: ordersRouter } = await import("./orders.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", publicRouter);
  app.use("/api", ordersRouter);

  let server;
  let baseUrl;
  let storeId;
  let productId;
  let shareToken;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: TEST_MERCHANT_ID,
        name: "MVP3 包2 假店鋪",
        slug: `mvp3-pkg2-fake-${Date.now()}`,
        purchaseExchangeRate: null,
      })
      .returning();
    storeId = store.id;

    shareToken = `mvp3-pkg2-fake-product-${Date.now()}`;
    const [product] = await db
      .insert(productsTable)
      .values({
        storeId,
        name: "MVP3 包2 假商品",
        price: "1900.00",
        vipPrice: "1800.00",
        wholesalePrice: null,
        partnerPrice: "1500.00",
        shareToken,
        isActive: true,
        costJpy: null,
        isTransportCostExempt: false,
      })
      .returning();
    productId = product.id;
  });

  after(async () => {
    if (storeId)
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(method, path, body, authenticated = false) {
    const headers = { "Content-Type": "application/json" };
    if (authenticated) headers["x-test-user-id"] = TEST_MERCHANT_ID;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
    };
  }

  async function placeOrder(buyerName) {
    return request("POST", `/p/${shareToken}/orders`, {
      buyerName,
      buyerPhone: "0900000000",
      pickupMethod: "假資料面交",
      quantity: 1,
    });
  }

  async function placeMerchantOrder(buyerName, customerId = null) {
    return request(
      "POST",
      `/stores/${storeId}/orders`,
      {
        productId,
        customerId,
        buyerName,
        buyerPhone: "0900000000",
        pickupMethod: "假資料面交",
        quantity: 1,
      },
      true,
    );
  }

  async function setCostState(
    purchaseExchangeRate,
    costJpy,
    isTransportCostExempt,
  ) {
    await db
      .update(storesTable)
      .set({ purchaseExchangeRate })
      .where(eq(storesTable.id, storeId));
    await db
      .update(productsTable)
      .set({ costJpy, isTransportCostExempt })
      .where(eq(productsTable.id, productId));
  }

  test("public creation captures pending, backfills once, and freezes old orders", async () => {
    await setCostState(null, null, false);
    const pendingResponse = await placeOrder("假買家甲");
    assert.equal(pendingResponse.status, 201);
    for (const field of [
      "profitSnapshotCostJpy",
      "profitSnapshotExchangeRate",
      "profitSnapshotProductCostTwd",
      "profitSnapshotTransportCostTwd",
      "profitSnapshotUnitProfitTwd",
      "profitSnapshotFullUnitProfitTwd",
      "profitSnapshotStatus",
      "profitSnapshotCapturedAt",
      "profitSnapshotBackfilledAt",
    ]) {
      assert.equal(
        Object.hasOwn(pendingResponse.data, field),
        false,
        `${field} leaked publicly`,
      );
    }

    const [pendingOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.publicToken, pendingResponse.data.publicToken));
    assert.equal(pendingOrder.profitSnapshotStatus, "pending");
    assert.equal(pendingOrder.profitSnapshotUnitProfitTwd, null);

    await db
      .update(storesTable)
      .set({ purchaseExchangeRate: "0.21" })
      .where(eq(storesTable.id, storeId));
    await db
      .update(productsTable)
      .set({ costJpy: "8000", isTransportCostExempt: true })
      .where(eq(productsTable.id, productId));

    const backfill = await request(
      "POST",
      `/orders/${pendingOrder.id}/profit-snapshot/backfill`,
      undefined,
      true,
    );
    assert.equal(backfill.status, 200);
    assert.equal(backfill.data.profitSnapshotStatus, "exempt");
    assert.equal(backfill.data.profitSnapshotUnitProfitTwd, "220.000000000000");
    assert.ok(backfill.data.profitSnapshotBackfilledAt);

    const secondBackfill = await request(
      "POST",
      `/orders/${pendingOrder.id}/profit-snapshot/backfill`,
      undefined,
      true,
    );
    assert.equal(secondBackfill.status, 409);

    const capturedAt021 = await placeOrder("假買家乙");
    assert.equal(capturedAt021.status, 201);
    const [orderAt021] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.publicToken, capturedAt021.data.publicToken));
    assert.equal(orderAt021.profitSnapshotUnitProfitTwd, "220.000000000000");

    await db
      .update(storesTable)
      .set({ purchaseExchangeRate: "0.22" })
      .where(eq(storesTable.id, storeId));
    const capturedAt022 = await placeOrder("假買家丙");
    assert.equal(capturedAt022.status, 201);

    const [oldOrderAfterRateChange] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderAt021.id));
    const [newOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.publicToken, capturedAt022.data.publicToken));
    assert.equal(
      oldOrderAfterRateChange.profitSnapshotUnitProfitTwd,
      "220.000000000000",
    );
    assert.equal(newOrder.profitSnapshotUnitProfitTwd, "140.000000000000");
  });

  test("merchant creation captures pending, backfills once, and freezes new snapshots", async () => {
    await setCostState(null, null, false);
    const pendingResponse = await placeMerchantOrder("假後台買家甲");
    assert.equal(pendingResponse.status, 201);
    assert.equal(pendingResponse.data.profitSnapshotStatus, "pending");
    assert.equal(pendingResponse.data.profitSnapshotUnitProfitTwd, null);
    assert.ok(pendingResponse.data.profitSnapshotCapturedAt);

    await setCostState("0.21", "8000", true);
    const backfill = await request(
      "POST",
      `/orders/${pendingResponse.data.id}/profit-snapshot/backfill`,
      undefined,
      true,
    );
    assert.equal(backfill.status, 200);
    assert.equal(backfill.data.profitSnapshotStatus, "exempt");
    assert.equal(
      backfill.data.profitSnapshotTransportCostTwd,
      "0.000000000000",
    );
    assert.equal(backfill.data.profitSnapshotUnitProfitTwd, "220.000000000000");
    assert.ok(backfill.data.profitSnapshotBackfilledAt);

    const secondBackfill = await request(
      "POST",
      `/orders/${pendingResponse.data.id}/profit-snapshot/backfill`,
      undefined,
      true,
    );
    assert.equal(secondBackfill.status, 409);

    const capturedAt021 = await placeMerchantOrder("假後台買家乙");
    assert.equal(capturedAt021.status, 201);
    assert.equal(capturedAt021.data.profitSnapshotStatus, "exempt");
    assert.equal(
      capturedAt021.data.profitSnapshotUnitProfitTwd,
      "220.000000000000",
    );

    await setCostState("0.22", "8000", true);
    const capturedAt022 = await placeMerchantOrder("假後台買家丙");
    assert.equal(capturedAt022.status, 201);
    assert.equal(
      capturedAt022.data.profitSnapshotUnitProfitTwd,
      "140.000000000000",
    );

    const [oldOrderAfterRateChange] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, capturedAt021.data.id));
    assert.equal(
      oldOrderAfterRateChange.profitSnapshotUnitProfitTwd,
      "220.000000000000",
    );
  });

  test("merchant creation resolves customer tier price before freezing the snapshot", async () => {
    await setCostState("0.21", "8000", true);
    await db
      .update(productsTable)
      .set({ vipPrice: "1800.00", wholesalePrice: null })
      .where(eq(productsTable.id, productId));

    const [generalCustomer, vipCustomer, wholesaleCustomer] = await db
      .insert(customersTable)
      .values([
        {
          storeId,
          code: `general-${Date.now()}`,
          name: "假資料一般客",
          tier: "general",
        },
        {
          storeId,
          code: `vip-${Date.now()}`,
          name: "假資料 VIP 客",
          tier: "vip",
        },
        {
          storeId,
          code: `wholesale-${Date.now()}`,
          name: "假資料批發客",
          tier: "wholesale",
        },
      ])
      .returning();

    // Hand-fixed fixtures: 8000 * 0.21 = 1680.
    // General 1900 -> 220; VIP 1800 -> 120; missing wholesale -> general 1900 -> 220.
    const general = await placeMerchantOrder(
      "假資料一般訂單",
      generalCustomer.id,
    );
    const vip = await placeMerchantOrder("假資料 VIP 訂單", vipCustomer.id);
    const wholesale = await placeMerchantOrder(
      "假資料批發訂單",
      wholesaleCustomer.id,
    );

    assert.equal(general.status, 201);
    assert.equal(general.data.unitPrice, 1900);
    assert.equal(general.data.profitSnapshotUnitProfitTwd, "220.000000000000");
    assert.equal(vip.status, 201);
    assert.equal(vip.data.unitPrice, 1800);
    assert.equal(vip.data.profitSnapshotUnitProfitTwd, "120.000000000000");
    assert.equal(wholesale.status, 201);
    assert.equal(wholesale.data.unitPrice, 1900);
    assert.equal(
      wholesale.data.profitSnapshotUnitProfitTwd,
      "220.000000000000",
    );

    await db
      .update(productsTable)
      .set({ vipPrice: "0.00" })
      .where(eq(productsTable.id, productId));
    const zeroVip = await placeMerchantOrder(
      "假資料零元 VIP 訂單",
      vipCustomer.id,
    );
    assert.equal(zeroVip.status, 201);
    assert.equal(zeroVip.data.unitPrice, 0);
    assert.equal(
      zeroVip.data.profitSnapshotUnitProfitTwd,
      "-1680.000000000000",
    );
  });
}
