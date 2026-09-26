import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db", "fixtures only run in local isolated PG");
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_logistics_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-logistics-gateway-32-characters";
process.env.PIKA_POC_FAMILYMART_TRACKING_CODE = "90000000001";
process.env.LOG_LEVEL = "silent";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: (req) => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable, productsTable, ordersTable, shipmentTrackingsTable,
  shipmentTrackingEventsTable, shipmentTrackingRunLogsTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let server, origin, store, product, order, otherOrder, trackingId;
let providerCalls = 0;
const carrierUrl = "https://ecfme.fme.com.tw/FMEDCFPWebV2_II/list.aspx/GetOrderDetail";
const realFetch = globalThis.fetch;
const event = (status, date) => ({ STATUS_D: status, ORDER_DATE_R: date,
  RCV_STORE_NAME: "合成門市", RCV_USER_NAME: "DO_NOT_PERSIST", RCV_TEL: "DO_NOT_PERSIST" });
let fixture = { ErrorCode: "000", List: [
  event("貨件配達取件店舖", "2026/09/26 10:00"), event("貨件前往物流中心", "2026/09/26 08:00"),
] };
let providerFailure = null;
// Only HTTP transport is a fixture. Actual adapter, worker, routes and PG run normally.
globalThis.fetch = async (url, options) => {
  if (String(url) === carrierUrl) {
    providerCalls++;
    assert.deepEqual(JSON.parse(options.body), { EC_ORDER_NO: "90000000001", ORDER_NO: "90000000001", RCV_USER_NAME: null });
    if (providerFailure) throw providerFailure;
    return new Response(JSON.stringify({ d: JSON.stringify(fixture) }), { headers: { "content-type": "application/json" } });
  }
  assert.ok(origin && String(url).startsWith(origin + "/"), "unexpected external request is forbidden");
  return realFetch(url, options);
};
async function start() {
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
}
async function request(method, path, { owner = true, gateway = true, body } = {}) {
  const response = await fetch(origin + path, { method, headers: {
    "content-type": "application/json",
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(owner ? { "x-test-clerk-user": owner === true ? process.env.PIKA_OWNER_CLERK_USER_ID : owner } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const sync = (options = {}, orderId = order.id) => request("POST", `/stores/${store.id}/orders/${orderId}/logistics/familymart`, {
  body: { trackingCode: "90000000001" }, ...options,
});
const saved = async () => (await db.select().from(shipmentTrackingsTable).where(eq(shipmentTrackingsTable.id, trackingId)))[0];
const events = () => db.select().from(shipmentTrackingEventsTable).where(eq(shipmentTrackingEventsTable.shipmentTrackingId, trackingId));
const customer = () => request("GET", `/orders/track/${order.publicToken}`, { owner: false });
before(async () => {
  [store] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
    name: "合成物流測試", slug: `poc-logistics-${randomUUID()}` }).returning();
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [product] = await db.insert(productsTable).values({ storeId: store.id, name: "合成商品", price: "100.00",
    inventory: 5, shareToken: randomUUID() }).returning();
  const values = { storeId: store.id, productId: product.id, productName: product.name,
    buyerName: "合成客人", buyerPhone: "0900000000", pickupMethod: "全家",
    quantity: 2, unitPrice: "100.00", totalPrice: "200.00", shippingFee: "0.00", internalNote: "PRIVATE_NOTE" };
  [order, otherOrder] = await db.insert(ordersTable).values([1, 2].map(() => ({ ...values, publicToken: randomUUID().replaceAll("-", "") }))).returning();
  await start();
});
after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query("ALTER TABLE shipment_tracking_events DROP CONSTRAINT IF EXISTS poc_logistics_test_write_failure");
  if (store) {
    await db.delete(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.storeId, store.id));
    await db.delete(ordersTable).where(eq(ordersTable.storeId, store.id));
    await db.delete(productsTable).where(eq(productsTable.storeId, store.id));
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
  await pool.end();
});

test("explicit owner, gateway, store and approved source are checked before carrier access", async () => {
  assert.equal((await sync({ owner: false })).status, 401);
  assert.equal((await sync({ owner: "user_other" })).status, 403);
  assert.equal((await sync({ gateway: false })).status, 403);
  assert.equal((await request("POST", `/stores/${store.id + 1}/orders/${order.id}/logistics/familymart`, { body: { trackingCode: "90000000001" } })).status, 403);
  assert.equal((await sync({}, 2147483647)).status, 404);
  assert.equal((await sync({ body: { trackingCode: "90000000002", endpoint: "https://unexpected.example" } })).status, 422);
  delete process.env.PIKA_POC_FAMILYMART_TRACKING_CODE;
  try { assert.equal((await sync()).body.errorCode, "LOGISTICS_TEST_SOURCE_REQUIRED"); }
  finally { process.env.PIKA_POC_FAMILYMART_TRACKING_CODE = "90000000001"; }
  assert.equal(providerCalls, 0);
  assert.equal((await db.select().from(shipmentTrackingsTable).where(eq(shipmentTrackingsTable.orderId, order.id))).length, 0);
});

test("normal API → real adapter with fixture transport → worker → PG → owner and token DTO", async () => {
  const result = await sync();
  assert.equal(result.status, 200, JSON.stringify(result.body));
  trackingId = result.body.trackingId;
  assert.equal(result.body.insertedEventCount, 2);
  assert.equal(providerCalls, 1);
  const row = await saved();
  assert.equal(row.latestEventStatus, "arrived_store");
  assert.equal(row.latestEventAt.toISOString(), "2026-09-26T02:00:00.000Z");
  const ownerList = await request("GET", `/stores/${store.id}/orders`);
  assert.equal(ownerList.body.find((o) => o.id === order.id).shipmentTracking.id, trackingId);
  const read = await customer();
  assert.equal(read.body.latestTrackingStatus, row.latestEventStatus);
  assert.equal(read.body.latestTrackingTime, row.latestEventAt.toISOString());
  assert.equal(read.body.orderTotal, 200, "100 × 2 + 0 shipping = 200 remains unchanged");
  for (const key of ["checkError", "rawData", "internalNote", "buyerPhone", "buyerName"]) assert.equal(key in read.body, false);
  assert.ok(!JSON.stringify(await events()).includes("DO_NOT_PERSIST"));
});

test("duplicate updates produce no duplicate events or business effects; no other order can claim the parcel", async () => {
  const result = await sync();
  assert.equal(result.body.insertedEventCount, 0);
  assert.equal((await events()).length, 2);
  assert.equal((await sync({}, otherOrder.id)).status, 409);
  assert.equal(providerCalls, 2);
  const [unchanged] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
  assert.equal(unchanged.status, order.status);
  assert.equal(unchanged.shippingStatus, order.shippingStatus);
  assert.equal(unchanged.totalPrice, "200.00");
});

test("older and undated events do not overwrite the saved newest status", async () => {
  fixture = { ErrorCode: "000", List: [event("訂單成立未寄件", "2026/09/25 10:00")] };
  assert.equal((await sync()).status, 200);
  fixture = { ErrorCode: "000", List: [event("訂單成立未寄件", null)] };
  assert.equal((await sync()).status, 200);
  assert.equal((await saved()).latestEventStatus, "arrived_store");
  assert.equal((await customer()).body.latestTrackingTime, "2026-09-26T02:00:00.000Z");
});

test("unknown newer carrier status remains unknown, never delivered", async () => {
  fixture = { ErrorCode: "000", List: [event("合成未知節點", "2026/09/26 11:00")] };
  assert.equal((await sync()).status, 200);
  assert.equal((await saved()).latestEventStatus, "unknown");
  assert.equal((await customer()).body.latestTrackingStatus, "unknown");
});

test("not-found and timeout preserve prior evidence and expose no raw provider error", async () => {
  fixture = { ErrorCode: "999", ErrorMessage: "SECRET_FROM_PROVIDER", List: [] };
  assert.equal((await sync()).body.errorCode, "NO_RESULT");
  assert.equal((await saved()).latestEventStatus, "unknown");
  assert.equal((await customer()).body.latestTrackingStatus, "exception");
  assert.ok(!(await saved()).checkError.includes("SECRET_FROM_PROVIDER"));
  providerFailure = Object.assign(new Error("SECRET_FROM_PROVIDER"), { name: "TimeoutError" });
  const before = providerCalls;
  try { assert.equal((await sync()).body.errorCode, "TIMEOUT"); }
  finally { providerFailure = null; }
  assert.equal(providerCalls, before + 1, "no automatic carrier retries");
});

test("event persistence failure rolls back the snapshot and records failed run without re-query", async () => {
  const before = await saved();
  fixture = { ErrorCode: "000", List: [event("POC_TEST_SAVE_FAILURE", "2026/09/26 12:00")] };
  await pool.query("ALTER TABLE shipment_tracking_events ADD CONSTRAINT poc_logistics_test_write_failure CHECK (event_description <> 'POC_TEST_SAVE_FAILURE') NOT VALID");
  const calls = providerCalls;
  try {
    const response = await sync();
    assert.equal(response.status, 502);
    assert.equal(response.body.errorCode, "SAVE_FAILED");
    const [run] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, response.body.runId));
    assert.equal(run.status, "failed");
    assert.equal(run.errorSummary, "SAVE_FAILEDx1");
    assert.equal((await saved()).latestEventAt.toISOString(), before.latestEventAt.toISOString());
    assert.equal(providerCalls, calls + 1);
  } finally {
    await pool.query("ALTER TABLE shipment_tracking_events DROP CONSTRAINT poc_logistics_test_write_failure");
  }
});

test("successful retry recovers failure; restarted API and repeat reads do not query carrier", async () => {
  fixture = { ErrorCode: "000", List: [event("取件完成", "2026/09/26 13:00")] };
  assert.equal((await sync()).status, 200);
  assert.equal((await saved()).checkError, null);
  const before = await customer();
  const calls = providerCalls;
  await new Promise((resolve) => server.close(resolve));
  await start();
  const afterRestart = await customer();
  assert.equal(afterRestart.body.latestTrackingStatus, "picked_up");
  assert.equal(afterRestart.body.latestTrackingTime, before.body.latestTrackingTime);
  assert.equal((await customer()).body.latestTrackingTime, before.body.latestTrackingTime);
  assert.equal(providerCalls, calls);
  assert.equal((await request("GET", "/orders/track/nonexistent-synthetic-token", { owner: false })).status, 404);
  assert.equal((await request("POST", `/stores/${store.id}/logistics/sync`, { body: {} })).status, 403,
    "POC still disallows bulk scans and background sync");
});
