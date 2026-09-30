import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

// Fail closed: this characterization suite creates synthetic records only in
// the explicitly opted-in disposable Phase 0 database. No ambient .env loading.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.equal(process.env.PIKA_PHASE0_DISPOSABLE, "DB-BUILD-01");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.username, "pika_phase0");
assert.equal(url.pathname, "/pika_phase0");

mock.module("@clerk/express", { namedExports: {
  getAuth: (req) => {
    const userId = req.headers?.["x-test-user-id"] ?? null;
    return { userId, sessionClaims: userId ? { userId } : undefined };
  },
  clerkMiddleware: () => (_req, _res, next) => next(),
} });
const { default: express } = await import("express");
const { db, pool, storesTable, productsTable, customersTable, ordersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: productsRouter } = await import("./products.ts");
const { default: ordersRouter } = await import("./orders.ts");
const { default: publicRouter } = await import("./public.ts");
const merchantId = "db_phase0_synthetic_merchant";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = { info() {}, warn() {}, error() {} };
  next();
});
app.use("/api", productsRouter, ordersRouter, publicRouter);
let server, baseUrl, storeId;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const [store] = await db.insert(storesTable).values({
    merchantId, name: "Phase0 合成假店鋪", slug: `db-phase0-${Date.now()}`,
    purchaseExchangeRate: "0.2",
  }).returning();
  storeId = store.id;
});
after(async () => {
  try {
    // Explicit retention supports the approved synthetic legacy dump checkpoint.
    if (storeId && process.env.PIKA_PHASE0_KEEP_FIXTURES !== "1") {
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
async function request(method, path, body, authenticated = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(authenticated ? { "x-test-user-id": merchantId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, method === "POST" ? 201 : 200, JSON.stringify(data));
  return data;
}
async function orderByToken(token) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicToken, token));
  assert.ok(order);
  return order;
}
const buyer = { buyerName: "Phase0 假買家", buyerPhone: "0900000000", pickupMethod: "假資料面交" };
function assertCartItemsPublic(items) {
  const keys = ["productId", "productName", "productImageUrl", "specValues", "quantity", "unitPrice", "subtotal"].sort();
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), keys);
}

test("legacy product creation, tier fallback, single/cart snapshots and public DTO remain compatible", async () => {
  const a = await request("POST", `/stores/${storeId}/products`, {
    name: "Phase0 假商品 A", price: 100.25, vipPrice: null, costJpy: 200, isTransportCostExempt: true,
  }, true);
  const b = await request("POST", `/stores/${storeId}/products`, {
    name: "Phase0 假商品 B", price: 50.1, costJpy: 100, isTransportCostExempt: true,
  }, true);
  assert.ok(a.id && a.shareToken);
  assert.equal(a.vipPrice, null);
  const [customer] = await db.insert(customersTable).values({
    storeId, code: "phase0-vip", name: "Phase0 假 VIP", tier: "vip",
  }).returning();
  const merchant = await request("POST", `/stores/${storeId}/orders`, {
    ...buyer, productId: a.id, customerId: customer.id, quantity: 1,
  }, true);
  // Missing VIP price falls back to 100.25; 200 JPY * .2 = 40 TWD.
  assert.equal(merchant.unitPrice, 100.25);
  assert.equal(merchant.profitSnapshotStatus, "exempt");
  assert.equal(merchant.profitSnapshotUnitProfitTwd, "60.250000000000");
  const single = await request("POST", `/p/${a.shareToken}/orders`, { ...buyer, quantity: 2 });
  assert.deepEqual(Object.keys(single).sort(), [
    "publicToken", "productName", "quantity", "unitPrice", "shippingFee", "totalPrice", "orderTotal",
    "pickupMethod", "specValues", "status", "statusLabel", "cvsStoreId", "cvsStoreName", "cvsStoreAddress", "cvsStorePhone", "createdAt",
  ].sort());
  const singleRow = await orderByToken(single.publicToken);
  assert.equal(singleRow.productId, a.id);
  assert.equal(singleRow.items, null);
  assert.equal(singleRow.totalPrice, "200.50");
  assert.equal(singleRow.profitSnapshotTransportCostTwd, "0.000000000000");
  assert.equal(singleRow.profitSnapshotUnitProfitTwd, "60.250000000000");

  const cart = await request("POST", "/cart/orders", { ...buyer, items: [
    { shareToken: a.shareToken, quantity: 2 }, { shareToken: b.shareToken, quantity: 3 },
  ] });
  assert.deepEqual(Object.keys(cart).sort(), ["publicToken", "pickupMethod", "createdAt", "shippingFee", "totalPrice", "items"].sort());
  assertCartItemsPublic(cart.items);
  assert.equal(cart.totalPrice, 350.8);
  const cartRow = await orderByToken(cart.publicToken);
  assert.equal(cartRow.productId, a.id);
  assert.equal(cartRow.items.length, 2);
  assert.equal(cartRow.cartProfitSnapshotStatus, "captured");
  // 2 * (100.25 - 40) + 3 * (50.10 - 20) = 210.80 TWD.
  assert.equal(cartRow.cartProfitSnapshotTotalTwd, "210.800000000000");
  assert.ok(cartRow.items.every((item) => item.profitSnapshot));
  assert.equal(cartRow.profitSnapshotUnitProfitTwd, null);

  await db.update(productsTable).set({ costJpy: null }).where(eq(productsTable.id, b.id));
  const pendingCart = await request("POST", "/cart/orders", { ...buyer, items: [
    { shareToken: a.shareToken, quantity: 1 }, { shareToken: b.shareToken, quantity: 1 },
  ] });
  const pendingRow = await orderByToken(pendingCart.publicToken);
  assert.equal(pendingRow.cartProfitSnapshotStatus, "pending");
  assert.equal(pendingRow.cartProfitSnapshotTotalTwd, null);
  assertCartItemsPublic(pendingCart.items);

  await db.update(productsTable).set({ price: "999.00", costJpy: "999" }).where(eq(productsTable.id, a.id));
  await db.update(storesTable).set({ purchaseExchangeRate: "0.9" }).where(eq(storesTable.id, storeId));
  assert.deepEqual(await orderByToken(single.publicToken), singleRow);
  assert.deepEqual(await orderByToken(cart.publicToken), cartRow);
  const tracked = await request("GET", `/orders/track/${cart.publicToken}`);
  assertCartItemsPublic(tracked.items);
  const privateFields = new Set([
    "costJpy", "purchaseExchangeRate", "profitSnapshot", "profitSnapshotUnitProfitTwd",
    "cartProfitSnapshotTotalTwd", "cartProfitSnapshotStatus", "internalNote",
  ]);
  function check(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(privateFields.has(key), false, `private field leaked: ${key}`);
      check(child);
    }
  }
  check(tracked);
});
