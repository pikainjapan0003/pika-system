/**
 * Persistent picking checks against CI's disposable PostgreSQL only.
 * All identities and order data are synthetic.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "order picking route requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const OWNER = "batch17_picking_fake_owner";
  const OTHER_OWNER = "batch17_picking_other_owner";

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
    db,
    orderPickingChecksTable,
    ordersTable,
    pool,
    productsTable,
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
  let orderId;
  let itemKey;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: OWNER,
        name: "假包貨店",
        slug: `batch17-picking-${Date.now()}`,
      })
      .returning();
    storeId = store.id;
    const [product] = await db
      .insert(productsTable)
      .values({
        storeId,
        name: "假包貨商品",
        price: "100.00",
        shareToken: `batch17-picking-product-${Date.now()}`,
        isActive: true,
      })
      .returning();
    const [order] = await db
      .insert(ordersTable)
      .values({
        productId: product.id,
        storeId,
        productName: product.name,
        publicToken: `batch17-picking-order-${Date.now()}`,
        buyerName: "假客人",
        buyerPhone: "0900000000",
        pickupMethod: "自取",
        quantity: 2,
        unitPrice: "100.00",
        totalPrice: "200.00",
        status: "preparing",
        shippingStatus: "preparing",
        specValues: { color: "粉" },
      })
      .returning();
    orderId = order.id;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(path, options = {}, userId = OWNER) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
        ...options.headers,
      },
    });
    return { status: response.status, body: await response.json() };
  }

  async function getPickingList(userId = OWNER) {
    return request(
      "/orders/picking-list",
      {
        method: "POST",
        body: JSON.stringify({ orderIds: [orderId] }),
      },
      userId,
    );
  }

  test("picking list returns an unchecked persistent item", async () => {
    const result = await getPickingList();
    assert.equal(result.status, 200);
    assert.equal(result.body.orderItems.length, 1);
    assert.equal(result.body.orderItems[0].checked, false);
    assert.equal(result.body.orderItems[0].readOnly, false);
    itemKey = result.body.orderItems[0].itemKey;
  });

  test("unauthenticated and cross-store writes are rejected", async () => {
    const unauthenticated = await request(
      `/orders/${orderId}/picking-check`,
      {
        method: "POST",
        body: JSON.stringify({ itemKey, checked: true }),
      },
      null,
    );
    assert.equal(unauthenticated.status, 401);

    const crossStore = await request(
      `/orders/${orderId}/picking-check`,
      {
        method: "POST",
        body: JSON.stringify({ itemKey, checked: true }),
      },
      OTHER_OWNER,
    );
    assert.equal(crossStore.status, 403);
  });

  test("checking and unchecking writes and removes exactly one row", async () => {
    const checked = await request(`/orders/${orderId}/picking-check`, {
      method: "POST",
      body: JSON.stringify({ itemKey, checked: true }),
    });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.checked, true);

    const listAfterCheck = await getPickingList();
    assert.equal(listAfterCheck.body.orderItems[0].checked, true);

    const unchecked = await request(`/orders/${orderId}/picking-check`, {
      method: "POST",
      body: JSON.stringify({ itemKey, checked: false }),
    });
    assert.equal(unchecked.status, 200);
    assert.equal(unchecked.body.checked, false);
    const rows = await db
      .select()
      .from(orderPickingChecksTable)
      .where(eq(orderPickingChecksTable.orderId, orderId));
    assert.equal(rows.length, 0);
  });

  test("shipped orders preserve checks and reject later changes", async () => {
    await request(`/orders/${orderId}/picking-check`, {
      method: "POST",
      body: JSON.stringify({ itemKey, checked: true }),
    });
    await db
      .update(ordersTable)
      .set({ shippingStatus: "shipped" })
      .where(eq(ordersTable.id, orderId));

    const list = await getPickingList();
    assert.equal(list.body.orderItems[0].checked, true);
    assert.equal(list.body.orderItems[0].readOnly, true);

    const rejected = await request(`/orders/${orderId}/picking-check`, {
      method: "POST",
      body: JSON.stringify({ itemKey, checked: false }),
    });
    assert.equal(rejected.status, 409);
    const rows = await db
      .select()
      .from(orderPickingChecksTable)
      .where(eq(orderPickingChecksTable.orderId, orderId));
    assert.equal(rows.length, 1);
  });
}
