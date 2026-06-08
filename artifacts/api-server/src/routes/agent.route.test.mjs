/**
 * Unit/integration tests for Agent token middleware + routes (Step 7D-3B/3C/3D)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    agentTokenAuth middleware — reads Authorization: Bearer <token> header
 * DB:      @workspace/db is mocked
 * Runner:  node --experimental-test-module-mocks --import tsx/esm --test src/routes/agent.route.test.mjs
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// 1. Token values — raw tokens exist ONLY in this test file
// ─────────────────────────────────────────────────────────────
function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

const VALID_TOKEN    = 'sagt_valid_token_step7d3b_abc123';
const REVOKED_TOKEN  = 'sagt_revoked_token_step7d3b_def456';
const EXPIRED_TOKEN  = 'sagt_expired_token_step7d3b_ghi789';
const DISABLED_TOKEN = 'sagt_disabled_token_step7d3b_jkl012';
const UNKNOWN_TOKEN  = 'sagt_completely_unknown_step7d3b_xyz999';

// ─────────────────────────────────────────────────────────────
// 2. Mock DB record for "valid" token
// ─────────────────────────────────────────────────────────────
const VALID_RECORD = {
  id: 1,
  merchantId: 'merchant_step7d3b',
  storeId: 10,
  status: 'active',
  revokedAt: null,
  expiresAt: null,
  scopes: ['tracking:read', 'tracking:write', 'run_log:write'],
  tokenPrefix: VALID_TOKEN.slice(0, 12),
};

// ─────────────────────────────────────────────────────────────
// 3. Controllable mock state — tests run sequentially
// ─────────────────────────────────────────────────────────────
let mockQueryResult = [];         // auth: seller_agent_tokens query
let mockTrackingJobsResult = [];  // GET tracking-jobs: orderBy path
let mockOwnershipCheckResult = [];// POST shipment-events: ownership verification

// Events table select — configurable per-test via mockFindEventFn
let mockIdempotencyCheckResult = [];
let mockFindEventFn = async () => [...mockIdempotencyCheckResult];

// Insert mock
let mockInsertResult = [];
let mockInsertShouldThrow = null;
let mockInsertCapture = null; // captures values() argument for assertions

// ─────────────────────────────────────────────────────────────
// 4. Sample data
// ─────────────────────────────────────────────────────────────
const MOCK_TRACKING_JOB = {
  trackingId: 1,
  orderId: 42,
  trackingCode: 'TC123456',
  trackingProvider: 'TCAT',
  trackingStatus: 'active',
  latestEventStatus: 'shipped',
  latestEventDescription: '已寄出',
  latestEventAt: null,
  lastCheckedAt: null,
  nextCheckAt: null,
  failureCount: 0,
  orderNumber: 'pub_token_abc',
  orderStoreId: 10,
  shippingStatus: 'shipped',
};

const MOCK_OWNERSHIP_ROW = { trackingId: 123 };

const MOCK_EVENT = {
  id: 99,
  shipmentTrackingId: 123,
  eventStatus: 'in_transit',
  eventDescription: '包裹配送中',
  eventLocation: '台北轉運中心',
  occurredAt: new Date('2026-06-08T08:00:00.000Z'),
  idempotencyKey: 'idem_key_abc',
};

const MOCK_INSERT_RESULT = {
  id: 100,
  shipmentTrackingId: 123,
  eventStatus: 'in_transit',
  eventDescription: '包裹配送中',
  eventLocation: '台北轉運中心',
  occurredAt: new Date('2026-06-08T08:30:00.000Z'),
  idempotencyKey: null,
  eventCode: null,
  rawData: null,
  createdAt: new Date(),
};

// ─────────────────────────────────────────────────────────────
// 5. Import drizzle sql() BEFORE mocking @workspace/db
// ─────────────────────────────────────────────────────────────
const { sql } = await import('drizzle-orm');

const mockSellerAgentTokensTable = {
  tokenHash: sql`"token_hash"`,
  status:    sql`"status"`,
  revokedAt: sql`"revoked_at"`,
  expiresAt: sql`"expires_at"`,
  id:        sql`"id"`,
};

const mockShipmentTrackingsTable = {
  id:                     sql`"st"."id"`,
  orderId:                sql`"st"."order_id"`,
  trackingCode:           sql`"st"."tracking_code"`,
  trackingProvider:       sql`"st"."tracking_provider"`,
  trackingStatus:         sql`"st"."tracking_status"`,
  isActive:               sql`"st"."is_active"`,
  latestEventStatus:      sql`"st"."latest_event_status"`,
  latestEventDescription: sql`"st"."latest_event_description"`,
  latestEventAt:          sql`"st"."latest_event_at"`,
  lastCheckedAt:          sql`"st"."last_checked_at"`,
  nextCheckAt:            sql`"st"."next_check_at"`,
  failureCount:           sql`"st"."failure_count"`,
  createdAt:              sql`"st"."created_at"`,
};

const mockOrdersTable = {
  id:             sql`"o"."id"`,
  storeId:        sql`"o"."store_id"`,
  publicToken:    sql`"o"."public_token"`,
  shippingStatus: sql`"o"."shipping_status"`,
};

const mockShipmentTrackingEventsTable = {
  id:                  sql`"ste"."id"`,
  shipmentTrackingId:  sql`"ste"."shipment_tracking_id"`,
  eventStatus:         sql`"ste"."event_status"`,
  eventDescription:    sql`"ste"."event_description"`,
  eventLocation:       sql`"ste"."event_location"`,
  occurredAt:          sql`"ste"."occurred_at"`,
  idempotencyKey:      sql`"ste"."idempotency_key"`,
  rawData:             sql`"ste"."raw_data"`,
  eventCode:           sql`"ste"."event_code"`,
  createdAt:           sql`"ste"."created_at"`,
};

// ─────────────────────────────────────────────────────────────
// 6. Mock @workspace/db
//
//    db.select() dispatches on the table passed to .from():
//      - sellerAgentTokensTable      → auth chain: .where().limit()
//      - shipmentTrackingsTable       → join chain:
//          .innerJoin().where().orderBy().limit() → tracking-jobs
//          .innerJoin().where().limit()            → ownership check
//      - shipmentTrackingEventsTable  → events chain: .where().limit()
//
//    db.insert() → captures values, returns mockInsertResult or throws
// ─────────────────────────────────────────────────────────────
mock.module('@workspace/db', {
  namedExports: {
    db: {
      select: (_columns) => ({
        from: (table) => {
          if (table === mockSellerAgentTokensTable) {
            return {
              where: () => ({
                limit: async () => [...mockQueryResult],
              }),
            };
          }
          if (table === mockShipmentTrackingEventsTable) {
            return {
              where: () => ({
                limit: async () => await mockFindEventFn(),
              }),
            };
          }
          // shipmentTrackingsTable: supports both orderBy path and direct limit
          return {
            innerJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: async () => [...mockTrackingJobsResult],
                }),
                limit: async () => [...mockOwnershipCheckResult],
              }),
            }),
          };
        },
      }),
      insert: (_table) => ({
        values: (vals) => {
          mockInsertCapture = vals ? { ...vals } : null;
          return {
            returning: async () => {
              if (mockInsertShouldThrow) throw mockInsertShouldThrow;
              return [...mockInsertResult];
            },
          };
        },
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            catch: () => undefined,
          }),
        }),
      }),
    },
    sellerAgentTokensTable: mockSellerAgentTokensTable,
    shipmentTrackingsTable: mockShipmentTrackingsTable,
    ordersTable: mockOrdersTable,
    shipmentTrackingEventsTable: mockShipmentTrackingEventsTable,
    storesTable: {},
    pool: { end: async () => {} },
  },
});

// ─────────────────────────────────────────────────────────────
// 7. Dynamic imports AFTER mock is registered
// ─────────────────────────────────────────────────────────────
const { default: express }     = await import('express');
const { default: agentRouter } = await import('./agent.ts');

// ─────────────────────────────────────────────────────────────
// 8. Minimal test Express app
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/internal/agent', agentRouter);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}/api/internal/agent`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ─────────────────────────────────────────────────────────────
// 9. HTTP helpers
// ─────────────────────────────────────────────────────────────
async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function reqRaw(method, path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { method, headers });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

// ─────────────────────────────────────────────────────────────
// 10. Agent auth middleware tests
// ─────────────────────────────────────────────────────────────
describe('Agent auth middleware', () => {
  test('missing Authorization header → 401 agent_auth_missing', async () => {
    const r = await reqRaw('GET', '/orders/tracking-jobs');
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'agent_auth_missing');
  });

  test('non-Bearer Authorization → 401 agent_auth_invalid_format', async () => {
    const r = await reqRaw('GET', '/orders/tracking-jobs', {
      'Authorization': 'Token some-other-token',
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'agent_auth_invalid_format');
  });

  test('Bearer with empty token → 401 agent_auth_invalid_format', async () => {
    const r = await reqRaw('GET', '/orders/tracking-jobs', {
      'Authorization': 'Bearer ',
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'agent_auth_invalid_format');
  });

  test('unknown token → 401 (mock: no record in DB)', async () => {
    mockQueryResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: UNKNOWN_TOKEN });
    assert.equal(r.status, 401);
  });

  test('revoked token → 401 (mock: DB WHERE filters out revoked status)', async () => {
    mockQueryResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: REVOKED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('expired token → 401 (mock: DB WHERE filters out past expiresAt)', async () => {
    mockQueryResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: EXPIRED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('disabled token → 401 (mock: DB WHERE filters out non-active status)', async () => {
    mockQueryResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: DISABLED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('valid token passes auth → 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.jobs));
  });

  test('response does not expose raw token or its hash', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes(VALID_TOKEN), 'response must not expose raw token');
    assert.ok(!body.includes(sha256(VALID_TOKEN)), 'response must not expose token hash');
  });
});

// ─────────────────────────────────────────────────────────────
// 11. Agent route skeleton tests
// ─────────────────────────────────────────────────────────────
describe('Agent route skeleton', () => {
  test('GET /orders/tracking-jobs → 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.jobs));
  });

  test('POST /shipment-events with empty body → 400 (requires trackingId)', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_tracking_id');
  });

  test('PATCH /shipment-status → 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('PATCH', '/shipment-status', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('POST /run-log → 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/run-log', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('route mounted at /api/internal/agent', () => {
    assert.ok(baseUrl.endsWith('/api/internal/agent'));
  });

  test('unauthenticated to skeleton route → 401 (not 501)', async () => {
    mockQueryResult = [];
    const r = await reqRaw('GET', '/orders/tracking-jobs');
    assert.equal(r.status, 401);
    assert.notEqual(r.data.error, 'not_implemented');
  });
});

// ─────────────────────────────────────────────────────────────
// 12. GET /orders/tracking-jobs — full implementation tests
// ─────────────────────────────────────────────────────────────
describe('GET /orders/tracking-jobs', () => {
  test('unauthenticated → 401', async () => {
    const r = await reqRaw('GET', '/orders/tracking-jobs');
    assert.equal(r.status, 401);
  });

  test('valid token → 200 with jobs array and nextCursor null', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [MOCK_TRACKING_JOB];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.jobs));
    assert.equal(r.data.jobs.length, 1);
    assert.equal(r.data.nextCursor, null);
  });

  test('valid token with no jobs → 200 empty array', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.jobs, []);
  });

  test('response does not include rawData or raw_data', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [MOCK_TRACKING_JOB];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('rawData'), 'must not expose rawData');
    assert.ok(!body.includes('raw_data'), 'must not expose raw_data');
  });

  test('response does not include buyerPhone, buyerName, or recipientPhone', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [MOCK_TRACKING_JOB];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('buyerPhone'), 'must not expose buyerPhone');
    assert.ok(!body.includes('buyerName'), 'must not expose buyerName');
    assert.ok(!body.includes('recipientPhone'), 'must not expose recipientPhone');
    assert.ok(!body.includes('recipientAddress'), 'must not expose recipientAddress');
  });

  test('invalid status query → 400 invalid_tracking_status', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('GET', '/orders/tracking-jobs?status=INVALID_STATUS', { token: VALID_TOKEN });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_tracking_status');
  });

  test('valid status=active query → 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs?status=active', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
  });

  test('valid status=delivered query → 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs?status=delivered', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
  });

  test('limit > 100 is clamped to 100 without error', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs?limit=9999', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
  });

  test('limit=NaN (non-numeric string) defaults to 50 without error', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs?limit=abc', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
  });

  test('dueOnly=true query → 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs?dueOnly=true', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
  });

  test('response job shape includes expected fields', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [MOCK_TRACKING_JOB];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    const job = r.data.jobs[0];
    assert.ok('trackingId' in job);
    assert.ok('orderId' in job);
    assert.ok('trackingCode' in job);
    assert.ok('trackingProvider' in job);
    assert.ok('trackingStatus' in job);
    assert.ok('order' in job);
    assert.ok('orderNumber' in job.order);
    assert.ok('storeId' in job.order);
    assert.ok('shippingStatus' in job.order);
  });

  test('POST /shipment-events implemented (not 501)', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', { token: VALID_TOKEN, body: {} });
    assert.notEqual(r.status, 501);
    assert.notEqual(r.data.error, 'not_implemented');
  });

  test('PATCH /shipment-status still 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('PATCH', '/shipment-status', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('POST /run-log still 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/run-log', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });
});

// ─────────────────────────────────────────────────────────────
// 13. POST /shipment-events — full implementation tests
// ─────────────────────────────────────────────────────────────
describe('POST /shipment-events', () => {
  test('unauthenticated → 401', async () => {
    const r = await reqRaw('POST', '/shipment-events');
    assert.equal(r.status, 401);
  });

  test('valid token + valid body → 201', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    mockFindEventFn = async () => [];
    mockInsertShouldThrow = null;
    mockInsertResult = [MOCK_INSERT_RESULT];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: {
        trackingId: 123,
        eventStatus: 'in_transit',
        eventDescription: '包裹配送中',
        eventLocation: '台北轉運中心',
        occurredAt: '2026-06-08T08:30:00.000Z',
      },
    });
    assert.equal(r.status, 201);
    assert.ok('event' in r.data);
    assert.equal(r.data.idempotent, false);
    assert.ok('eventId' in r.data.event);
    assert.ok('trackingId' in r.data.event);
    assert.ok('eventStatus' in r.data.event);
  });

  test('response does not include rawPayload or rawData or raw_data', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    mockFindEventFn = async () => [];
    mockInsertShouldThrow = null;
    mockInsertResult = [MOCK_INSERT_RESULT];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: {
        trackingId: 123,
        eventStatus: 'in_transit',
        rawPayload: { status: 'ok', providerData: 'xyz' },
      },
    });
    assert.equal(r.status, 201);
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('rawPayload'), 'must not expose rawPayload');
    assert.ok(!body.includes('rawData'), 'must not expose rawData');
    assert.ok(!body.includes('raw_data'), 'must not expose raw_data');
  });

  test('rawPayload sanitization removes sensitive keys before insert', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    mockFindEventFn = async () => [];
    mockInsertShouldThrow = null;
    mockInsertResult = [MOCK_INSERT_RESULT];
    mockInsertCapture = null;
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: {
        trackingId: 123,
        eventStatus: 'in_transit',
        rawPayload: {
          providerCode: 'TCAT',
          customerPhone: '0912345678',
          deliveryAddress: '台北市信義路',
          someToken: 'secret_value',
          status: { code: '01', message: 'ok' },
        },
      },
    });
    assert.equal(r.status, 201);
    assert.ok(mockInsertCapture !== null, 'insert should have been called');
    const rawData = mockInsertCapture.rawData;
    assert.ok(rawData !== null, 'rawData should not be null (had rawPayload)');
    const rawDataStr = JSON.stringify(rawData);
    assert.ok(!rawDataStr.includes('customerPhone'), 'phone removed');
    assert.ok(!rawDataStr.includes('deliveryAddress'), 'address removed');
    assert.ok(!rawDataStr.includes('someToken'), 'token key removed');
    assert.ok(rawDataStr.includes('providerCode'), 'safe key preserved');
    assert.ok(rawDataStr.includes('status'), 'nested safe key preserved');
  });

  test('missing trackingId → 400 invalid_tracking_id', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { eventStatus: 'in_transit' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_tracking_id');
  });

  test('trackingId=0 → 400 invalid_tracking_id', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 0, eventStatus: 'in_transit' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_tracking_id');
  });

  test('invalid eventStatus → 400 invalid_event_status', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 123, eventStatus: 'INVALID' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_event_status');
  });

  test('missing eventStatus → 400 invalid_event_status', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 123 },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_event_status');
  });

  test('invalid occurredAt → 400 invalid_occurred_at', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 123, eventStatus: 'in_transit', occurredAt: 'not-a-date' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_occurred_at');
  });

  test('tracking not found (ownership check fails) → 404 tracking_not_found', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = []; // no tracking found
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 999, eventStatus: 'in_transit' },
    });
    assert.equal(r.status, 404);
    assert.equal(r.data.error, 'tracking_not_found');
  });

  test('idempotencyKey already exists → 200 idempotent true', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    mockFindEventFn = async () => [MOCK_EVENT]; // pre-check finds existing event
    mockInsertShouldThrow = null;
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: {
        trackingId: 123,
        eventStatus: 'in_transit',
        idempotencyKey: 'idem_key_abc',
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.idempotent, true);
    assert.ok('event' in r.data);
    assert.equal(r.data.event.idempotencyKey, 'idem_key_abc');
  });

  test('23505 unique conflict + re-query success → 200 idempotent true', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    // Simulate race condition: pre-check returns nothing, insert fails, re-query succeeds
    let callCount = 0;
    mockFindEventFn = async () => {
      callCount++;
      return callCount === 1 ? [] : [MOCK_EVENT];
    };
    mockInsertShouldThrow = { code: '23505', message: 'duplicate key value violates unique constraint' };
    mockInsertResult = [];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: {
        trackingId: 123,
        eventStatus: 'in_transit',
        idempotencyKey: 'race_key_xyz',
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.idempotent, true);
    assert.ok('event' in r.data);
  });

  test('DB insert failed (non-unique error) → 500 agent_shipment_event_failed', async () => {
    mockQueryResult = [VALID_RECORD];
    mockOwnershipCheckResult = [MOCK_OWNERSHIP_ROW];
    mockFindEventFn = async () => [];
    mockInsertShouldThrow = new Error('DB connection lost');
    mockInsertResult = [];
    const r = await req('POST', '/shipment-events', {
      token: VALID_TOKEN,
      body: { trackingId: 123, eventStatus: 'in_transit' },
    });
    assert.equal(r.status, 500);
    assert.equal(r.data.error, 'agent_shipment_event_failed');
  });

  test('GET /orders/tracking-jobs still 200', async () => {
    mockQueryResult = [VALID_RECORD];
    mockTrackingJobsResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.jobs));
  });

  test('PATCH /shipment-status still 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('PATCH', '/shipment-status', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('POST /run-log still 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/run-log', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });
});
