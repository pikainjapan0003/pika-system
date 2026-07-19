/**
 * Step 7N-I8B — manual tracking seed tests.
 *
 * 驗證 PATCH /orders/:orderId 手動填郵局 / 黑貓貨號時 seed shipment_trackings：
 * 建 row、idempotent、換碼 retire 舊 row、711 / familymart 不建。
 * Pattern follows logisticsSyncManualProvider.route.test.mjs：node:test、
 * Clerk mocked via x-test-user-id header、real dev DB、store cascade 清資料。
 * 不打外部物流查詢、不寫 events / snapshot。
 *
 * Run via: node scripts/step7/test-manual-provider-tracking-seed.mjs
 */

import { mock, describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req) => {
      const userId = req.headers?.["x-test-user-id"] ?? null;
      return {
        userId: userId || null,
        sessionClaims: userId ? { userId } : undefined,
      };
    },
    clerkMiddleware: () => (_req, _res, next) => next(),
  },
});

const { default: express } = await import("express");
const { pool } = await import("@workspace/db");
const { default: ordersRouter } = await import(
  path.join(ROOT, "artifacts/api-server/src/routes/orders.ts")
);

const app = express();
app.use(express.json());
app.use("/api", ordersRouter);

const TEST_USER = "tracking-seed-test-user";
const CODE_A = "97300922002170839001";
const CODE_B = "97300922002170839002";
const TCAT_CODE = "135063214099";

let server, baseUrl, storeId, productId;

async function makeOrder() {
  const order = await pool.query(
    `INSERT INTO orders (product_id, store_id, public_token, buyer_name, buyer_phone, pickup_method, unit_price, total_price)
     VALUES ($1, $2, 'seed-' || floor(random()*1e9), 'SEED-TEST', '0900000000', 'home_delivery', '100', '100') RETURNING id`,
    [productId, storeId],
  );
  return order.rows[0].id;
}

const patchOrder = (orderId, body) =>
  fetch(`${baseUrl}/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": TEST_USER,
    },
    body: JSON.stringify(body),
  });

const activeRows = async (orderId) =>
  (
    await pool.query(
      `SELECT id, tracking_code, tracking_provider, tracking_status, source_type, is_active
       FROM shipment_trackings WHERE order_id = $1 AND is_active = true`,
      [orderId],
    )
  ).rows;

const allRows = async (orderId) =>
  (
    await pool.query(
      `SELECT id, is_active, tracking_status FROM shipment_trackings WHERE order_id = $1`,
      [orderId],
    )
  ).rows;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}/api`;

  const store = await pool.query(
    `INSERT INTO stores (merchant_id, name, slug) VALUES ($1, 'seed-test', 'seed-test-' || floor(random()*1e9)) RETURNING id`,
    [TEST_USER],
  );
  storeId = store.rows[0].id;
  const product = await pool.query(
    `INSERT INTO products (store_id, name, price, share_token) VALUES ($1, 'seed-product', 100, 'seed-' || floor(random()*1e9)) RETURNING id`,
    [storeId],
  );
  productId = product.rows[0].id;
});

after(async () => {
  await pool.query(`DELETE FROM stores WHERE id = $1`, [storeId]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

describe("PATCH manual tracking seed — postoffice / tcat", () => {
  test("postoffice：建立 active pending manual row，不寫 events", async () => {
    const orderId = await makeOrder();
    const res = await patchOrder(orderId, {
      trackingCode: CODE_A,
      trackingProvider: "postoffice",
    });
    assert.equal(res.status, 200);

    const rows = await activeRows(orderId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tracking_provider, "postoffice");
    assert.equal(rows[0].tracking_code, CODE_A);
    assert.equal(rows[0].tracking_status, "pending");
    assert.equal(rows[0].source_type, "manual");

    const events = await pool.query(
      `SELECT count(*)::int AS c FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
      [rows[0].id],
    );
    assert.equal(events.rows[0].c, 0);
  });

  test("idempotent：同 provider + 同碼重複 PATCH 不重複 insert", async () => {
    const orderId = await makeOrder();
    await patchOrder(orderId, {
      trackingCode: TCAT_CODE,
      trackingProvider: "tcat",
    });
    const res = await patchOrder(orderId, {
      trackingCode: TCAT_CODE,
      trackingProvider: "tcat",
    });
    assert.equal(res.status, 200);

    const rows = await allRows(orderId);
    assert.equal(rows.length, 1);
  });

  test("換碼：舊 active row retire，新 row 建立，同時只有一筆 active", async () => {
    const orderId = await makeOrder();
    await patchOrder(orderId, {
      trackingCode: CODE_B,
      trackingProvider: "postoffice",
    });
    const res = await patchOrder(orderId, {
      trackingCode: "97300922002170839003",
      trackingProvider: "postoffice",
    });
    assert.equal(res.status, 200);

    const all = await allRows(orderId);
    assert.equal(all.length, 2);
    const active = await activeRows(orderId);
    assert.equal(active.length, 1);
    assert.equal(active[0].tracking_code, "97300922002170839003");
    const retired = all.find((r) => !r.is_active);
    assert.equal(retired.tracking_status, "inactive");
  });

  test("tcat：建 row", async () => {
    const orderId = await makeOrder();
    await patchOrder(orderId, {
      trackingCode: "135063214098",
      trackingProvider: "tcat",
    });
    const rows = await activeRows(orderId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tracking_provider, "tcat");
  });
});

describe("PATCH manual tracking seed — out of scope providers", () => {
  test("711：不建 row", async () => {
    const orderId = await makeOrder();
    const res = await patchOrder(orderId, {
      trackingCode: "C55282156299",
      trackingProvider: "711",
    });
    assert.equal(res.status, 200);
    assert.equal((await allRows(orderId)).length, 0);
  });

  test("familymart：不建 row（避免影響 scheduled sync）", async () => {
    const orderId = await makeOrder();
    const res = await patchOrder(orderId, {
      trackingCode: "F1234567890",
      trackingProvider: "familymart",
    });
    assert.equal(res.status, 200);
    assert.equal((await allRows(orderId)).length, 0);
  });

  test("空 trackingCode：不建 row", async () => {
    const orderId = await makeOrder();
    const res = await patchOrder(orderId, {
      trackingCode: "",
      trackingProvider: "postoffice",
    });
    assert.equal(res.status, 200);
    assert.equal((await allRows(orderId)).length, 0);
  });
});
