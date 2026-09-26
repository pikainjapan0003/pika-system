import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_test_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-integration-gateway-key-32-characters";
// Only this Node test substitutes Clerk. The deployed entrypoint has no test-header auth.
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null, sessionClaims: { userId: req.headers["x-test-claim-user"] } }),
} });
const { db, pool, storesTable, productsTable, ordersTable } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let server, origin, store, decoy, otherProduct, product, orderToken, otherOrderToken;
const storeIds = [];
const fakeBuyer = { buyerName: "合成客人", buyerPhone: "0900000000", pickupMethod: "面交" };
const start = async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
};
async function request(method, path, { body, owner = false, gateway = true, headers = {} } = {}) {
  const response = await fetch(origin + path, { method, headers: {
    "content-type": "application/json",
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(owner ? { "x-test-clerk-user": process.env.PIKA_OWNER_CLERK_USER_ID } : {}), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  for (const name of ["decoy", "designated"]) {
    const [created] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
      name: `合成 ${name}`, slug: `poc-test-${name}-${randomUUID()}`,
      shippingCvsEnabled: false, shippingBlackCatEnabled: false, shippingPostOfficeEnabled: false,
    }).returning();
    storeIds.push(created.id);
    if (name === "decoy") decoy = created; else store = created;
  }
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [otherProduct] = await db.insert(productsTable).values({ storeId: decoy.id, name: "錯店假商品", price: "100.00", inventory: 10, shareToken: randomUUID() }).returning();
  otherOrderToken = randomUUID().replaceAll("-", "");
  await db.insert(ordersTable).values({ storeId: decoy.id, productId: otherProduct.id,
    productName: otherProduct.name, publicToken: otherOrderToken, ...fakeBuyer,
    quantity: 1, unitPrice: "100.00", totalPrice: "100.00" });
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

test("gateway rejects direct calls, unsupported side effects and absent configuration", async () => {
  assert.equal((await request("GET", "/me/store", { owner: true, gateway: false })).status, 403);
  for (const path of ["/stores", "/upload", "/internal/logistics/sync", "/cart/orders/extra"]) {
    assert.equal((await request("POST", path, { owner: true, body: {} })).status, 403);
  }
  const saved = process.env.PIKA_OWNER_STORE_ID;
  delete process.env.PIKA_OWNER_STORE_ID;
  try { assert.equal((await request("GET", "/poc/catalog")).status, 503); }
  finally { process.env.PIKA_OWNER_STORE_ID = saved; }
});

test("only explicitly designated Clerk subject can administer; claims/body cannot promote another login", async () => {
  assert.equal((await request("GET", "/me/store")).status, 401);
  assert.equal((await request("GET", "/me/store", { headers: { "x-test-clerk-user": "user_other", "x-test-claim-user": process.env.PIKA_OWNER_CLERK_USER_ID } })).status, 403);
  const me = await request("GET", "/me/store", { owner: true });
  assert.equal(me.status, 200);
  assert.equal(me.body.id, store.id, "must not choose the first store for this owner");
  assert.equal((await request("GET", `/stores/${decoy.id}/stats`, { owner: true })).status, 403);
  assert.equal((await request("GET", `/stores/${decoy.id}/products`, { owner: true })).status, 403);
});

test("owner creates and maintains a product using existing Express routes", async () => {
  const result = await request("POST", `/stores/${store.id}/products`, { owner: true, body: { name: "合成筆記本", price: 100, inventory: 3 } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  product = result.body;
  assert.equal((await request("PATCH", `/stores/${store.id}/products/${product.id}`, { owner: true, body: { description: "合成資料 POC" } })).status, 200);
  assert.equal((await request("PATCH", `/stores/${store.id}/products/${product.id}`, { body: { price: 1 } })).status, 401);
  const catalog = await request("GET", "/poc/catalog");
  assert.deepEqual(catalog.body.products.map(p => p.shareToken), [product.shareToken]);
});

test("guest order is saved in PostgreSQL: 100 x 2 + 0 shipping = 200; stock 3 - 2 = 1", async () => {
  assert.equal((await request("GET", `/p/${product.shareToken}`)).status, 200);
  const result = await request("POST", `/p/${product.shareToken}/orders`, { body: { ...fakeBuyer, quantity: 2 } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  orderToken = result.body.publicToken;
  assert.match(orderToken, /^[a-f0-9]{32}$/);
  const [saved] = await db.select().from(ordersTable).where(eq(ordersTable.publicToken, orderToken));
  assert.equal(saved.storeId, store.id);
  assert.equal(saved.totalPrice, "200.00");
  assert.equal(Number(saved.shippingFee), 0);
  assert.equal(saved.quantity, 2);
  assert.equal(saved.status, "pending");
  const [stock] = await db.select().from(productsTable).where(eq(productsTable.id, product.id));
  assert.equal(stock.inventory, 1);
});

test("restarted HTTP server reads persisted token order; unknown token fails; private fields stay hidden", async () => {
  await new Promise(resolve => server.close(resolve));
  await start();
  const tracked = await request("GET", `/orders/track/${orderToken}`);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.orderTotal, 200);
  for (const field of ["buyerPhone", "buyerName", "internalNote", "profitSnapshot", "recipientAddress"]) assert.equal(field in tracked.body, false);
  assert.equal((await request("GET", "/orders/track/unknown-synthetic-token")).status, 404);
  assert.equal((await request("GET", `/orders/track/${otherOrderToken}`)).status, 404);
  const received = await request("GET", `/stores/${store.id}/orders`, { owner: true });
  assert.equal(received.status, 200);
  assert.ok(received.body.some(order => order.publicToken === orderToken));
});

test("wrong-store products and mixed-store cart are rejected and all stock changes roll back", async () => {
  assert.equal((await request("GET", `/p/${otherProduct.shareToken}`)).status, 404);
  assert.equal((await request("POST", `/p/${otherProduct.shareToken}/orders`, { body: { ...fakeBuyer, quantity: 1 } })).status, 404);
  const countBefore = await pool.query("SELECT count(*) FROM orders WHERE store_id = $1", [store.id]);
  const mixed = await request("POST", "/cart/orders", { body: { ...fakeBuyer, items: [{ shareToken: product.shareToken, quantity: 1 }, { shareToken: otherProduct.shareToken, quantity: 1 }] } });
  assert.equal(mixed.status, 404);
  const [stock] = await db.select().from(productsTable).where(eq(productsTable.id, product.id));
  assert.equal(stock.inventory, 1);
  assert.deepEqual((await pool.query("SELECT count(*) FROM orders WHERE store_id = $1", [store.id])).rows, countBefore.rows);
});

test("same-store cart persists and cannot oversell the remaining unit", async () => {
  const countBefore = Number((await pool.query("SELECT count(*) FROM orders WHERE store_id = $1", [store.id])).rows[0].count);
  const responses = await Promise.all([1, 2].map(() => request("POST", "/cart/orders", { body: { ...fakeBuyer, items: [{ shareToken: product.shareToken, quantity: 1 }] } })));
  // Existing public.ts contract uses 409 for stock conflicts, including before this POC.
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const countAfter = Number((await pool.query("SELECT count(*) FROM orders WHERE store_id = $1", [store.id])).rows[0].count);
  assert.equal(countAfter - countBefore, 1);
  const [stock] = await db.select().from(productsTable).where(eq(productsTable.id, product.id));
  assert.equal(stock.inventory, 0);
  const success = responses.find(r => r.status === 201);
  assert.equal(success.body.totalPrice, 100);
  assert.equal((await request("GET", `/orders/track/${success.body.publicToken}`)).body.orderTotal, 100);
});

test("changed database ownership fails closed even for the designated login", async () => {
  await db.update(storesTable).set({ merchantId: "user_other" }).where(eq(storesTable.id, store.id));
  try { assert.equal((await request("GET", "/me/store", { owner: true })).status, 403); }
  finally { await db.update(storesTable).set({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID }).where(eq(storesTable.id, store.id)); }
});

test("all migration-only protection triggers are present in the real POC database", async () => {
  const { rows } = await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE 'invoice_ocr_%' OR tgname LIKE 'store_credit_transactions_%')");
  assert.equal(rows.length, 6);
});
