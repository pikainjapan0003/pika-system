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
const { default: publicRouter }     = await import('./public.ts');

// ─────────────────────────────────────────────────────────────
// 3. Minimal test Express app (no clerkMiddleware, no Clerk keys needed)
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', ordersRouter);
app.use('/api', publicRouter);

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

async function rawFetch(method, path, body, userId = TEST_MERCHANT_ID) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-test-user-id'] = userId;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
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

// ─────────────────────────────────────────────────────────────
// 10. Step 5C: payment / logistics fields on PATCH
// ─────────────────────────────────────────────────────────────
describe('Step 5C: payment / logistics fields', () => {
  let step5OrderId;

  before(async () => {
    const [order] = await db
      .insert(ordersTable)
      .values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: `tok-step5-${Date.now()}`,
        buyerName: 'Step5 Buyer',
        buyerPhone: '0933333333',
        pickupMethod: 'pickup',
        quantity: 2,
        unitPrice: '100.00',
        shippingFee: '60.00',
        totalPrice: '200.00',
        status: 'pending',
        specValues: {},
      })
      .returning();
    step5OrderId = order.id;
  });

  // ── orderTotal / remainingAmount computed fields ──────────
  test('GET /stores/:storeId/orders includes orderTotal and remainingAmount', async () => {
    const { status, data } = await req('GET', `/stores/${testStoreId}/orders`);
    assert.strictEqual(status, 200);
    const order = data.find((o) => o.id === step5OrderId);
    assert.ok(order, 'created order should appear in list');
    assert.strictEqual(order.orderTotal, 260, 'orderTotal = totalPrice(200) + shippingFee(60)');
    assert.strictEqual(order.remainingAmount, 260, 'remainingAmount = orderTotal when paidAmount is null');
    assert.strictEqual(order.paidAmount, null, 'paidAmount should be null initially');
    assert.strictEqual(order.paymentStatus, 'unpaid', 'paymentStatus defaults to unpaid');
    assert.strictEqual(order.shippingStatus, 'not_shipped', 'shippingStatus defaults to not_shipped');
  });

  // ── PATCH: update payment fields ─────────────────────────
  test('200 — PATCH updates paymentMethod and paymentStatus', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paymentMethod: 'bank_transfer',
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.paymentMethod, 'bank_transfer');
    assert.strictEqual(data.paymentStatus, 'paid');
  });

  test('200 — PATCH updates paidAmount and computes remainingAmount', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paidAmount: 150,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.paidAmount, 150);
    assert.strictEqual(data.orderTotal, 260);
    assert.strictEqual(data.remainingAmount, 110, 'remainingAmount = 260 - 150');
  });

  test('200 — PATCH sets paidAmount to null clears it', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paidAmount: null,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.paidAmount, null);
    assert.strictEqual(data.remainingAmount, data.orderTotal, 'remainingAmount = orderTotal when paidAmount is null');
  });

  // ── PATCH: update shipping / logistics fields ─────────────
  test('200 — PATCH updates shippingStatus and trackingCode', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      shippingStatus: 'shipped',
      trackingCode: 'TEST12345',
      trackingProvider: '黑貓宅急便',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.shippingStatus, 'shipped');
    assert.strictEqual(data.trackingCode, 'TEST12345');
    assert.strictEqual(data.trackingProvider, '黑貓宅急便');
  });

  test('200 — PATCH updates shippingFee recalculates orderTotal', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      shippingFee: 100,
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.shippingFee, 100);
    assert.strictEqual(data.orderTotal, 300, 'orderTotal = totalPrice(200) + shippingFee(100)');
  });

  test('200 — PATCH updates storeCode and storeName (maps to cvsStoreId/cvsStoreName)', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      storeCode: '170268',
      storeName: '全家台北信義店',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.storeCode, '170268');
    assert.strictEqual(data.storeName, '全家台北信義店');
  });

  test('200 — PATCH updates internalNote', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      internalNote: '內部備註測試',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.internalNote, '內部備註測試');
  });

  // ── PATCH enum validation → 422 ───────────────────────────
  test('422 — invalid paymentMethod enum value', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paymentMethod: 'unpaid',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — invalid paymentStatus enum value', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paymentStatus: 'invalid_status',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — invalid shippingStatus enum value', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      shippingStatus: 'not_a_status',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — invalid shippingMethod enum value', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      shippingMethod: 'teleport',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  // ── PATCH negative amount → 422 ───────────────────────────
  test('422 — negative paidAmount', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      paidAmount: -1,
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — negative shippingFee', async () => {
    const { status, data } = await req('PATCH', `/orders/${step5OrderId}`, {
      shippingFee: -10,
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  // ── Existing validation still returns 400 (not 422) ──────
  test('400 — quantity=0 still returns 400 (not 422)', async () => {
    const { status } = await req('PATCH', `/orders/${step5OrderId}`, { quantity: 0 });
    assert.strictEqual(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// 11. Step 5C: public tracking API privacy guard
// ─────────────────────────────────────────────────────────────
describe('Step 5C: public tracking API — privacy guard', () => {
  let publicOrderToken;

  before(async () => {
    const token = `pub-tok-${Date.now()}`;
    await db
      .insert(ordersTable)
      .values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'Privacy Buyer',
        buyerPhone: '0944444444',
        pickupMethod: 'home_delivery',
        quantity: 1,
        unitPrice: '200.00',
        shippingFee: '80.00',
        totalPrice: '200.00',
        status: 'pending',
        specValues: {},
        // Fields that must NOT appear in public response
        internalNote: '這是內部備註，不能公開',
        paymentNote: '這是付款備註，不能公開',
        paidAmount: '50.00',
        recipientPhone: '0999999999',
        recipientAddress: '台北市信義區信義路五段7號',
        shippingNote: '這是物流備註，不能公開',
        // Fields that ARE safe to show
        shippingStatus: 'shipped',
        trackingCode: 'PUB-TRACK-123',
        trackingProvider: '黑貓宅急便',
      })
      .returning();
    publicOrderToken = token;
  });

  test('200 — public tracking returns safe shipping fields', async () => {
    const { status, data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.shippingStatus, 'shipped');
    assert.ok(typeof data.shippingStatusLabel === 'string', 'shippingStatusLabel should be present');
    assert.strictEqual(data.trackingCode, 'PUB-TRACK-123');
    assert.strictEqual(data.trackingProvider, '黑貓宅急便');
    assert.strictEqual(data.shippingFee, 80);
    assert.strictEqual(data.orderTotal, 280, 'orderTotal = totalPrice(200) + shippingFee(80)');
  });

  test('public tracking MUST NOT return internalNote', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.internalNote, undefined, 'internalNote MUST NOT be in public response');
  });

  test('public tracking MUST NOT return paymentNote', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.paymentNote, undefined, 'paymentNote MUST NOT be in public response');
  });

  test('public tracking MUST NOT return paidAmount', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.paidAmount, undefined, 'paidAmount MUST NOT be in public response');
  });

  test('public tracking MUST NOT return recipientPhone', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.recipientPhone, undefined, 'recipientPhone MUST NOT be in public response');
  });

  test('public tracking MUST NOT return recipientAddress', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.recipientAddress, undefined, 'recipientAddress MUST NOT be in public response');
  });

  test('public tracking MUST NOT return shippingNote', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.strictEqual(data.shippingNote, undefined, 'shippingNote MUST NOT be in public response');
  });

  test('publicToken is NOT trackingCode', async () => {
    const { data } = await req('GET', `/orders/track/${publicOrderToken}`, null, null);
    assert.ok(data.publicToken, 'publicToken should be present');
    assert.notStrictEqual(data.publicToken, data.trackingCode, 'publicToken must not equal trackingCode');
    assert.strictEqual(data.trackingCode, 'PUB-TRACK-123', 'trackingCode should be the logistics tracking number');
  });
});

// ─────────────────────────────────────────────────────────────
// 12. Step 5E: PATCH /orders/bulk
// ─────────────────────────────────────────────────────────────
describe('Step 5E: PATCH /orders/bulk', () => {
  let bulkOrder1Id;
  let bulkOrder2Id;
  let bulkCompletedId;
  let bulkCancelledId;

  before(async () => {
    const insertOrder = (token) =>
      db.insert(ordersTable).values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'Bulk Buyer',
        buyerPhone: '0955555555',
        pickupMethod: 'pickup',
        quantity: 1,
        unitPrice: '100.00',
        totalPrice: '100.00',
        status: 'pending',
        specValues: {},
      }).returning();

    const [o1] = await insertOrder(`bulk-tok-1-${Date.now()}`);
    const [o2] = await insertOrder(`bulk-tok-2-${Date.now()}`);
    const [oComp] = await insertOrder(`bulk-tok-c-${Date.now()}`);
    const [oCanc] = await insertOrder(`bulk-tok-x-${Date.now()}`);

    bulkOrder1Id = o1.id;
    bulkOrder2Id = o2.id;
    bulkCompletedId = oComp.id;
    bulkCancelledId = oCanc.id;

    await db.update(ordersTable).set({ status: 'completed' }).where(eq(ordersTable.id, bulkCompletedId));
    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, bulkCancelledId));
  });

  test('200 — bulk update paymentStatus for multiple orders', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id, bulkOrder2Id],
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.updatedCount, 2);
    assert.strictEqual(data.skippedCount, 0);
    assert.deepStrictEqual(data.skippedOrderIds, []);

    const { data: orders } = await req('GET', `/stores/${testStoreId}/orders`);
    const o1 = orders.find((o) => o.id === bulkOrder1Id);
    const o2 = orders.find((o) => o.id === bulkOrder2Id);
    assert.strictEqual(o1.paymentStatus, 'paid');
    assert.strictEqual(o2.paymentStatus, 'paid');
  });

  test('200 — bulk update shippingStatus for multiple orders', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id, bulkOrder2Id],
      shippingStatus: 'shipped',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.updatedCount, 2);

    const { data: orders } = await req('GET', `/stores/${testStoreId}/orders`);
    const o1 = orders.find((o) => o.id === bulkOrder1Id);
    assert.strictEqual(o1.shippingStatus, 'shipped');
  });

  test('200 — bulk update both paymentStatus and shippingStatus', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
      paymentStatus: 'unpaid',
      shippingStatus: 'not_shipped',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.updatedCount, 1);
  });

  test('200 — completed and cancelled orders are skipped', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id, bulkCompletedId, bulkCancelledId],
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.updatedCount, 1, 'only the pending order should be updated');
    assert.strictEqual(data.skippedCount, 2, 'completed and cancelled should be skipped');
    assert.ok(data.skippedOrderIds.includes(bulkCompletedId), 'completed order in skippedOrderIds');
    assert.ok(data.skippedOrderIds.includes(bulkCancelledId), 'cancelled order in skippedOrderIds');
  });

  test('200 — all skipped returns updatedCount 0', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkCompletedId, bulkCancelledId],
      shippingStatus: 'shipped',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.updatedCount, 0);
    assert.strictEqual(data.skippedCount, 2);
  });

  test('400 — empty orderIds array', async () => {
    const { status } = await req('PATCH', '/orders/bulk', {
      orderIds: [],
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 400);
  });

  test('400 — missing orderIds', async () => {
    const { status } = await req('PATCH', '/orders/bulk', {
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 400);
  });

  test('422 — neither paymentStatus nor shippingStatus provided', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — invalid paymentStatus enum', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
      paymentStatus: 'not_valid',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('422 — invalid shippingStatus enum', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
      shippingStatus: 'flying',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
      paymentStatus: 'paid',
    }, null);
    assert.strictEqual(status, 401);
  });

  test('403 — wrong merchant cannot bulk update orders', async () => {
    const { status } = await req('PATCH', '/orders/bulk', {
      orderIds: [bulkOrder1Id],
      paymentStatus: 'paid',
    }, 'other_merchant_id');
    assert.strictEqual(status, 403);
  });

  test('422 — orderIds contains non-existent order', async () => {
    const { status, data } = await req('PATCH', '/orders/bulk', {
      orderIds: [999999999],
      paymentStatus: 'paid',
    });
    assert.strictEqual(status, 422);
    assert.ok(data.error, 'should return error message');
  });
});

// ─────────────────────────────────────────────────────────────
// 13. Step 5F-B: POST /orders/picking-list
// ─────────────────────────────────────────────────────────────
describe('Step 5F-B: POST /orders/picking-list', () => {
  let pickOrder1Id;
  let pickOrder2Id;
  let pickCancelledId;

  before(async () => {
    const insertOrder = (token, spec, qty) =>
      db.insert(ordersTable).values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'Pick Buyer',
        buyerPhone: '0966666666',
        pickupMethod: 'pickup',
        quantity: qty,
        unitPrice: '100.00',
        totalPrice: String(100 * qty),
        status: 'pending',
        specValues: spec,
        notes: null,
      }).returning();

    const [o1] = await insertOrder(`pick-tok-1-${Date.now()}`, { color: 'red' }, 2);
    const [o2] = await insertOrder(`pick-tok-2-${Date.now()}`, { color: 'red' }, 3);
    const [oCanc] = await insertOrder(`pick-tok-c-${Date.now()}`, {}, 1);

    pickOrder1Id = o1.id;
    pickOrder2Id = o2.id;
    pickCancelledId = oCanc.id;

    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, pickCancelledId));
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('POST', '/orders/picking-list', { orderIds: [pickOrder1Id] }, null);
    assert.strictEqual(status, 401);
  });

  test('422 — empty orderIds', async () => {
    const { status } = await req('POST', '/orders/picking-list', { orderIds: [] });
    assert.strictEqual(status, 422);
  });

  test('422 — orderId does not exist', async () => {
    const { status, data } = await req('POST', '/orders/picking-list', { orderIds: [999999999] });
    assert.strictEqual(status, 422);
    assert.ok(data.error);
  });

  test('403 — wrong merchant cannot access picking list', async () => {
    const { status } = await req('POST', '/orders/picking-list', { orderIds: [pickOrder1Id] }, 'other_merchant_id');
    assert.strictEqual(status, 403);
  });

  test('200 — groups by product+spec and sums quantity', async () => {
    const { status, data } = await req('POST', '/orders/picking-list', {
      orderIds: [pickOrder1Id, pickOrder2Id],
    });
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.items), 'items should be an array');
    assert.strictEqual(data.items.length, 1, 'both orders have same product+spec, should merge into 1 item');
    assert.strictEqual(data.items[0].quantityTotal, 5, 'qty 2 + 3 = 5');
    assert.strictEqual(data.items[0].productId, testProductId);
    assert.ok(data.items[0].orderIds.includes(pickOrder1Id));
    assert.ok(data.items[0].orderIds.includes(pickOrder2Id));
    assert.strictEqual(data.orderCount, 2);
    assert.deepStrictEqual(data.excludedOrderIds, []);
  });

  test('200 — cancelled orders excluded and in excludedOrderIds', async () => {
    const { status, data } = await req('POST', '/orders/picking-list', {
      orderIds: [pickOrder1Id, pickCancelledId],
    });
    assert.strictEqual(status, 200);
    assert.ok(data.excludedOrderIds.includes(pickCancelledId), 'cancelled order in excludedOrderIds');
    assert.strictEqual(data.orderCount, 1, 'only 1 non-cancelled order');
    const includedOrderId = data.items.flatMap((i) => i.orderIds);
    assert.ok(!includedOrderId.includes(pickCancelledId), 'cancelled order not in items');
  });

  test('200 — empty specValues does not crash', async () => {
    const { status, data } = await req('POST', '/orders/picking-list', {
      orderIds: [pickCancelledId === pickOrder1Id ? pickOrder2Id : pickOrder1Id],
    });
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.items));
  });

  test('200 — generatedAt and structure present', async () => {
    const { status, data } = await req('POST', '/orders/picking-list', {
      orderIds: [pickOrder1Id],
    });
    assert.strictEqual(status, 200);
    assert.ok(data.generatedAt, 'generatedAt should be present');
    assert.ok(typeof data.orderCount === 'number');
    assert.ok(Array.isArray(data.excludedOrderIds));
    assert.ok(Array.isArray(data.items));
    const item = data.items[0];
    assert.ok(typeof item.quantityTotal === 'number');
    assert.ok(Array.isArray(item.orderIds));
    assert.ok(Array.isArray(item.orderNumbers));
  });
});

// ─────────────────────────────────────────────────────────────
// 14. Step 5F-B: POST /orders/shipping-list
// ─────────────────────────────────────────────────────────────
describe('Step 5F-B: POST /orders/shipping-list', () => {
  let shipOrder1Id;
  let shipUnpaidId;
  let shipCancelledId;
  let shipOrder1Token;

  before(async () => {
    const insertOrder = (token, overrides) =>
      db.insert(ordersTable).values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'Ship Buyer',
        buyerPhone: '0977777777',
        pickupMethod: 'delivery',
        quantity: 1,
        unitPrice: '200.00',
        totalPrice: '200.00',
        status: 'pending',
        specValues: {},
        internalNote: 'INTERNAL_SECRET',
        paymentNote: 'PAYMENT_SECRET',
        trackingCode: 'SHIP-TRACK-001',
        ...overrides,
      }).returning();

    shipOrder1Token = `ship-tok-1-${Date.now()}`;
    const [o1] = await insertOrder(shipOrder1Token, {
      paymentStatus: 'paid',
      shippingStatus: 'shipped',
      recipientName: '王收件',
      recipientPhone: '0911111111',
      recipientAddress: '台北市信義區某路1號',
    });
    const [oUnpaid] = await insertOrder(`ship-tok-u-${Date.now()}`, {
      paymentStatus: 'unpaid',
    });
    const [oCanc] = await insertOrder(`ship-tok-c-${Date.now()}`, {});

    shipOrder1Id = o1.id;
    shipUnpaidId = oUnpaid.id;
    shipCancelledId = oCanc.id;

    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, shipCancelledId));
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('POST', '/orders/shipping-list', { orderIds: [shipOrder1Id] }, null);
    assert.strictEqual(status, 401);
  });

  test('422 — orderId does not exist', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', { orderIds: [999999998] });
    assert.strictEqual(status, 422);
    assert.ok(data.error);
  });

  test('403 — wrong merchant cannot access shipping list', async () => {
    const { status } = await req('POST', '/orders/shipping-list', { orderIds: [shipOrder1Id] }, 'other_merchant_id');
    assert.strictEqual(status, 403);
  });

  test('200 — returns shipping data with correct fields', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipOrder1Id],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.orderCount, 1);
    assert.ok(Array.isArray(data.orders));
    const order = data.orders[0];
    assert.strictEqual(order.orderId, shipOrder1Id);
    assert.strictEqual(order.paymentStatus, 'paid');
    assert.strictEqual(order.shippingStatus, 'shipped');
    assert.strictEqual(order.recipientName, '王收件');
    assert.strictEqual(order.recipientPhone, '0911111111');
    assert.strictEqual(order.recipientAddress, '台北市信義區某路1號');
    assert.strictEqual(order.trackingCode, 'SHIP-TRACK-001');
    assert.ok(typeof order.itemsText === 'string', 'itemsText should be present');
    assert.ok(order.orderNumber, 'orderNumber should be present');
  });

  test('200 — unpaid order included, paymentStatus present', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipUnpaidId],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.orderCount, 1);
    const order = data.orders[0];
    assert.ok(order.paymentStatus !== undefined, 'paymentStatus must be present even for unpaid');
    assert.strictEqual(order.paymentStatus, 'unpaid');
  });

  test('200 — cancelled orders excluded and in excludedOrderIds', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipOrder1Id, shipCancelledId],
    });
    assert.strictEqual(status, 200);
    assert.ok(data.excludedOrderIds.includes(shipCancelledId), 'cancelled order in excludedOrderIds');
    assert.strictEqual(data.orderCount, 1);
    assert.ok(!data.orders.find((o) => o.orderId === shipCancelledId), 'cancelled order not in orders array');
  });

  test('200 — internalNote MUST NOT be returned', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipOrder1Id],
    });
    assert.strictEqual(status, 200);
    const order = data.orders[0];
    assert.strictEqual(order.internalNote, undefined, 'internalNote must not appear in shipping list response');
  });

  test('200 — paymentNote MUST NOT be returned', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipOrder1Id],
    });
    assert.strictEqual(status, 200);
    const order = data.orders[0];
    assert.strictEqual(order.paymentNote, undefined, 'paymentNote must not appear in shipping list response');
  });

  test('200 — publicToken is NOT trackingCode', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list', {
      orderIds: [shipOrder1Id],
    });
    assert.strictEqual(status, 200);
    const order = data.orders[0];
    assert.strictEqual(order.trackingCode, 'SHIP-TRACK-001', 'trackingCode should be logistics tracking number');
    assert.strictEqual(order.publicToken, undefined, 'publicToken should not appear in shipping list');
  });
});

// ─────────────────────────────────────────────────────────────
// 15. Step 5F-C: POST /orders/picking-list.csv
// ─────────────────────────────────────────────────────────────
describe('Step 5F-C: POST /orders/picking-list.csv', () => {
  let csvPickOrder1Id;
  let csvPickCancelledId;
  let csvPickSpecialId;

  before(async () => {
    const insertOrder = (token, overrides) =>
      db.insert(ordersTable).values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'CSV Pick Buyer',
        buyerPhone: '0911222333',
        pickupMethod: 'pickup',
        quantity: 3,
        unitPrice: '100.00',
        totalPrice: '300.00',
        status: 'pending',
        specValues: { color: 'blue' },
        ...overrides,
      }).returning();

    const [o1] = await insertOrder(`csv-pick-1-${Date.now()}`, {});
    const [oCanc] = await insertOrder(`csv-pick-c-${Date.now()}`, {});
    const [oSpec] = await insertOrder(`csv-pick-s-${Date.now()}`, {
      notes: 'has,comma "quote"\nnewline',
    });

    csvPickOrder1Id = o1.id;
    csvPickCancelledId = oCanc.id;
    csvPickSpecialId = oSpec.id;

    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, csvPickCancelledId));
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] }, null);
    assert.strictEqual(status, 401);
  });

  test('422 — empty orderIds', async () => {
    const { status } = await req('POST', '/orders/picking-list.csv', { orderIds: [] });
    assert.strictEqual(status, 422);
  });

  test('403 — cannot export other merchant orders', async () => {
    const { status } = await req('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] }, 'other_merchant_id');
    assert.strictEqual(status, 403);
  });

  test('200 — Content-Type is text/csv', async () => {
    const response = await rawFetch('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] });
    assert.strictEqual(response.status, 200);
    const ct = response.headers.get('content-type') ?? '';
    assert.ok(ct.includes('text/csv'), `expected text/csv, got: ${ct}`);
  });

  test('200 — CSV starts with UTF-8 BOM (raw bytes EF BB BF)', async () => {
    const response = await rawFetch('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] });
    assert.strictEqual(response.status, 200);
    const buf = await response.arrayBuffer();
    const bytes = new Uint8Array(buf);
    assert.strictEqual(bytes[0], 0xEF, 'BOM byte 1 should be 0xEF');
    assert.strictEqual(bytes[1], 0xBB, 'BOM byte 2 should be 0xBB');
    assert.strictEqual(bytes[2], 0xBF, 'BOM byte 3 should be 0xBF');
  });

  test('200 — CSV contains product name, quantityTotal, order number', async () => {
    const { status, data } = await req('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(data.includes('__test_product__'), 'product name in CSV');
    assert.ok(data.includes('3'), 'quantity in CSV');
    assert.ok(data.includes(`#${csvPickOrder1Id}`), 'order number in CSV');
  });

  test('200 — cancelled orders not in CSV', async () => {
    const { status, data } = await req('POST', '/orders/picking-list.csv', {
      orderIds: [csvPickOrder1Id, csvPickCancelledId],
    });
    assert.strictEqual(status, 200);
    const lines = data.split('\n');
    // Header + 1 data row (cancelled excluded)
    assert.strictEqual(lines.filter((l) => l.trim()).length, 2, 'header + 1 active row');
    assert.ok(!data.includes(`#${csvPickCancelledId}`), 'cancelled order not in CSV');
  });

  test('200 — comma, quote, newline correctly escaped', async () => {
    const { status, data } = await req('POST', '/orders/picking-list.csv', { orderIds: [csvPickSpecialId] });
    assert.strictEqual(status, 200);
    // Properly escaped: comma inside quotes, quote doubled, newline inside quotes
    assert.ok(data.includes('"has,comma ""quote""\nnewline"'), 'special chars properly escaped in CSV');
  });

  test('200 — Content-Disposition has picking-list filename', async () => {
    const response = await rawFetch('POST', '/orders/picking-list.csv', { orderIds: [csvPickOrder1Id] });
    assert.strictEqual(response.status, 200);
    const cd = response.headers.get('content-disposition') ?? '';
    assert.ok(cd.includes('picking-list'), `filename should contain picking-list, got: ${cd}`);
    assert.ok(cd.includes('.csv'), 'filename should have .csv extension');
  });
});

// ─────────────────────────────────────────────────────────────
// 16. Step 5F-C: POST /orders/shipping-list.csv
// ─────────────────────────────────────────────────────────────
describe('Step 5F-C: POST /orders/shipping-list.csv', () => {
  let csvShipOrder1Id;
  let csvShipCancelledId;
  let csvShipSpecialId;

  before(async () => {
    const insertOrder = (token, overrides) =>
      db.insert(ordersTable).values({
        productId: testProductId,
        storeId: testStoreId,
        productName: '__test_product__',
        publicToken: token,
        buyerName: 'CSV Ship Buyer',
        buyerPhone: '0922333444',
        pickupMethod: 'delivery',
        quantity: 1,
        unitPrice: '150.00',
        totalPrice: '150.00',
        status: 'pending',
        specValues: {},
        paymentStatus: 'paid',
        shippingStatus: 'shipped',
        trackingCode: 'CSV-TRACK-001',
        recipientName: '王收件人',
        recipientPhone: '0933444555',
        recipientAddress: '台南市中西區某路2號',
        internalNote: 'INTERNAL_DO_NOT_EXPORT',
        paymentNote: 'PAYMENT_DO_NOT_EXPORT',
        ...overrides,
      }).returning();

    const [o1] = await insertOrder(`csv-ship-1-${Date.now()}`, {});
    const [oCanc] = await insertOrder(`csv-ship-c-${Date.now()}`, {});
    const [oSpec] = await insertOrder(`csv-ship-s-${Date.now()}`, {
      buyerName: 'Buyer,With"Special\nChars',
    });

    csvShipOrder1Id = o1.id;
    csvShipCancelledId = oCanc.id;
    csvShipSpecialId = oSpec.id;

    await db.update(ordersTable).set({ status: 'cancelled' }).where(eq(ordersTable.id, csvShipCancelledId));
  });

  test('401 — unauthenticated', async () => {
    const { status } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] }, null);
    assert.strictEqual(status, 401);
  });

  test('200 — Content-Type is text/csv', async () => {
    const response = await rawFetch('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(response.status, 200);
    const ct = response.headers.get('content-type') ?? '';
    assert.ok(ct.includes('text/csv'), `expected text/csv, got: ${ct}`);
  });

  test('200 — CSV contains buyer name, payment status, shipping status, tracking code', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(data.includes('CSV Ship Buyer'), 'buyer name in CSV');
    assert.ok(data.includes('paid'), 'paymentStatus in CSV');
    assert.ok(data.includes('shipped'), 'shippingStatus in CSV');
    assert.ok(data.includes('CSV-TRACK-001'), 'trackingCode in CSV');
  });

  test('200 — CSV contains recipient phone and address', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(data.includes('0933444555'), 'recipientPhone in CSV');
    assert.ok(data.includes('台南市中西區某路2號'), 'recipientAddress in CSV');
  });

  test('200 — internalNote NOT in CSV', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(!data.includes('INTERNAL_DO_NOT_EXPORT'), 'internalNote must not appear in CSV');
  });

  test('200 — paymentNote NOT in CSV', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(!data.includes('PAYMENT_DO_NOT_EXPORT'), 'paymentNote must not appear in CSV');
  });

  test('200 — publicToken NOT in CSV', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(status, 200);
    assert.ok(!data.includes('csv-ship-1-'), 'publicToken must not appear in CSV');
  });

  test('200 — cancelled orders not in CSV', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', {
      orderIds: [csvShipOrder1Id, csvShipCancelledId],
    });
    assert.strictEqual(status, 200);
    const lines = data.split('\n');
    assert.strictEqual(lines.filter((l) => l.trim()).length, 2, 'header + 1 active row');
    assert.ok(!data.includes(`#${csvShipCancelledId}`), 'cancelled order not in CSV');
  });

  test('200 — comma, quote, newline correctly escaped', async () => {
    const { status, data } = await req('POST', '/orders/shipping-list.csv', { orderIds: [csvShipSpecialId] });
    assert.strictEqual(status, 200);
    assert.ok(data.includes('"Buyer,With""Special\nChars"'), 'special chars properly escaped in CSV');
  });

  test('200 — Content-Disposition has shipping-list filename', async () => {
    const response = await rawFetch('POST', '/orders/shipping-list.csv', { orderIds: [csvShipOrder1Id] });
    assert.strictEqual(response.status, 200);
    const cd = response.headers.get('content-disposition') ?? '';
    assert.ok(cd.includes('shipping-list'), `filename should contain shipping-list, got: ${cd}`);
    assert.ok(cd.includes('.csv'), 'filename should have .csv extension');
  });
});
