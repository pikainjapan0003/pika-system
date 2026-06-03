/**
 * Integration tests for orders routes (Step 4B)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    @clerk/express is mocked — getAuth reads x-test-user-id header
 * DB:      Real DB via DATABASE_URL (test data created and cleaned up per run)
 * Runner:  tsx (TypeScript strip-types loader) for importing .ts routes
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_MERCHANT_ID = 'test_merchant_step4b';

// ─────────────────────────────────────────────────────────────
// 1. Mock @clerk/express BEFORE any module that depends on it loads.
//    getAuth reads x-test-user-id header; absent = unauthenticated.
// ─────────────────────────────────────────────────────────────
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => {
      const userId = req.headers?.['x-test-user-id'] ?? null;
      return {
        userId: userId || null,
        sessionClaims: userId ? { userId } : undefined,
      };
    },
    clerkMiddleware: () => (_req, _res, next) => next(),
  },
});

// ─────────────────────────────────────────────────────────────
// 2. Dynamic imports — resolved AFTER mock is registered
// ─────────────────────────────────────────────────────────────
const { default: express }          = await import('express');
const { db, storesTable, productsTable, ordersTable, pool } = await import('@workspace/db');
const { eq }                        = await import('drizzle-orm');
const { default: ordersRouter }     = await import('./orders.ts');

// ─────────────────────────────────────────────────────────────
// 3. Minimal test Express app (no clerkMiddleware, no Clerk keys needed)
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', ordersRouter);

// ─────────────────────────────────────────────────────────────
// 4. Shared test state
// ─────────────────────────────────────────────────────────────
let server;
let baseUrl;
let testStoreId;
let testProductId;

// ─────────────────────────────────────────────────────────────
// 5. Global setup / teardown
// ─────────────────────────────────────────────────────────────
before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}/api`;

  const [store] = await db
    .insert(storesTable)
    .values({ merchantId: TEST_MERCHANT_ID, name: '__test_store__', slug: `test-store-${Date.now()}` })
    .returning();
  testStoreId = store.id;

  const [product] = await db
    .insert(productsTable)
    .values({
      storeId: testStoreId,
      name: '__test_product__',
      price: '100.00',
      shareToken: `test-share-${Date.now()}`,
      isActive: true,
    })
    .returning();
  testProductId = product.id;
});

after(async () => {
  if (testStoreId) {
    await db.delete(ordersTable).where(eq(ordersTable.storeId, testStoreId));
    await db.delete(productsTable).where(eq(productsTable.storeId, testStoreId));
    await db.delete(storesTable).where(eq(storesTable.id, testStoreId));
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// ─────────────────────────────────────────────────────────────
// 6. HTTP helper
// ─────────────────────────────────────────────────────────────
async function req(method, path, body, userId = TEST_MERCHANT_ID) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-test-user-id'] = userId;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

// ─────────────────────────────────────────────────────────────
// 7. POST /stores/:storeId/orders
// ─────────────────────────────────────────────────────────────
describe('POST /stores/:storeId/orders', () => {
  test('201 — creates order, snapshots price, generates publicToken', async () => {
    const { status, data } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: testProductId,
      buyerName: 'Test Buyer',
      buyerPhone: '0912345678',
      pickupMethod: 'pickup',
      quantity: 2,
    });
    assert.strictEqual(status, 201);
    assert.ok(data.id, 'should have id');
    assert.strictEqual(data.buyerName, 'Test Buyer');
    assert.strictEqual(data.buyerPhone, '0912345678');
    assert.strictEqual(data.pickupMethod, 'pickup');
    assert.strictEqual(data.quantity, 2);
    assert.strictEqual(data.unitPrice, 100, 'unitPrice snapshots product price');
    assert.strictEqual(data.totalPrice, 200, 'totalPrice = unitPrice * quantity');
    assert.strictEqual(data.status, 'pending');
    assert.ok(data.publicToken && data.publicToken.length > 0, 'publicToken present');
    assert.strictEqual(data.productName, '__test_product__');
  });

  test('201 — GET /stores/:storeId/orders lists new order', async () => {
    const { status, data } = await req('GET', `/stores/${testStoreId}/orders`);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data), 'should return array');
    assert.ok(data.length >= 1, 'should have at least one order');
    assert.ok(data.some((o) => o.buyerName === 'Test Buyer'), 'created order should appear');
  });

  test('400 — missing buyerName', async () => {
    const { status } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: testProductId,
      buyerPhone: '0912345678',
      pickupMethod: 'pickup',
      quantity: 1,
    });
    assert.strictEqual(status, 400);
  });

  test('400 — missing buyerPhone', async () => {
    const { status } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: testProductId,
      buyerName: 'Test',
      pickupMethod: 'pickup',
      quantity: 1,
    });
    assert.strictEqual(status, 400);
  });

  test('400 — quantity = 0', async () => {
    const { status } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: testProductId,
      buyerName: 'Test',
      buyerPhone: '0912345678',
      pickupMethod: 'pickup',
      quantity: 0,
    });
    assert.strictEqual(status, 400);
  });

  test('404 — productId does not belong to store', async () => {
    const { status } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: 999999999,
      buyerName: 'Test',
      buyerPhone: '0912345678',
      pickupMethod: 'pickup',
      quantity: 1,
    });
    assert.strictEqual(status, 404);
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('POST', `/stores/${testStoreId}/orders`, {
      productId: testProductId,
      buyerName: 'Test',
      buyerPhone: '0912345678',
      pickupMethod: 'pickup',
      quantity: 1,
    }, null);
    assert.strictEqual(status, 401);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. PATCH /orders/:orderId
// ─────────────────────────────────────────────────────────────
describe('PATCH /orders/:orderId', () => {
  let patchOrderId;

  before(async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: `tok-patch-${Date.now()}`,
        buyerName: 'Original Buyer',
        buyerPhone: '0900000000',
        pickupMethod: 'pickup',
        quantity: 1,
        unitPrice: '100.00',
        totalPrice: '100.00',
        status: 'pending',
        specValues: {},
      })
      .returning();
    patchOrderId = order.id;
  });

  test('200 — updates buyerName', async () => {
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, {
      buyerName: 'Updated Buyer',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.buyerName, 'Updated Buyer');
  });

  test('200 — updates buyerPhone', async () => {
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, {
      buyerPhone: '0988888888',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.buyerPhone, '0988888888');
  });

  test('200 — quantity change recalculates totalPrice, unitPrice unchanged', async () => {
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, {
      quantity: 3,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.quantity, 3);
    assert.strictEqual(data.totalPrice, 300, 'totalPrice = unitPrice * new quantity');
    assert.strictEqual(data.unitPrice, 100, 'unitPrice must not change');
  });

  test('200 — empty body returns order unchanged', async () => {
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, {});
    assert.strictEqual(status, 200);
    assert.ok(data.id, 'should return order');
  });

  test('200 — extra forbidden fields (status, totalPrice) are ignored', async () => {
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, {
      buyerName: 'Legit Name',
      status: 'completed',
      totalPrice: 9999,
      unitPrice: 9999,
      productId: 9999,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.buyerName, 'Legit Name');
    assert.strictEqual(data.status, 'pending', 'status must not be changed via PATCH body');
    assert.notStrictEqual(data.totalPrice, 9999, 'totalPrice must not be set by caller');
    assert.notStrictEqual(data.unitPrice, 9999, 'unitPrice must not be set by caller');
    assert.strictEqual(data.productId, testProductId, 'productId must not change');
  });

  test('400 — quantity = 0', async () => {
    const { status } = await req('PATCH', `/orders/${patchOrderId}`, { quantity: 0 });
    assert.strictEqual(status, 400);
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('PATCH', `/orders/${patchOrderId}`, { buyerName: 'x' }, null);
    assert.strictEqual(status, 401);
  });

  test('403 — wrong merchant cannot edit order', async () => {
    const { status } = await req('PATCH', `/orders/${patchOrderId}`, { buyerName: 'x' }, 'other_merchant_id');
    assert.strictEqual(status, 403);
  });

  test('422 — completed order is immutable', async () => {
    await db.update(ordersTable).set({ status: 'completed' }).where(eq(ordersTable.id, patchOrderId));
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, { buyerName: 'x' });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — cancelled order is immutable', async () => {
    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, patchOrderId));
    const { status, data } = await req('PATCH', `/orders/${patchOrderId}`, { buyerName: 'x' });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });
});

// ─────────────────────────────────────────────────────────────
// 9. Regression: existing routes still work
// ─────────────────────────────────────────────────────────────
describe('Regression: existing routes unbroken', () => {
  test('PATCH /orders/:orderId/status still works', async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: `tok-reg-${Date.now()}`,
        buyerName: 'Regression Buyer',
        buyerPhone: '0911111111',
        pickupMethod: 'pickup',
        quantity: 1,
        unitPrice: '100.00',
        totalPrice: '100.00',
        status: 'pending',
        specValues: {},
      })
      .returning();

    const { status, data } = await req('PATCH', `/orders/${order.id}/status`, {
      status: 'awaiting_payment',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'awaiting_payment');
  });

  test('GET /stores/:storeId/orders/export returns CSV', async () => {
    const { status, data } = await req('GET', `/stores/${testStoreId}/orders/export`);
    assert.strictEqual(status, 200);
    assert.ok(typeof data === 'string', 'export should return text/csv as string');
    assert.ok(data.includes('訂單編號'), 'CSV should have header row');
  });
});
