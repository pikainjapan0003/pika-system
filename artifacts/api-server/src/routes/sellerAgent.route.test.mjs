/**
 * Mock-based route tests for seller agent settings GET/PATCH API (Step 7E-1b)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    @clerk/express mocked — getAuth reads x-test-user-id header
 * DB:      @workspace/db mocked — no real DB connection
 * Runner:  node --experimental-test-module-mocks \
 *            --import /home/runner/workspace/node_modules/.pnpm/node_modules/tsx/dist/esm/index.cjs \
 *            --test src/routes/sellerAgent.route.test.mjs
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// 1. Test constants and helpers
// ─────────────────────────────────────────────────────────────
function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

const TEST_MERCHANT_ID = 'user_test_seller_agent_step7e';
const TEST_STORE_ID    = 42;

// ─────────────────────────────────────────────────────────────
// 2. Controllable mock state — tests run sequentially
// ─────────────────────────────────────────────────────────────
let mockStoreCheckResult = [];    // verifyStoreOwner: storesTable select result
let mockSettingsResult   = [];    // GET: sellerAgentSettingsTable select result
let mockUpsertCapture    = null;  // captures insert().values() call args
let mockUpsertResult     = [];    // insert().onConflictDoUpdate().returning() result
let mockUpsertShouldThrow = null; // set to Error to simulate DB failure

// ─────────────────────────────────────────────────────────────
// 3. Mock @clerk/express BEFORE any dynamic import
//    requireAuth reads x-test-user-id header as the user id
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
// 4. Import drizzle sql() for mock column objects
//    eq() needs SQL-tagged columns, not plain objects
// ─────────────────────────────────────────────────────────────
const { sql } = await import('drizzle-orm');

const mockStoresTable = {
  id:         sql`"stores"."id"`,
  merchantId: sql`"stores"."merchant_id"`,
};

const mockSettingsTable = {
  id:         sql`"seller_agent_settings"."id"`,
  storeId:    sql`"seller_agent_settings"."store_id"`,
  merchantId: sql`"seller_agent_settings"."merchant_id"`,
};

// ─────────────────────────────────────────────────────────────
// 5. Mock @workspace/db
//
//    db.select() dispatches on table identity:
//      - mockStoresTable   → mockStoreCheckResult  (verifyStoreOwner)
//      - mockSettingsTable → mockSettingsResult    (GET settings)
//
//    db.insert() → captures values; returns mockUpsertResult (PATCH upsert)
// ─────────────────────────────────────────────────────────────
mock.module('@workspace/db', {
  namedExports: {
    db: {
      select: () => ({
        from: (table) => ({
          where: () => ({
            limit: async () => {
              if (table === mockStoresTable) return [...mockStoreCheckResult];
              return [...mockSettingsResult];
            },
          }),
        }),
      }),
      insert: (_table) => ({
        values: (vals) => {
          mockUpsertCapture = vals ? { ...vals } : null;
          return {
            onConflictDoUpdate: (_opts) => ({
              returning: async () => {
                if (mockUpsertShouldThrow) throw mockUpsertShouldThrow;
                return [...mockUpsertResult];
              },
            }),
          };
        },
      }),
    },
    sellerAgentSettingsTable: mockSettingsTable,
    storesTable: mockStoresTable,
    pool: { end: async () => {} },
  },
});

// ─────────────────────────────────────────────────────────────
// 6. Dynamic imports AFTER mocks are registered
// ─────────────────────────────────────────────────────────────
const { default: express }           = await import('express');
const { default: sellerAgentRouter } = await import('./sellerAgent.ts');

// ─────────────────────────────────────────────────────────────
// 7. Test Express app
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', sellerAgentRouter);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ─────────────────────────────────────────────────────────────
// 8. HTTP helpers
// ─────────────────────────────────────────────────────────────
async function req(method, path, body, userId = TEST_MERCHANT_ID) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId !== null) headers['x-test-user-id'] = userId;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct  = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

const unauthed = (method, path, body) => req(method, path, body, null);

function ownedStore() {
  mockStoreCheckResult = [{ id: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID }];
}

function wrongOwnerStore() {
  mockStoreCheckResult = [{ id: TEST_STORE_ID, merchantId: 'other_merchant' }];
}

function storeNotFound() {
  mockStoreCheckResult = [];
}

// ─────────────────────────────────────────────────────────────
// 9. Auth — GET
// ─────────────────────────────────────────────────────────────
describe('Auth — GET /stores/:storeId/agent/settings', () => {
  test('no auth header → 401', async () => {
    const r = await unauthed('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.status, 401);
  });

  test('store not found → 404', async () => {
    storeNotFound();
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.status, 404);
  });

  test('wrong store owner → 403', async () => {
    wrongOwnerStore();
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.status, 403);
  });

  test('invalid storeId (non-numeric) → 400', async () => {
    ownedStore();
    const r = await req('GET', '/stores/not-a-number/agent/settings');
    assert.equal(r.status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// 10. Auth — PATCH
// ─────────────────────────────────────────────────────────────
describe('Auth — PATCH /stores/:storeId/agent/settings', () => {
  test('no auth header → 401', async () => {
    const r = await unauthed('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.equal(r.status, 401);
  });

  test('wrong store owner → 403, upsert NOT called', async () => {
    wrongOwnerStore();
    mockUpsertCapture = null;
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.equal(r.status, 403);
    assert.equal(mockUpsertCapture, null, 'upsert must NOT be called on ownership failure');
  });

  test('invalid storeId (non-numeric) → 400', async () => {
    const r = await req('PATCH', '/stores/abc/agent/settings', { agentStatus: 'enabled' });
    assert.equal(r.status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// 11. GET — no row exists → in-memory default (no DB write)
// ─────────────────────────────────────────────────────────────
describe('GET — no row → default response', () => {
  test('returns 200 with data wrapper', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.status, 200);
    assert.ok(r.data.data, 'response must have data wrapper');
  });

  test('default agentStatus = disabled', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.agentStatus, 'disabled');
  });

  test('default agentMode = rule_worker', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.agentMode, 'rule_worker');
  });

  test('default queryFrequency = manual', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.queryFrequency, 'manual');
  });

  test('default webhookEnabled = false', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.webhookEnabled, false);
  });

  test('default hasWebhookSecret = false', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.hasWebhookSecret, false);
  });

  test('response does NOT contain webhookSecretHash', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('webhookSecretHash'), 'webhookSecretHash must not appear in response');
  });

  test('response does NOT contain webhookSecret key', async () => {
    ownedStore();
    mockSettingsResult = [];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(r.data.data, 'webhookSecret'),
      'webhookSecret key must not be in response.data'
    );
  });

  test('GET no-row does NOT call upsert (no DB write)', async () => {
    ownedStore();
    mockSettingsResult = [];
    mockUpsertCapture = null;
    await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(mockUpsertCapture, null, 'GET must not trigger any DB insert/upsert');
  });
});

// ─────────────────────────────────────────────────────────────
// 12. GET — row exists → safe response (no hash exposure)
// ─────────────────────────────────────────────────────────────

const MOCK_SECRET_HASH = sha256('existing_webhook_secret_abc_xyz');

const MOCK_DB_ROW = {
  id: 1,
  storeId: TEST_STORE_ID,
  merchantId: TEST_MERCHANT_ID,
  agentStatus: 'enabled',
  agentMode: 'rule_worker',
  enabledLogistics: ['seven_eleven', 'family_mart'],
  queryMethods: ['manual', 'csv_import'],
  queryFrequency: 'daily',
  notifyOnUnknown: true,
  requireConfirmOnException: true,
  requireConfirmOnReturned: false,
  requireConfirmOnDelivered: false,
  hideErrorDetailsFromBuyer: true,
  webhookEnabled: true,
  webhookUrl: null,
  webhookSecretHash: MOCK_SECRET_HASH,
  lastTestRunAt: null,
  lastRunAt: new Date('2026-06-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-09T00:00:00Z'),
};

describe('GET — row exists → safe response', () => {
  test('returns 200', async () => {
    ownedStore();
    mockSettingsResult = [MOCK_DB_ROW];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.status, 200);
  });

  test('hasWebhookSecret = true when hash is present in DB', async () => {
    ownedStore();
    mockSettingsResult = [MOCK_DB_ROW];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.hasWebhookSecret, true);
  });

  test('webhookSecretHash field and value NOT in response body', async () => {
    ownedStore();
    mockSettingsResult = [MOCK_DB_ROW];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('webhookSecretHash'), 'field name must not appear');
    assert.ok(!body.includes(MOCK_SECRET_HASH), 'hash value must not appear');
  });

  test('webhookSecret key NOT in response', async () => {
    ownedStore();
    mockSettingsResult = [MOCK_DB_ROW];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.ok(!Object.prototype.hasOwnProperty.call(r.data.data, 'webhookSecret'));
  });

  test('enabledLogistics array returned correctly from DB row', async () => {
    ownedStore();
    mockSettingsResult = [MOCK_DB_ROW];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.deepEqual(r.data.data.enabledLogistics, ['seven_eleven', 'family_mart']);
  });

  test('hasWebhookSecret = false when row has null hash', async () => {
    ownedStore();
    mockSettingsResult = [{ ...MOCK_DB_ROW, webhookSecretHash: null }];
    const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
    assert.equal(r.data.data.hasWebhookSecret, false);
    assert.ok(!JSON.stringify(r.data).includes('webhookSecretHash'));
  });
});

// ─────────────────────────────────────────────────────────────
// 13. PATCH — forbidden and unknown keys → 400
// ─────────────────────────────────────────────────────────────
describe('PATCH — forbidden and unknown keys → 400', () => {
  test('unknown key → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { unknownField: 'value' });
    assert.equal(r.status, 400);
  });

  test('forbidden key storeId → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { storeId: 99 });
    assert.equal(r.status, 400);
  });

  test('forbidden key merchantId → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { merchantId: 'other' });
    assert.equal(r.status, 400);
  });

  test('forbidden key id → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { id: 1 });
    assert.equal(r.status, 400);
  });

  test('forbidden key webhookSecretHash → 400 (hash cannot be set directly)', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecretHash: 'some_hash' });
    assert.equal(r.status, 400);
  });

  test('forbidden key lastRunAt → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { lastRunAt: '2026-06-09T00:00:00Z' });
    assert.equal(r.status, 400);
  });

  test('empty body → 400 (no patchable fields provided)', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {});
    assert.equal(r.status, 400);
  });
});

// ─────────────────────────────────────────────────────────────
// 14. PATCH — agentMode validation (platform_managed_reserved rejection)
// ─────────────────────────────────────────────────────────────
describe('PATCH — agentMode validation', () => {
  test('agentMode = platform_managed_reserved → 400 with error field', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
      agentMode: 'platform_managed_reserved',
    });
    assert.equal(r.status, 400);
    assert.ok(r.data.error, 'error field must be present');
  });

  test('agentMode = unknown_mode → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentMode: 'made_up_mode' });
    assert.equal(r.status, 400);
  });

  test('agentMode = rule_worker → 200 (valid seller mode)', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [{
      id: 1, storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID,
      agentStatus: 'disabled', agentMode: 'rule_worker',
      enabledLogistics: [], queryMethods: ['manual'], queryFrequency: 'manual',
      notifyOnUnknown: true, requireConfirmOnException: true, requireConfirmOnReturned: false,
      requireConfirmOnDelivered: false, hideErrorDetailsFromBuyer: true,
      webhookEnabled: false, webhookUrl: null, webhookSecretHash: null,
      lastTestRunAt: null, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
    }];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentMode: 'rule_worker' });
    assert.equal(r.status, 200);
  });

  test('agentMode = self_hosted_webhook → 200 (valid seller mode)', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [{
      id: 1, storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID,
      agentStatus: 'disabled', agentMode: 'self_hosted_webhook',
      enabledLogistics: [], queryMethods: ['manual'], queryFrequency: 'manual',
      notifyOnUnknown: true, requireConfirmOnException: true, requireConfirmOnReturned: false,
      requireConfirmOnDelivered: false, hideErrorDetailsFromBuyer: true,
      webhookEnabled: false, webhookUrl: null, webhookSecretHash: null,
      lastTestRunAt: null, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
    }];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentMode: 'self_hosted_webhook' });
    assert.equal(r.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────
// 15. PATCH — webhookSecret hashing (security critical)
// ─────────────────────────────────────────────────────────────

const PLAINTEXT_SECRET  = 'my_super_secret_webhook_key_1234';
const EXPECTED_HASH     = sha256(PLAINTEXT_SECRET);

const MOCK_RETURN_WITH_HASH = {
  id: 1, storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID,
  agentStatus: 'disabled', agentMode: 'rule_worker',
  enabledLogistics: [], queryMethods: ['manual'], queryFrequency: 'manual',
  notifyOnUnknown: true, requireConfirmOnException: true, requireConfirmOnReturned: false,
  requireConfirmOnDelivered: false, hideErrorDetailsFromBuyer: true,
  webhookEnabled: false, webhookUrl: null,
  webhookSecretHash: EXPECTED_HASH,
  lastTestRunAt: null, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('PATCH — webhookSecret hashing', () => {
  test('upsert receives SHA-256 hash — not plaintext', async () => {
    ownedStore();
    mockUpsertCapture = null;
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_RETURN_WITH_HASH];
    await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: PLAINTEXT_SECRET });
    assert.ok(mockUpsertCapture, 'upsert must be called');
    assert.equal(mockUpsertCapture.webhookSecretHash, EXPECTED_HASH, 'DB must receive SHA-256 hash');
  });

  test('upsert does NOT store webhookSecret plaintext', async () => {
    ownedStore();
    mockUpsertCapture = null;
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_RETURN_WITH_HASH];
    await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: PLAINTEXT_SECRET });
    assert.ok(
      !Object.prototype.hasOwnProperty.call(mockUpsertCapture, 'webhookSecret'),
      'plaintext must not be forwarded to DB insert call'
    );
  });

  test('response does NOT contain webhookSecretHash field or value', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_RETURN_WITH_HASH];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: PLAINTEXT_SECRET });
    assert.equal(r.status, 200);
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes('webhookSecretHash'), 'field name must not appear in response');
    assert.ok(!body.includes(EXPECTED_HASH), 'hash value must not appear in response');
  });

  test('response does NOT contain webhookSecret (plaintext)', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_RETURN_WITH_HASH];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: PLAINTEXT_SECRET });
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes(PLAINTEXT_SECRET), 'plaintext must not appear in response');
    assert.ok(
      !Object.prototype.hasOwnProperty.call(r.data.data, 'webhookSecret'),
      'webhookSecret key must not be in response.data'
    );
  });

  test('response hasWebhookSecret = true after setting secret', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_RETURN_WITH_HASH];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: PLAINTEXT_SECRET });
    assert.equal(r.data.data.hasWebhookSecret, true);
  });

  test('webhookSecret too short (< 16 chars) → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: 'short' });
    assert.equal(r.status, 400);
  });

  test('webhookSecret = null → clears secret (upsert receives webhookSecretHash: null)', async () => {
    ownedStore();
    mockUpsertCapture = null;
    mockUpsertShouldThrow = null;
    mockUpsertResult = [{ ...MOCK_RETURN_WITH_HASH, webhookSecretHash: null }];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { webhookSecret: null });
    assert.equal(r.status, 200);
    assert.ok(mockUpsertCapture, 'upsert must be called');
    assert.equal(mockUpsertCapture.webhookSecretHash, null, 'hash must be null to clear the secret');
    assert.equal(r.data.data.hasWebhookSecret, false, 'hasWebhookSecret must be false after clearing');
  });
});

// ─────────────────────────────────────────────────────────────
// 16. PATCH — upsert success
// ─────────────────────────────────────────────────────────────

const MOCK_UPSERT_RETURN = {
  id: 1, storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID,
  agentStatus: 'enabled', agentMode: 'rule_worker',
  enabledLogistics: [], queryMethods: ['manual'], queryFrequency: 'manual',
  notifyOnUnknown: true, requireConfirmOnException: true, requireConfirmOnReturned: false,
  requireConfirmOnDelivered: false, hideErrorDetailsFromBuyer: true,
  webhookEnabled: false, webhookUrl: null, webhookSecretHash: null,
  lastTestRunAt: null, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('PATCH — upsert success', () => {
  test('200, upsert receives storeId from URL params', async () => {
    ownedStore();
    mockUpsertCapture = null;
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_UPSERT_RETURN];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.equal(r.status, 200);
    assert.ok(mockUpsertCapture, 'upsert must be called');
    assert.equal(mockUpsertCapture.storeId, TEST_STORE_ID, 'storeId must come from URL params');
  });

  test('upsert receives merchantId from Clerk session (not body)', async () => {
    ownedStore();
    mockUpsertCapture = null;
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_UPSERT_RETURN];
    await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.equal(mockUpsertCapture.merchantId, TEST_MERCHANT_ID, 'merchantId must come from Clerk session');
  });

  test('response has data wrapper with correct agentStatus', async () => {
    ownedStore();
    mockUpsertShouldThrow = null;
    mockUpsertResult = [MOCK_UPSERT_RETURN];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.ok(r.data.data, 'response must have data wrapper');
    assert.equal(r.data.data.agentStatus, 'enabled');
  });

  test('agentStatus = invalid_value → 400', async () => {
    ownedStore();
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'super_enabled' });
    assert.equal(r.status, 400);
  });

  test('DB error → 500', async () => {
    ownedStore();
    mockUpsertShouldThrow = new Error('DB connection lost');
    mockUpsertResult = [];
    const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, { agentStatus: 'enabled' });
    assert.equal(r.status, 500);
    mockUpsertShouldThrow = null; // reset for subsequent tests
  });
});
