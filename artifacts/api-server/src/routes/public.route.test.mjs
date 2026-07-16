/**
 * Integration tests for public routes — Step 6E-B
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    No auth required (public endpoints)
 * DB:      Real DB via DATABASE_URL (test data created and cleaned up per run)
 * Runner:  node --experimental-test-module-mocks --import tsx/esm --test src/routes/public.route.test.mjs
 *
 * Covers:
 *  - POST /p/:shareToken/orders — basic order creation
 *  - POST /p/:shareToken/orders — CVS snapshot fields
 *  - POST /p/:shareToken/orders — storeSelectedBy forced to "customer" (security)
 *  - POST /p/:shareToken/orders — storeSelectedAt set by server
 *  - GET  /orders/track/:publicToken — privacy: does not leak personal info
 *  - GET  /orders/track/:publicToken — does not return CVS store fields (current policy)
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────
// 1. Dynamic imports (no Clerk mock needed — public routes have no auth)
// ─────────────────────────────────────────────────────────────
const { default: express }     = await import('express');
const { default: rateLimit }   = await import('express-rate-limit');
const { db, storesTable, productsTable, ordersTable, pool } = await import('@workspace/db');
const { eq }                   = await import('drizzle-orm');
const { PUBLIC_ORDER_CREATED_RESPONSE_KEYS } = await import('../lib/publicOrderResponse.ts');
const { PUBLIC_TRACK_ORDER_RESPONSE_KEYS } = await import('../lib/publicTrackResponse.ts');
const { default: publicRouter } = await import('./public.ts');

// ─────────────────────────────────────────────────────────────
// 2. Minimal test Express app
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', publicRouter);

// ─────────────────────────────────────────────────────────────
// 3. Shared test state
// ─────────────────────────────────────────────────────────────
let server;
let baseUrl;
let testStoreId;
let testProductId;
let testShareToken;

const TEST_MERCHANT_ID = 'test_merchant_step6eb';

// ─────────────────────────────────────────────────────────────
// 4. Global setup / teardown
// ─────────────────────────────────────────────────────────────
before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}/api`;

  const [store] = await db
    .insert(storesTable)
    .values({ merchantId: TEST_MERCHANT_ID, name: '__test_store_6eb__', slug: `test-store-6eb-${Date.now()}` })
    .returning();
  testStoreId = store.id;

  testShareToken = `test-share-6eb-${Date.now()}`;

  const [product] = await db
    .insert(productsTable)
    .values({
      storeId: testStoreId,
      name: '__test_product_6eb__',
      price: '100.00',
      shareToken: testShareToken,
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
// 5. HTTP helper (no auth header needed for public endpoints)
// ─────────────────────────────────────────────────────────────
async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

function assertPublicOrderCreatedResponse(data) {
  assert.deepStrictEqual(
    Object.keys(data).sort(),
    [...PUBLIC_ORDER_CREATED_RESPONSE_KEYS].sort(),
    'public order response must contain exactly the approved 16-key allowlist',
  );
  assert.ok(!('buyerName' in data), 'public response must not expose buyerName');
  assert.ok(!('storeSelectedBy' in data), 'public response must not expose storeSelectedBy');
  assert.ok(!('storeSelectedAt' in data), 'public response must not expose storeSelectedAt');
}

async function readCreatedOrder(publicToken) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.publicToken, publicToken))
    .limit(1);
  assert.ok(order, `order ${publicToken} should exist in the test database`);
  return order;
}

// ─────────────────────────────────────────────────────────────
// 6. GET /p/:shareToken — product info
// ─────────────────────────────────────────────────────────────
describe('GET /p/:shareToken', () => {
  test('200 — returns product info', async () => {
    const { status, data } = await req('GET', `/p/${testShareToken}`);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.name, '__test_product_6eb__');
    assert.strictEqual(data.shareToken, testShareToken);
  });

  test('404 — unknown shareToken', async () => {
    const { status } = await req('GET', '/p/totally-unknown-token-xyz999');
    assert.strictEqual(status, 404);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. POST /p/:shareToken/orders — basic order creation (no CVS)
// ─────────────────────────────────────────────────────────────
describe('POST /p/:shareToken/orders — basic (no CVS)', () => {
  test('201 — creates order without CVS fields', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '測試買家',
      buyerPhone: '0912345678',
      pickupMethod: '面交',
      quantity: 1,
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    assertPublicOrderCreatedResponse(data);
    assert.ok(data.publicToken, 'should have publicToken');
    assert.strictEqual(data.status, 'pending');
    assert.strictEqual(data.cvsStoreId, null, 'cvsStoreId should be null when no CVS');
  });

  test('400 — missing required fields rejected by zod', async () => {
    const { status } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '測試',
      // missing buyerPhone and pickupMethod
      quantity: 1,
    });
    assert.strictEqual(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. POST /p/:shareToken/orders — CVS snapshot fields
// ─────────────────────────────────────────────────────────────
describe('POST /p/:shareToken/orders — CVS snapshot', () => {
  test('201 — creates order with CVS snapshot', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '超商買家',
      buyerPhone: '0923456789',
      pickupMethod: '7-11 取貨（先付款）',
      quantity: 1,
      cvsStoreId: '284754',
      cvsStoreName: '懷民門市',
      cvsStoreAddress: '新北市板橋區民治街111號',
      cvsStorePhone: '(02)22504664',
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.cvsStoreId, '284754');
    assert.strictEqual(data.cvsStoreName, '懷民門市');
    assert.strictEqual(data.cvsStoreAddress, '新北市板橋區民治街111號');
    assert.strictEqual(data.cvsStorePhone, '(02)22504664');
  });

  test('201 — CVS order with null cvsStorePhone is accepted', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '超商買家2',
      buyerPhone: '0934567890',
      pickupMethod: '全家取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'family-015125',
      cvsStoreName: '板橋文化店',
      cvsStoreAddress: '新北市板橋區文化路一段188號',
      cvsStorePhone: null,
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.cvsStoreId, 'family-015125');
  });
});

// ─────────────────────────────────────────────────────────────
// 9. POST /p/:shareToken/orders — storeSelectedBy security
//    Public endpoint MUST always store "customer" regardless of client input.
// ─────────────────────────────────────────────────────────────
describe('POST /p/:shareToken/orders — storeSelectedBy forced to "customer"', () => {
  test('storeSelectedBy is always "customer" when CVS snapshot present (client sends nothing)', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '偽造測試A',
      buyerPhone: '0911111111',
      pickupMethod: '7-11 取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'test-store-001',
      cvsStoreName: '測試門市A',
      cvsStoreAddress: '測試地址A',
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    const order = await readCreatedOrder(data.publicToken);
    assert.strictEqual(order.storeSelectedBy, 'customer',
      'storeSelectedBy must be "customer" on public submit endpoint');
  });

  test('client sends storeSelectedBy="admin" — server still stores "customer"', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '偽造測試B',
      buyerPhone: '0922222222',
      pickupMethod: '7-11 取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'test-store-002',
      cvsStoreName: '測試門市B',
      cvsStoreAddress: '測試地址B',
      storeSelectedBy: 'admin',
    });
    // Note: "storeSelectedBy" is not in SubmitOrderBody zod schema, so zod strips it.
    // The server always forces "customer" for public endpoint when hasCvs is true.
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    const order = await readCreatedOrder(data.publicToken);
    assert.strictEqual(order.storeSelectedBy, 'customer',
      'client attempt to forge storeSelectedBy="admin" must be stored as "customer"');
    assert.notStrictEqual(order.storeSelectedBy, 'admin',
      'storeSelectedBy must never be "admin" on public submit endpoint');
  });

  test('client sends storeSelectedBy="staff" — server still stores "customer"', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '偽造測試C',
      buyerPhone: '0933333333',
      pickupMethod: '全家取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'test-store-003',
      cvsStoreName: '測試門市C',
      cvsStoreAddress: '測試地址C',
      storeSelectedBy: 'staff',
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    const order = await readCreatedOrder(data.publicToken);
    assert.strictEqual(order.storeSelectedBy, 'customer',
      'any non-customer storeSelectedBy from client must be stored as "customer"');
  });
});

// ─────────────────────────────────────────────────────────────
// 10. POST /p/:shareToken/orders — storeSelectedAt set by server
// ─────────────────────────────────────────────────────────────
describe('POST /p/:shareToken/orders — storeSelectedAt', () => {
  test('storeSelectedAt is set by server when CVS snapshot present', async () => {
    const before = new Date();
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '時間測試',
      buyerPhone: '0944444444',
      pickupMethod: '7-11 取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'test-store-time',
      cvsStoreName: '時間測試門市',
      cvsStoreAddress: '時間測試地址',
    });
    const after = new Date();
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    const order = await readCreatedOrder(data.publicToken);
    assert.ok(order.storeSelectedAt, 'storeSelectedAt should be set');
    const sat = new Date(order.storeSelectedAt);
    assert.ok(sat >= before, 'storeSelectedAt should be >= request start time');
    assert.ok(sat <= after, 'storeSelectedAt should be <= request end time');
  });

  test('storeSelectedAt is null when no CVS snapshot', async () => {
    const { status, data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '無CVS測試',
      buyerPhone: '0955555555',
      pickupMethod: '面交',
      quantity: 1,
    });
    assert.strictEqual(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    const order = await readCreatedOrder(data.publicToken);
    assert.strictEqual(order.storeSelectedAt, null, 'storeSelectedAt should be null without CVS');
  });
});

// ─────────────────────────────────────────────────────────────
// 11. GET /orders/track/:publicToken — privacy protection
// ─────────────────────────────────────────────────────────────
describe('GET /orders/track/:publicToken — privacy protection', () => {
  let trackToken;

  before(async () => {
    // Create an order to track
    const { data } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '追蹤測試買家',
      buyerPhone: '0966666666',
      pickupMethod: '面交',
      quantity: 1,
    });
    trackToken = data.publicToken;
  });

  test('200 — returns order status with allowed fields', async () => {
    const { status, data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.ok(data.publicToken, 'publicToken should be present');
    assert.ok(data.status, 'status should be present');
    assert.ok(data.pickupMethod, 'pickupMethod should be present');
    assert.ok('trackingCode' in data, 'trackingCode key should be present');
    assert.deepStrictEqual(
      Object.keys(data).sort(),
      [...PUBLIC_TRACK_ORDER_RESPONSE_KEYS].sort(),
      'public tracking response must contain exactly the approved key allowlist',
    );
    for (const forbidden of [
      'buyerName',
      'buyerPhone',
      'recipientName',
      'recipientPhone',
      'recipientAddress',
      'costJpy',
      'profitSnapshotCostJpy',
      'profitSnapshotExchangeRate',
      'profitSnapshotProductCostTwd',
      'profitSnapshotTransportCostTwd',
      'profitSnapshotUnitProfitTwd',
      'profitSnapshotFullUnitProfitTwd',
      'cartProfitSnapshotTotalTwd',
      'internalNote',
    ]) {
      assert.equal(Object.hasOwn(data, forbidden), false, `${forbidden} must never be public`);
    }
  });

  test('does NOT return recipientPhone', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.recipientPhone, undefined, 'recipientPhone must not be returned');
  });

  test('does NOT return recipientAddress', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.recipientAddress, undefined, 'recipientAddress must not be returned');
  });

  test('does NOT return internalNote', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.internalNote, undefined, 'internalNote must not be returned');
  });

  test('does NOT return paymentNote', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.paymentNote, undefined, 'paymentNote must not be returned');
  });

  test('does NOT return paidAmount', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.paidAmount, undefined, 'paidAmount must not be returned');
  });

  test('does NOT return buyerPhone (personal info)', async () => {
    const { data } = await req('GET', `/orders/track/${trackToken}`);
    assert.strictEqual(data.buyerPhone, undefined, 'buyerPhone must not be returned');
  });

  test('strictly masks a two-character name without revealing the final character', async () => {
    const { data: created } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: '陳明',
      buyerPhone: '0955555555',
      pickupMethod: '面交',
      quantity: 1,
    });
    const { status, data } = await req('GET', `/orders/track/${created.publicToken}`);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.recipientNameMasked, '陳○');
    assert.notStrictEqual(data.recipientNameMasked, '陳明');
  });

  test('does NOT return CVS store fields (current policy — no change)', async () => {
    // Create CVS order for tracking test
    const { data: order } = await req('POST', `/p/${testShareToken}/orders`, {
      buyerName: 'CVS追蹤測試',
      buyerPhone: '0977777777',
      pickupMethod: '7-11 取貨（先付款）',
      quantity: 1,
      cvsStoreId: 'track-test-store',
      cvsStoreName: '追蹤測試門市',
      cvsStoreAddress: '追蹤測試地址',
    });
    const { data: tracked } = await req('GET', `/orders/track/${order.publicToken}`);
    assert.strictEqual(tracked.cvsStoreId, undefined,
      'cvsStoreId must not be returned by public tracking (current policy)');
    assert.strictEqual(tracked.cvsStoreName, undefined,
      'cvsStoreName must not be returned by public tracking (current policy)');
    assert.strictEqual(tracked.cvsStoreAddress, undefined,
      'cvsStoreAddress must not be returned by public tracking (current policy)');
    assert.strictEqual(tracked.storeSelectedBy, undefined,
      'storeSelectedBy must not be returned by public tracking');
  });

  test('404 — unknown publicToken', async () => {
    const { status } = await req('GET', '/orders/track/totally-unknown-public-token-xyz999');
    assert.strictEqual(status, 404);
  });
});
