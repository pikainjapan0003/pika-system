/**
 * Integration tests for Agent API routes (Step 7D-4B-2)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    agentTokenAuth middleware — real DB token lookup via SHA-256 hash
 * DB:      Real DB via DATABASE_URL — all test data prefixed with STEP7D_E2E_
 * Runner:  node --import tsx/esm --test src/routes/agent.integration.test.mjs
 * Enable:  RUN_AGENT_INTEGRATION_TESTS=1 node --import tsx/esm --test ...
 *
 * SAFETY:
 *   - All test data uses STEP7D_E2E_ prefix on text identifier fields.
 *   - cleanupAll() deletes ONLY rows seeded by this test (by inserted id / storeId).
 *   - No TRUNCATE. No unconditional DELETE.
 *   - rawToken values exist only in this file's memory — never written to DB or logs.
 *   - DATABASE_URL value is never printed.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// 1. Integration guard — must be explicitly enabled.
//    No DB access, no server, no imports occur unless both flags are set.
// ─────────────────────────────────────────────────────────────
const integrationEnabled =
  process.env.RUN_AGENT_INTEGRATION_TESTS === '1' &&
  Boolean(process.env.DATABASE_URL);

if (!integrationEnabled) {
  // ─── SKIP MODE ─────────────────────────────────────────────
  // Single marker test that is skipped. No DB connections are made.
  test(
    'Agent integration tests skipped — set RUN_AGENT_INTEGRATION_TESTS=1 and DATABASE_URL to enable',
    { skip: 'RUN_AGENT_INTEGRATION_TESTS not set or DATABASE_URL missing' },
    () => {},
  );
} else {
  // ─── INTEGRATION MODE ──────────────────────────────────────
  // All DB imports, server setup, and test registrations happen here.
  // Dynamic imports prevent any DB connection when the guard is false.

  // ─────────────────────────────────────────────────────────────
  // 2. Dynamic imports (only loaded when integration is enabled)
  // ─────────────────────────────────────────────────────────────
  const { default: express } = await import('express');
  const {
    db,
    pool,
    storesTable,
    productsTable,
    ordersTable,
    shipmentTrackingsTable,
    shipmentTrackingEventsTable,
    sellerAgentTokensTable,
    agentRunLogsTable,
  } = await import('@workspace/db');
  const { eq, inArray } = await import('drizzle-orm');
  const { default: agentRouter } = await import('./agent.ts');

  // ─────────────────────────────────────────────────────────────
  // 3. Token strategy
  //    rawToken values live ONLY in this file's memory.
  //    DB stores only the SHA-256 hash and prefix (first 12 chars).
  //    Never log, print, or persist rawToken values.
  // ─────────────────────────────────────────────────────────────
  function sha256hex(str) {
    return createHash('sha256').update(str).digest('hex');
  }

  // Token values are intentionally opaque strings — not real credentials.
  const RAW_TOKEN_MAIN    = 'sagt_STEP7D_E2E_main_t0k3n_xyz789abc';
  const RAW_TOKEN_STORE_B = 'sagt_STEP7D_E2E_storeb_t0k3n_def012uvw';
  const TOKEN_HASH_MAIN      = sha256hex(RAW_TOKEN_MAIN);
  const TOKEN_HASH_STORE_B   = sha256hex(RAW_TOKEN_STORE_B);
  const TOKEN_PREFIX_MAIN    = RAW_TOKEN_MAIN.slice(0, 12);
  const TOKEN_PREFIX_STORE_B = RAW_TOKEN_STORE_B.slice(0, 12);

  // ─────────────────────────────────────────────────────────────
  // 4. Minimal Express app — no Clerk mock needed (agentTokenAuth uses real DB)
  // ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use('/api/internal/agent', agentRouter);

  // ─────────────────────────────────────────────────────────────
  // 5. Shared seed state — populated in before(), used in tests and after()
  // ─────────────────────────────────────────────────────────────
  let server;
  let baseUrl;

  // Store Main
  let storeMain;
  let productMain;
  let orderMain;
  let trackingMain;
  let tokenMain;

  // Store B (cross-store isolation tests)
  let storeB;
  let productB;
  let orderB;
  let trackingB;
  // tokenB is seeded but not used in HTTP requests — only for cleanup

  // Idempotency key — unique per run, consistent within C-1 / C-2
  const IDEM_KEY = `idem_step7d_e2e_${Date.now()}`;

  // ─────────────────────────────────────────────────────────────
  // 6. HTTP helper
  // ─────────────────────────────────────────────────────────────
  async function req(method, path, body, bearerToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch { /* non-JSON body */ }
    return { status: response.status, data };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Seed helper — all test data uses STEP7D_E2E_ prefix
  // ─────────────────────────────────────────────────────────────
  async function seedAll() {
    const ts = Date.now();

    // Seed stores
    [storeMain] = await db.insert(storesTable).values({
      merchantId: 'STEP7D_E2E_merchant',
      name: 'STEP7D_E2E_store_main',
      slug: `step7d-e2e-main-${ts}`,
    }).returning();

    [storeB] = await db.insert(storesTable).values({
      merchantId: 'STEP7D_E2E_merchant_b',
      name: 'STEP7D_E2E_store_b',
      slug: `step7d-e2e-storeb-${ts}`,
    }).returning();

    // Seed products (orders.product_id is NOT NULL FK)
    [productMain] = await db.insert(productsTable).values({
      storeId: storeMain.id,
      name: 'STEP7D_E2E_product',
      price: '100.00',
      shareToken: `step7d-e2e-prod-${ts}`,
      isActive: true,
    }).returning();

    [productB] = await db.insert(productsTable).values({
      storeId: storeB.id,
      name: 'STEP7D_E2E_product_b',
      price: '100.00',
      shareToken: `step7d-e2e-prod-b-${ts}`,
      isActive: true,
    }).returning();

    // Seed orders
    [orderMain] = await db.insert(ordersTable).values({
      storeId: storeMain.id,
      productId: productMain.id,
      buyerName: 'STEP7D_E2E_buyer',
      buyerPhone: '0900000000',
      pickupMethod: 'cvs',
      unitPrice: '100.00',
      totalPrice: '100.00',
      publicToken: `STEP7D_E2E_order_${ts}`,
    }).returning();

    [orderB] = await db.insert(ordersTable).values({
      storeId: storeB.id,
      productId: productB.id,
      buyerName: 'STEP7D_E2E_buyer_b',
      buyerPhone: '0900000000',
      pickupMethod: 'cvs',
      unitPrice: '100.00',
      totalPrice: '100.00',
      publicToken: `STEP7D_E2E_order_b_${ts}`,
    }).returning();

    // Seed shipment_trackings
    [trackingMain] = await db.insert(shipmentTrackingsTable).values({
      orderId: orderMain.id,
      trackingCode: `STEP7D_E2E_TC_${ts}`,
      trackingProvider: 'TCAT',
    }).returning();

    [trackingB] = await db.insert(shipmentTrackingsTable).values({
      orderId: orderB.id,
      trackingCode: `STEP7D_E2E_TC_B_${ts}`,
      trackingProvider: 'TCAT',
    }).returning();

    // Seed seller_agent_tokens
    [tokenMain] = await db.insert(sellerAgentTokensTable).values({
      merchantId: 'STEP7D_E2E_merchant',
      storeId: storeMain.id,
      name: 'STEP7D_E2E_token_main',
      tokenHash: TOKEN_HASH_MAIN,
      tokenPrefix: TOKEN_PREFIX_MAIN,
      status: 'active',
      scopes: ['tracking:read', 'tracking:write', 'run_log:write'],
    }).returning();

    // tokenB: seeded for cross-store test (store B token not used in HTTP reqs)
    await db.insert(sellerAgentTokensTable).values({
      merchantId: 'STEP7D_E2E_merchant_b',
      storeId: storeB.id,
      name: 'STEP7D_E2E_token_b',
      tokenHash: TOKEN_HASH_STORE_B,
      tokenPrefix: TOKEN_PREFIX_STORE_B,
      status: 'active',
      scopes: ['tracking:read', 'tracking:write', 'run_log:write'],
    }).returning();
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Cleanup helper — strict FK-safe order, prefix-guarded
  //    Deletes ONLY rows seeded by this test.
  //    Guard: aborts if storeMain was never seeded.
  // ─────────────────────────────────────────────────────────────
  async function cleanupAll() {
    if (!storeMain?.id) {
      throw new Error('STEP7D_E2E cleanup aborted: storeMain not seeded — refusing to run cleanup to prevent accidental data loss');
    }

    const storeIds    = [storeMain.id, storeB?.id].filter(Boolean);
    const trackingIds = [trackingMain?.id, trackingB?.id].filter(Boolean);
    const orderIds    = [orderMain?.id, orderB?.id].filter(Boolean);

    // 1. shipment_tracking_events (depends on shipment_trackings)
    if (trackingIds.length > 0) {
      await db.delete(shipmentTrackingEventsTable)
        .where(inArray(shipmentTrackingEventsTable.shipmentTrackingId, trackingIds));
    }

    // 2. agent_run_logs (depends on stores + seller_agent_tokens)
    await db.delete(agentRunLogsTable)
      .where(inArray(agentRunLogsTable.storeId, storeIds));

    // 3. shipment_trackings (depends on orders)
    if (orderIds.length > 0) {
      await db.delete(shipmentTrackingsTable)
        .where(inArray(shipmentTrackingsTable.orderId, orderIds));
    }

    // 4. seller_agent_tokens (depends on stores)
    await db.delete(sellerAgentTokensTable)
      .where(inArray(sellerAgentTokensTable.storeId, storeIds));

    // 5. orders (depends on stores + products)
    await db.delete(ordersTable)
      .where(inArray(ordersTable.storeId, storeIds));

    // 6. products (depends on stores)
    await db.delete(productsTable)
      .where(inArray(productsTable.storeId, storeIds));

    // 7. stores (root — delete last)
    await db.delete(storesTable)
      .where(inArray(storesTable.id, storeIds));
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Global setup / teardown
  // ─────────────────────────────────────────────────────────────
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}/api/internal/agent`;
    await seedAll();
  });

  after(async () => {
    await cleanupAll();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  // ─────────────────────────────────────────────────────────────
  // Flow A: Full happy path
  // ─────────────────────────────────────────────────────────────
  describe('Flow A — Full happy path', () => {
    test('A-1: GET /orders/tracking-jobs returns seeded tracking for store main', async () => {
      const { status, data } = await req('GET', '/orders/tracking-jobs', undefined, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.jobs), 'response.jobs must be an array');
      const job = data.jobs.find((j) => j.trackingId === trackingMain.id);
      assert.ok(job, 'seeded tracking must appear in tracking-jobs response');
      assert.strictEqual(job.order.storeId, storeMain.id);
      // Buyer PII must NOT appear in response
      assert.strictEqual(job.buyerName, undefined, 'buyerName must not be in response');
      assert.strictEqual(job.buyerPhone, undefined, 'buyerPhone must not be in response');
    });

    test('A-2: POST /shipment-events inserts a new event row', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingMain.id,
        eventStatus: 'in_transit',
        eventDescription: 'STEP7D_E2E_event_desc',
        occurredAt: new Date().toISOString(),
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      assert.strictEqual(data.idempotent, false);
      assert.strictEqual(data.event.trackingId, trackingMain.id);
      assert.strictEqual(data.event.eventStatus, 'in_transit');
      // Response must NOT expose rawPayload or rawData
      assert.strictEqual(data.event.rawPayload, undefined);
      assert.strictEqual(data.event.rawData, undefined);
    });

    test('A-3: PATCH /shipment-status updates tracking_status in DB', async () => {
      const { status, data } = await req('PATCH', '/shipment-status', {
        trackingId: trackingMain.id,
        trackingStatus: 'active',
        latestEventStatus: 'in_transit',
        lastCheckedAt: new Date().toISOString(),
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.tracking.trackingId, trackingMain.id);
      assert.strictEqual(data.tracking.trackingStatus, 'active');
    });

    test('A-4: POST /run-log inserts agent_run_logs row with correct tokenId / storeId / merchantId', async () => {
      const { status, data } = await req('POST', '/run-log', {
        runType: 'scheduled',
        status: 'completed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        checkedCount: 5,
        successCount: 5,
        failedCount: 0,
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      assert.strictEqual(data.runLog.runType, 'scheduled');
      assert.strictEqual(data.runLog.status, 'completed');
      assert.strictEqual(data.runLog.checkedCount, 5);
      // Response must NOT expose token internals
      assert.strictEqual(data.runLog.tokenHash, undefined);
      assert.strictEqual(data.runLog.rawData, undefined);

      // DB verify: inserted row must have correct storeId / tokenId / merchantId
      const [row] = await db.select()
        .from(agentRunLogsTable)
        .where(eq(agentRunLogsTable.id, data.runLog.runLogId))
        .limit(1);
      assert.ok(row, 'agent_run_logs row must exist in DB');
      assert.strictEqual(row.storeId, storeMain.id, 'storeId must match seeded store main');
      assert.strictEqual(row.tokenId, tokenMain.id, 'tokenId must match seeded token');
      assert.strictEqual(row.merchantId, 'STEP7D_E2E_merchant', 'merchantId must match seeded value');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow B: Cross-store isolation
  // ─────────────────────────────────────────────────────────────
  describe('Flow B — Cross-store isolation', () => {
    test('B-1: GET /orders/tracking-jobs with store A token does NOT return store B tracking', async () => {
      const { status, data } = await req('GET', '/orders/tracking-jobs', undefined, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 200);
      const hasStoreBTracking = data.jobs.some((j) => j.trackingId === trackingB.id);
      assert.strictEqual(hasStoreBTracking, false, 'store B tracking must not appear in store A token results');
    });

    test('B-2: POST /shipment-events with store A token and store B trackingId → 404', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingB.id,
        eventStatus: 'in_transit',
        occurredAt: new Date().toISOString(),
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 404);
      assert.strictEqual(data.error, 'tracking_not_found');
    });

    test('B-3: PATCH /shipment-status with store A token and store B trackingId → 404', async () => {
      const { status, data } = await req('PATCH', '/shipment-status', {
        trackingId: trackingB.id,
        trackingStatus: 'active',
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 404);
      assert.strictEqual(data.error, 'tracking_not_found');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow C: Idempotency — same trackingId + idempotencyKey must not duplicate
  // C-1 and C-2 must run sequentially (node:test default) to share IDEM_KEY state.
  // ─────────────────────────────────────────────────────────────
  describe('Flow C — Idempotency', () => {
    test('C-1: POST /shipment-events first call → 201 idempotent=false', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingMain.id,
        eventStatus: 'arrived_store',
        occurredAt: new Date().toISOString(),
        idempotencyKey: IDEM_KEY,
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      assert.strictEqual(data.idempotent, false);
      assert.strictEqual(data.event.idempotencyKey, IDEM_KEY);
    });

    test('C-2: POST /shipment-events repeat same idempotencyKey → 200 idempotent=true (no duplicate row)', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingMain.id,
        eventStatus: 'arrived_store',
        occurredAt: new Date().toISOString(),
        idempotencyKey: IDEM_KEY,
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.idempotent, true);
      assert.strictEqual(data.event.idempotencyKey, IDEM_KEY);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow D: rawPayload sanitization
  // ─────────────────────────────────────────────────────────────
  describe('Flow D — rawPayload sanitization', () => {
    test('D-1: POST /shipment-events with sensitive keys in rawPayload — DB raw_data must be scrubbed', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingMain.id,
        eventStatus: 'in_transit',
        occurredAt: new Date().toISOString(),
        rawPayload: {
          trackingNum: 'TC_SAFE_KEY',
          phone: '0912345678',
          address: '台北市某路1號',
          name: '測試收件人',
          email: 'test@example.com',
          status: 'shipped',
        },
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      // Response must not expose rawPayload / rawData
      assert.strictEqual(data.event.rawPayload, undefined);
      assert.strictEqual(data.event.rawData, undefined);

      // DB verify: raw_data must not contain sensitive keys
      const [row] = await db.select()
        .from(shipmentTrackingEventsTable)
        .where(eq(shipmentTrackingEventsTable.id, data.event.eventId))
        .limit(1);
      assert.ok(row, 'shipment_tracking_events row must exist');
      if (row.rawData !== null && row.rawData !== undefined) {
        assert.strictEqual(row.rawData.phone, undefined, 'phone must be scrubbed');
        assert.strictEqual(row.rawData.address, undefined, 'address must be scrubbed');
        assert.strictEqual(row.rawData.name, undefined, 'name must be scrubbed');
        assert.strictEqual(row.rawData.email, undefined, 'email must be scrubbed');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow E: Validation errors and auth failures
  // ─────────────────────────────────────────────────────────────
  describe('Flow E — Validation errors and auth', () => {
    test('E-1: Invalid bearer token → 401 agent_auth_unauthorized', async () => {
      const { status, data } = await req('GET', '/orders/tracking-jobs', undefined, 'invalid_token_xyz_step7d_e2e');
      assert.strictEqual(status, 401);
      assert.strictEqual(data.error, 'agent_auth_unauthorized');
    });

    test('E-2: Missing Authorization header → 401 agent_auth_missing', async () => {
      const { status, data } = await req('GET', '/orders/tracking-jobs', undefined, null);
      assert.strictEqual(status, 401);
      assert.strictEqual(data.error, 'agent_auth_missing');
    });

    test('E-3: Invalid tracking status filter → 400 invalid_tracking_status', async () => {
      const { status, data } = await req('GET', '/orders/tracking-jobs?status=INVALID_STATUS', undefined, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, 'invalid_tracking_status');
    });

    test('E-4: Invalid eventStatus → 400 invalid_event_status', async () => {
      const { status, data } = await req('POST', '/shipment-events', {
        trackingId: trackingMain.id,
        eventStatus: 'INVALID_EVENT_STATUS',
        occurredAt: new Date().toISOString(),
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, 'invalid_event_status');
    });

    test('E-5: Invalid runType → 400 invalid_run_type', async () => {
      const { status, data } = await req('POST', '/run-log', {
        runType: 'INVALID_TYPE',
        status: 'completed',
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, 'invalid_run_type');
    });

    test('E-6: Invalid run status → 400 invalid_run_status', async () => {
      const { status, data } = await req('POST', '/run-log', {
        runType: 'scheduled',
        status: 'INVALID_STATUS',
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, 'invalid_run_status');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow F: DB field verification
  // ─────────────────────────────────────────────────────────────
  describe('Flow F — DB field verification', () => {
    test('F-1: POST /run-log — agent_run_logs.token_id equals seeded token id', async () => {
      const { status, data } = await req('POST', '/run-log', {
        runType: 'test',
        status: 'completed',
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      const [row] = await db.select()
        .from(agentRunLogsTable)
        .where(eq(agentRunLogsTable.id, data.runLog.runLogId))
        .limit(1);
      assert.ok(row, 'agent_run_logs row must exist');
      assert.strictEqual(row.tokenId, tokenMain.id, 'tokenId must match seeded token (not from body)');
    });

    test('F-2: POST /run-log — store_id isolation: log goes to store A only', async () => {
      const { status, data } = await req('POST', '/run-log', {
        runType: 'manual',
        status: 'running',
      }, RAW_TOKEN_MAIN);
      assert.strictEqual(status, 201);
      const [row] = await db.select()
        .from(agentRunLogsTable)
        .where(eq(agentRunLogsTable.id, data.runLog.runLogId))
        .limit(1);
      assert.ok(row, 'agent_run_logs row must exist');
      assert.strictEqual(row.storeId, storeMain.id, 'storeId must be store A');
      if (storeB?.id !== undefined) {
        assert.notStrictEqual(row.storeId, storeB.id, 'storeId must NOT be store B');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow G: Cleanup guard (structural verification)
  // Actual DB cleanup happens in the top-level after() hook above.
  // This test documents the cleanup contract and verifies the helper exists.
  // ─────────────────────────────────────────────────────────────
  describe('Flow G — Cleanup guard (structural)', () => {
    test('G-1: cleanupAll() is a function and will run in after() hook', () => {
      assert.strictEqual(typeof cleanupAll, 'function', 'cleanupAll must be a function');
      assert.ok(storeMain?.id, 'storeMain must be seeded before cleanup guard passes');
    });
  });
}
