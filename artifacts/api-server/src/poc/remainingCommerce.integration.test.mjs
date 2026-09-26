import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";
import { commerceScenario } from "./remainingCommerce.scenario.mjs";
import { fulfillmentScenario } from "./remainingFulfillment.scenario.mjs";
import { verifyRemainingDatabase } from "./remainingDatabase.verify.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db");
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_remaining_synthetic_owner";
process.env.PIKA_POC_PROXY_SECRET = "remaining-local-synthetic-gateway-32";
process.env.LOG_LEVEL = "silent";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_q, _s, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable } = await import("@workspace/db");
const { default: app } = await import("../app.ts");
let server, origin, storeId, proof;
before(async () => {
  const [store] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
    slug: `remaining-${randomUUID()}`, name: "合成剩餘功能驗證", purchaseExchangeRate: "0.2" }).returning();
  storeId = store.id; process.env.PIKA_OWNER_STORE_ID = String(storeId);
  for (const [provider, code, name] of [["seven", "901001", "7-11 合成測試店"], ["family", "901002", "全家合成測試店"]]) {
    await pool.query(`INSERT INTO cvs_stores (provider,store_id,store_name,store_address,city,district,source)
      VALUES ($1,$2,$3,'合成地址，不可寄件','合成市','測試區','poc_synthetic_remaining')
      ON CONFLICT (provider,store_id) DO NOTHING`, [provider, code, name]);
  }
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { if (server) await new Promise(r => server.close(r)); await pool.end(); });
async function request(method, path, { body, headers = {}, owner = true } = {}) {
  const form = body instanceof FormData;
  const r = await fetch(origin + path, { method, headers: { ...(form ? {} : { "content-type": "application/json" }),
    "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET,
    ...(owner ? { "x-test-clerk-user": owner === true ? process.env.PIKA_OWNER_CLERK_USER_ID : owner } : {}), ...headers },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  const bytes = Buffer.from(await r.arrayBuffer());
  const text = bytes.toString("utf8");
  return { status: r.status, bytes, text, headers: Object.fromEntries(r.headers),
    body: r.status === 204 ? null : r.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
}
test("private routes preserve owner and excluded operations", async () => {
  for (const [method, path] of [["POST", `/stores/${storeId}/orders`], ["POST", `/stores/${storeId}/categories`],
    ["GET", `/stores/${storeId}/audit-logs`], ["GET", `/stores/${storeId}/logistics/exceptions`]]) {
    assert.equal((await request(method, path, { owner: false, body: method === "POST" ? {} : undefined })).status, 401);
    assert.equal((await request(method, path, { owner: "user_other", body: method === "POST" ? {} : undefined })).status, 403);
  }
  for (const path of ["/stores", "/cvs/711/import-from-emap", `/stores/${storeId}/logistics/sync`,
    `/stores/${storeId}/logistics/sync/manual-provider/commit`, "/internal/logistics/sync"]) {
    assert.equal((await request("POST", path, { body: {} })).status, 403);
  }
});
test("categories, four prices, manual payment, credit retry/refund and picking persist in real PG", async () => {
  proof = await commerceScenario(request, storeId);
  const result = await pool.query("SELECT status, credit_spent, payable_after_credit FROM orders WHERE id = $1", [proof.creditOrderId]);
  assert.equal(result.rows[0].status, "cancelled");
  assert.equal(Number(result.rows[0].credit_spent), 30);
  const ledger = await pool.query("SELECT type, count(*)::int n FROM store_credit_transactions WHERE related_order_id = $1 GROUP BY type", [proof.creditOrderId]);
  assert.deepEqual(Object.fromEntries(ledger.rows.map(r => [r.type, r.n])), { reversal: 1, spend: 1 });
});
test("7-11 and FamilyMart store snapshots, XLSX imports, history, exceptions and real-template exports", async () => {
  assert.ok(proof, "commerce fixture must succeed first");
  const result = await fulfillmentScenario(request, storeId, proof.productId);
  for (const item of result.providers) {
    const { rows: [row] } = await pool.query("SELECT count(*)::int n FROM shipment_trackings WHERE order_id = $1", [item.orderId]);
    assert.equal(row.n, 1, "repeated spreadsheet import preserves a single tracking");
  }
  const receipt = await verifyRemainingDatabase(pool, storeId, proof.tag);
  assert.equal(receipt.logisticsSource, "synthetic_saved_fixture");
  const orders = (await request("GET", `/stores/${storeId}/orders`)).body;
  for (const [index, item] of result.providers.entries()) {
    const order = orders.find(o => o.id === item.orderId);
    const publicOrder = (await request("GET", `/orders/track/${order.publicToken}`, { owner: false })).body;
    assert.equal(publicOrder.latestTrackingStatus, index === 0 ? "arrived_store" : "exception");
    for (const field of ["checkError", "rawData", "internalNote"]) assert.equal(field in publicOrder, false);
  }
});
