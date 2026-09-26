import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db");
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_advanced_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-advanced-gateway-key-32-characters";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable, customersTable, tripsTable, tripRoutesTable, productsTable,
  storeCreditTransactionsTable, auditLogsTable, ordersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let server, origin, store, decoy, customer, otherCustomer, trip, route, product, order;
const invalidRoutes = [];
const start = async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
};
async function request(method, path, body, { user = process.env.PIKA_OWNER_CLERK_USER_ID, gateway = true, headers = {} } = {}) {
  const response = await fetch(origin + path, { method, headers: {
    "content-type": "application/json", ...headers,
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(user ? { "x-test-clerk-user": user } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.headers.get("content-type")?.includes("text/csv")
    ? await response.text() : await response.json() };
}
const creditPath = () => `/stores/${store.id}/customers/${customer.id}/store-credit`;
const confirmed = { headers: { "x-confirm-store-credit": "true" } };
const grant = { type: "grant", amount: "100.100000000001", reasonCode: "synthetic_test", idempotencyKey: "advanced-grant" };
const debit = { type: "adjust", amount: "-80.000000000001", reasonCode: "synthetic_correction", idempotencyKey: "advanced-debit" };
before(async () => {
  [store, decoy] = await db.insert(storesTable).values(["own", "decoy"].map(name => ({
    merchantId: process.env.PIKA_OWNER_CLERK_USER_ID, name: `合成進階 ${name}`, slug: `poc-advanced-${name}-${randomUUID()}`,
  }))).returning();
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [customer] = await db.insert(customersTable).values({ storeId: store.id, code: "POC-ADVANCED", name: "合成測試客戶", phone: "0900000000" }).returning();
  [otherCustomer] = await db.insert(customersTable).values({ storeId: decoy.id, code: "POC-DECOY", name: "不可匯出的合成客戶" }).returning();
  for (const ownerId of [decoy.id, null]) {
    const [parent] = await db.insert(tripsTable).values({ storeId: ownerId, name: "不可套用的合成行程", exchangeRate: "0.9" }).returning();
    for (const childOwner of [ownerId, store.id]) {
      const [child] = await db.insert(tripRoutesTable).values({ storeId: childOwner, tripId: parent.id, areaTitle: `隔離路線-${childOwner}`, startPlace: "假起點", endPlace: "假終點", estQty: 10, etcJpy: "100" }).returning();
      invalidRoutes.push(child);
    }
  }
  await start();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  // Append-only ledger and its FK parents stay in this disposable synthetic DB.
  // Never disable triggers or delete ledger records to make cleanup pass.
  await pool.end();
});

test("ledger, export and cost writes retain gateway, exact owner and store restrictions", async () => {
  for (const [method, path, body] of [["POST", creditPath(), grant], ["GET", `/stores/${store.id}/customers/export`], ["PATCH", `/stores/${store.id}`, { purchaseExchangeRate: 0.2 }]]) {
    assert.equal((await request(method, path, body, { gateway: false })).status, 403);
    assert.equal((await request(method, path, body, { user: null })).status, 401);
    assert.equal((await request(method, path, body, { user: "user_other" })).status, 403);
    assert.equal((await request(method, path.replace(`/stores/${store.id}`, `/stores/${decoy.id}`), body, confirmed)).status, 403);
  }
  assert.equal((await request("POST", `/stores/${store.id}/customers/${otherCustomer.id}/store-credit`, grant, confirmed)).status, 404);
  assert.equal((await request("POST", creditPath(), grant)).status, 428);
});

test("synthetic grant and debit save exactly; retries after debit remain idempotent", async () => {
  assert.equal((await request("POST", creditPath(), grant, confirmed)).status, 201);
  const adjusted = await request("POST", creditPath(), debit, confirmed);
  assert.equal(adjusted.status, 201);
  assert.equal(adjusted.body.balance, "20.100000000000"); // 100.100000000001 - 80.000000000001
  const retry = await request("POST", creditPath(), debit, confirmed);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.transaction.id, adjusted.body.transaction.id);
  assert.equal(retry.body.balance, "20.100000000000");
  assert.equal((await request("POST", creditPath(), { ...debit, amount: "-81" }, confirmed)).status, 409);
  assert.equal((await request("POST", creditPath(), { ...debit, idempotencyKey: "overdraw", amount: "-21" }, confirmed)).status, 422);
  assert.equal((await request("GET", creditPath())).body.total, 2);
  const rows = await db.select().from(storeCreditTransactionsTable).where(eq(storeCreditTransactionsTable.customerId, customer.id));
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.createdBy === process.env.PIKA_OWNER_CLERK_USER_ID && r.relatedOrderId === null));
  const audits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.storeId, store.id));
  assert.equal(audits.filter(r => r.action.startsWith("store_credit_")).length, 2);
  await assert.rejects(pool.query("UPDATE store_credit_transactions SET note = 'forbidden' WHERE id = $1", [rows[0].id]), /append.only/i);
});

test("CSV defaults to masked; cleartext requires confirmation and excludes the other store", async () => {
  const path = `/stores/${store.id}/customers/export`;
  const masked = await request("GET", path);
  assert.equal(masked.status, 200); assert.match(masked.body, /POC-ADVANCED/);
  assert.doesNotMatch(masked.body, /0900000000|合成測試客戶|POC-DECOY/);
  assert.equal((await request("GET", path + "?mode=cleartext")).status, 400);
  const clear = await request("GET", path + "?mode=cleartext", undefined, { headers: { "x-confirm-cleartext-export": "true" } });
  assert.equal(clear.status, 200); assert.match(clear.body, /0900000000/); assert.match(clear.body, /合成測試客戶/);
  assert.doesNotMatch(clear.body, /POC-DECOY/);
  const audits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.storeId, store.id));
  assert.equal(audits.filter(r => r.action.startsWith("export_customers_")).length, 2);
  assert.ok(audits.every(r => !/0900000000|合成測試客戶/.test(r.target)));
});

test("existing trip and purchase rates yield a hand-calculated transport allocation", async () => {
  assert.equal((await request("PATCH", `/stores/${store.id}`, { purchaseExchangeRate: 0.2 })).status, 200);
  assert.equal((await request("PATCH", `/stores/${store.id}`, { shippingCvsEnabled: false })).status, 403);
  trip = (await request("POST", "/trips", { name: "合成成本行程", exchangeRate: 0.21 })).body;
  route = (await request("POST", `/trips/${trip.id}/routes`, { areaTitle: "合成區域", startPlace: "假起點", endPlace: "假終點", estQty: 10, trainJpy: 100, etcJpy: 200 })).body;
  const created = await request("POST", `/stores/${store.id}/products`, { name: "合成交通成本商品", price: 300, inventory: 10, costJpy: 1000 });
  assert.equal(created.status, 201); product = created.body;
  const path = `/stores/${store.id}/products/${product.id}`;
  assert.equal((await request("PATCH", path, { tripRouteId: route.id })).status, 200);
  const listed = (await request("GET", `/stores/${store.id}/products`)).body.find(p => p.id === product.id);
  // Transport: (100 + 200) / 10 * 0.21 = 6.3. Purchase: 1000 * 0.2 = 200.
  // Profit: 300 - 200 - 6.3 = 93.7; display rounds once to 94.
  assert.deepEqual(listed.estimatedProfit, { status: "ready", transportStatus: "allocated", unitProfitTwd: "94" });
});

test("products reject foreign, NULL and inconsistent trip ownership on create and update", async () => {
  for (const invalid of invalidRoutes) {
    assert.equal((await request("POST", `/stores/${store.id}/products`, { name: "不可建立", price: 1, tripRouteId: invalid.id })).status, 400);
    assert.equal((await request("PATCH", `/stores/${store.id}/products/${product.id}`, { tripRouteId: invalid.id })).status, 400);
  }
  assert.equal((await request("GET", `/stores/${store.id}/products/${product.id}`)).body.tripRouteId, route.id);
  // A legacy inconsistent link must not be used by the read/snapshot loader either.
  await db.update(productsTable).set({ tripRouteId: invalidRoutes[0].id }).where(eq(productsTable.id, product.id));
  try {
    const listed = (await request("GET", `/stores/${store.id}/products`)).body.find(p => p.id === product.id);
    assert.equal(listed.estimatedProfit.status, "pending_confirmation");
  } finally {
    await db.update(productsTable).set({ tripRouteId: route.id }).where(eq(productsTable.id, product.id));
  }
});

test("a synthetic order captures exact costs; later product edits do not rewrite that snapshot", async () => {
  const created = await request("POST", `/p/${product.shareToken}/orders`, { buyerName: "合成客人", buyerPhone: "0900000000", pickupMethod: "面交", quantity: 2 });
  assert.equal(created.status, 201, JSON.stringify(created.body)); order = created.body;
  const [saved] = await db.select().from(ordersTable).where(eq(ordersTable.publicToken, order.publicToken));
  assert.equal(saved.totalPrice, "600.00"); assert.equal(saved.profitSnapshotTransportCostTwd, "6.300000000000");
  assert.equal(saved.profitSnapshotUnitProfitTwd, "93.700000000000");
  assert.equal((await request("PATCH", `/stores/${store.id}/products/${product.id}`, { costJpy: 1100 })).status, 200);
  const [afterEdit] = await db.select().from(ordersTable).where(eq(ordersTable.id, saved.id));
  assert.deepEqual(afterEdit, saved);
  const tracked = await request("GET", `/orders/track/${order.publicToken}`, undefined, { user: null });
  assert.equal(tracked.status, 200); assert.equal(tracked.body.orderTotal, 600);
  for (const field of ["profitSnapshot", "costJpy", "buyerPhone", "storeCreditTransactions"]) assert.equal(field in tracked.body, false);
});

test("server restart reads the same persisted ledger, CSV and product attachment", async () => {
  const paths = [creditPath(), `/stores/${store.id}/customers/export`, `/stores/${store.id}/products/${product.id}`];
  const original = await Promise.all(paths.map(p => request("GET", p)));
  await new Promise(resolve => server.close(resolve)); await start();
  assert.deepEqual(await Promise.all(paths.map(p => request("GET", p))), original);
});
