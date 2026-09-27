import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db");
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_PUBLIC_SHOP = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_public_launch_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-public-launch-gateway-32-characters";
process.env.INVOICE_OCR_ENABLED = "true";
process.env.INVOICE_OCR_TEST_MODE = "true";
process.env.INVOICE_OCR_ALLOWED_CLERK_USER_IDS = "user_public_launch_owner";
process.env.LOG_LEVEL = "silent";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable, productsTable, ordersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let store, product, order, server, origin;
async function request(method, path, owner = true, body) {
  const response = await fetch(origin + path, { method, headers: {
    "content-type": "application/json", "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET,
    ...(owner ? { "x-test-clerk-user": owner === true ? process.env.PIKA_OWNER_CLERK_USER_ID : owner } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  // Local empty Agent tables only. Business reads below run after real DROP.
  for (const table of ["agent_run_logs", "seller_agent_tokens", "seller_agent_settings"]) {
    const exists = (await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name;
    if (exists) assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), 0);
  }
  await pool.query(await readFile(new URL("../../../../lib/db/migrations/0044_remove_seller_agent.sql", import.meta.url), "utf8"));
  [store] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
    name: "PUBLIC-LAUNCH 合成店", slug: `public-launch-${randomUUID()}` }).returning();
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [product] = await db.insert(productsTable).values({ storeId: store.id, name: "PUBLIC-LAUNCH 合成商品",
    price: "100.00", inventory: 5, shareToken: randomUUID() }).returning();
  [order] = await db.insert(ordersTable).values({ storeId: store.id, productId: product.id,
    productName: product.name, buyerName: "合成客人", buyerPhone: "0900000000", pickupMethod: "全家",
    quantity: 2, unitPrice: "100.00", totalPrice: "200.00", shippingFee: "0.00",
    publicToken: randomUUID().replaceAll("-", ""), internalNote: "DO_NOT_PUBLISH" }).returning();
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (store) {
    await db.delete(ordersTable).where(eq(ordersTable.storeId, store.id));
    await db.delete(productsTable).where(eq(productsTable.storeId, store.id));
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
  await pool.end();
});

test("public visitors and other Clerk users cannot read valid synthetic tokens or modify test orders", async () => {
  for (const owner of [false, "user_not_owner"]) {
    for (const [method, path, body] of [
      ["GET", "/poc/catalog"], ["GET", `/p/${product.shareToken}`],
      ["GET", `/orders/track/${order.publicToken}`],
      ["PATCH", `/orders/track/${order.publicToken}/payment-last5`, { paymentLast5: "12345" }],
      ["POST", `/p/${product.shareToken}/orders`, {}], ["POST", "/cart/orders", {}],
      ["GET", `/poc/images/products/${store.id}/1234567890123-0000000000000000.png`],
      ["GET", "/cvs/stores?provider=familymart"],
    ]) {
      const result = await request(method, path, owner, body);
      assert.equal(result.status, 404, `${method} ${path}`);
      assert.equal(result.body.error, "目前沒有可公開的商品或訂單");
    }
  }
  assert.equal((await db.select().from(ordersTable).where(eq(ordersTable.storeId, store.id))).length, 1);
});

test("designated owner retains product, order, customer, cost, OCR and logistics reads with Agent tables absent", async () => {
  for (const path of ["/me/store", `/stores/${store.id}/products`, `/stores/${store.id}/orders`,
    `/stores/${store.id}/customers`, `/stores/${store.id}/orders/profit-summary`,
    `/stores/${store.id}/invoice-ocr/test-cases`, `/stores/${store.id}/logistics/exceptions`,
    `/stores/${store.id}/logistics/import-batches`, `/stores/${store.id}/logistics/sync/status`]) {
    const result = await request("GET", path);
    assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body)}`);
  }
  assert.equal((await request("GET", `/p/${product.shareToken}`)).body.id, product.id);
  const result = await request("GET", `/orders/track/${order.publicToken}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.orderTotal, 200, "100 × 2 = 200");
  assert.equal("internalNote" in result.body, false);
  for (const table of ["agent_run_logs", "seller_agent_tokens", "seller_agent_settings"]) {
    assert.equal((await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name, null);
  }
});

test("normal management still rejects anonymous, non-owner and wrong-store access", async () => {
  for (const path of [`/stores/${store.id}/products`, `/stores/${store.id}/orders`,
    `/stores/${store.id}/customers`, `/stores/${store.id}/invoice-ocr/test-cases`, `/stores/${store.id}/audit-logs`]) {
    assert.equal((await request("GET", path, false)).status, 401);
    assert.equal((await request("GET", path, "user_not_owner")).status, 403);
  }
  assert.equal((await request("POST", `/stores/${store.id}/products/image`, false, {})).status, 401);
  assert.equal((await request("GET", `/stores/${store.id + 1}/products`)).status, 403);
});

test("Seller Agent routes and store creation are removed, not just denied by POC allowlist", async () => {
  process.env.PIKA_PRIVATE_POC = "false";
  process.env.PIKA_PUBLIC_SHOP = "false";
  try {
    for (const [method, path] of [
      ["GET", `/stores/${store.id}/agent/settings`], ["PATCH", `/stores/${store.id}/agent/settings`],
      ["GET", "/internal/agent/orders/tracking-jobs"], ["POST", "/internal/agent/shipment-events"],
      ["PATCH", "/internal/agent/shipment-status"], ["POST", "/internal/agent/run-log"], ["POST", "/stores"],
    ]) assert.equal((await request(method, path, true, method === "GET" ? undefined : {})).status, 404, path);
  } finally { process.env.PIKA_PRIVATE_POC = "true"; process.env.PIKA_PUBLIC_SHOP = "true"; }
});

test("publication does not enable bulk shipment jobs, notifications or onboarding", async () => {
  for (const path of ["/stores", `/stores/${store.id}/logistics/sync`, "/internal/logistics/sync"]) {
    assert.equal((await request("POST", path, true, {})).status, 403);
  }
});
