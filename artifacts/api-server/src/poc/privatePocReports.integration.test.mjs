import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db", "reports tests use only the local synthetic database");
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_reports_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-reports-gateway-key-32-characters";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable, productsTable, ordersTable } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let server, origin, store, decoy, product;
const storeIds = [];
const start = async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
};
async function request(path, { user = process.env.PIKA_OWNER_CLERK_USER_ID, gateway = true, method = "GET" } = {}) {
  const response = await fetch(origin + path, { method, headers: {
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(user ? { "x-test-clerk-user": user } : {}),
  } });
  return { status: response.status, body: await response.json() };
}
const monthlyPath = () => `/stores/${store.id}/orders/monthly-profit?month=2026-07`;
function snapshotOrder(ownerStore, ownerProduct, date, snapshot = "captured", quantity = 1) {
  const capturedAt = new Date(date);
  return {
    storeId: ownerStore.id, productId: ownerProduct.id, productName: "合成成本樣本",
    publicToken: randomUUID().replaceAll("-", ""), buyerName: "合成客人", buyerPhone: "0900000000",
    pickupMethod: "面交", unitPrice: "1900.00", quantity, totalPrice: `${1900 * quantity}.00`,
    createdAt: capturedAt,
    ...(snapshot === "captured" ? {
      profitSnapshotCostJpy: "8000", profitSnapshotExchangeRate: "0.21",
      profitSnapshotProductCostTwd: "1680", profitSnapshotTransportCostTwd: "0",
      profitSnapshotUnitProfitTwd: "220", profitSnapshotFullUnitProfitTwd: "220",
      profitSnapshotStatus: "captured", profitSnapshotCapturedAt: capturedAt,
    } : snapshot === "pending" ? {
      profitSnapshotStatus: "pending", profitSnapshotCapturedAt: capturedAt,
    } : {}),
  };
}
before(async () => {
  for (const name of ["designated", "decoy"]) {
    const [created] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
      name: `合成報表 ${name}`, slug: `poc-reports-${name}-${randomUUID()}` }).returning();
    storeIds.push(created.id);
    if (name === "designated") store = created; else decoy = created;
  }
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [product] = await db.insert(productsTable).values({ storeId: store.id, name: "合成成本樣本", price: "1900.00", shareToken: randomUUID() }).returning();
  const [otherProduct] = await db.insert(productsTable).values({ storeId: decoy.id, name: "其他店合成商品", price: "1900.00", shareToken: randomUUID() }).returning();
  await db.insert(ordersTable).values([
    snapshotOrder(store, product, "2026-06-30T16:00:00.000Z", "captured", 2),
    snapshotOrder(store, product, "2026-07-15T00:00:00.000Z", "pending"),
    snapshotOrder(store, product, "2026-07-31T15:59:59.999Z", "missing"),
    snapshotOrder(store, product, "2026-06-30T15:59:59.999Z"),
    snapshotOrder(store, product, "2026-07-31T16:00:00.000Z"),
    snapshotOrder(decoy, otherProduct, "2026-07-15T00:00:00.000Z"),
  ]);
  await start();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (storeIds.length) {
    await db.delete(ordersTable).where(inArray(ordersTable.storeId, storeIds));
    await db.delete(productsTable).where(inArray(productsTable.storeId, storeIds));
    await db.delete(storesTable).where(inArray(storesTable.id, storeIds));
  }
  await pool.end();
});

test("POC reports require the gateway, designated owner and designated store", async () => {
  for (const endpoint of ["monthly-profit?month=2026-07", "profit-summary"]) {
    const path = `/stores/${store.id}/orders/${endpoint}`;
    assert.equal((await request(path, { gateway: false })).status, 403);
    assert.equal((await request(path, { user: null })).status, 401);
    assert.equal((await request(path, { user: "user_not_the_owner" })).status, 403);
    assert.equal((await request(`/stores/${decoy.id}/orders/${endpoint}`)).status, 403);
    assert.equal((await request(path, { method: "POST" })).status, 403);
  }
});

test("month selection reads persisted snapshots with Taipei boundaries, without changing orders", async () => {
  const beforeRows = await db.select().from(ordersTable).where(eq(ordersTable.storeId, store.id)).orderBy(ordersTable.id);
  const report = await request(monthlyPath());
  assert.equal(report.status, 200);
  // ¥8000 × 0.21 + 0 transport = NT$1680; (1900 - 1680) × 2 = NT$440.
  assert.deepEqual(report.body, { month: "2026-07", timeZone: "Asia/Taipei", orderCount: 3,
    capturedProfitSubtotalTwd: "440.000000000000", capturedProfitSubtotalDisplayTwd: "440",
    pendingOrderCount: 1, missingSnapshotOrderCount: 1 });
  assert.deepEqual(await db.select().from(ordersTable).where(eq(ordersTable.storeId, store.id)).orderBy(ordersTable.id), beforeRows);
});

test("existing all-time profit summary remains scoped and missing cost is counted separately", async () => {
  const report = await request(`/stores/${store.id}/orders/profit-summary`);
  assert.equal(report.status, 200);
  assert.deepEqual(report.body, { capturedProfitSubtotalTwd: "880.000000000000", capturedProfitSubtotalDisplayTwd: "880",
    pendingOrderCount: 1, missingSnapshotOrderCount: 1 });
});

test("invalid and empty months use the existing report contract", async () => {
  assert.equal((await request(`/stores/${store.id}/orders/monthly-profit?month=2026-13`)).status, 400);
  assert.equal((await request(`/stores/${store.id}/orders/monthly-profit`)).status, 400);
  const empty = await request(`/stores/${store.id}/orders/monthly-profit?month=2025-01`);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.orderCount, 0);
});

test("restarted API reads the same report without recalculating or writing snapshots", async () => {
  const original = await request(monthlyPath());
  await new Promise(resolve => server.close(resolve));
  await start();
  assert.deepEqual(await request(monthlyPath()), original);
});
