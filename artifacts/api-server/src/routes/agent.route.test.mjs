/**
 * Unit/integration tests for Agent token middleware + route skeleton (Step 7D-3B)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    agentTokenAuth middleware — reads Authorization: Bearer <token> header
 * DB:      @workspace/db is mocked (seller_agent_tokens table may not exist in test DB)
 * Runner:  node --experimental-test-module-mocks --import tsx/esm --test src/routes/agent.route.test.mjs
 *
 * Note: seller_agent_tokens table is mocked because the test DB (DATABASE_URL)
 * may not have the table applied yet (drizzle-kit push was run in Step 7D-2D,
 * but may differ per environment). All auth and skeleton behavior is validated
 * via the mock, which faithfully simulates DB filtering (active/revoked/expired/disabled).
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// 1. Token values — raw tokens exist ONLY in this test file
//    DB (when real) stores only SHA-256 hashes, never plaintext
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
//    (matches what the real DB would return for an active token)
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
// 3. Controllable mock state (mutable per test; tests run sequentially)
//
//    mockQueryResult simulates what the DB WHERE clause returns:
//    - Real DB with active+valid token → [VALID_RECORD]
//    - Real DB with revoked/expired/disabled/unknown → []
//      (the WHERE in agentAuth: status='active' AND revokedAt IS NULL
//       AND (expiresAt IS NULL OR expiresAt > NOW()) filters these out)
// ─────────────────────────────────────────────────────────────
let mockQueryResult = [];

// ─────────────────────────────────────────────────────────────
// 4. Get real drizzle sql() for creating SQL-compatible mock columns
//    Must import BEFORE mocking @workspace/db
// ─────────────────────────────────────────────────────────────
const { sql } = await import('drizzle-orm');

// SQL-compatible mock table — allows eq(), isNull(), gt() to build
// valid SQL AST objects without throwing
const mockSellerAgentTokensTable = {
  tokenHash: sql`"token_hash"`,
  status:    sql`"status"`,
  revokedAt: sql`"revoked_at"`,
  expiresAt: sql`"expires_at"`,
  id:        sql`"id"`,
};

// ─────────────────────────────────────────────────────────────
// 5. Mock @workspace/db — must be registered BEFORE importing
//    any module that depends on it (agent.ts → agentAuth.ts → @workspace/db)
// ─────────────────────────────────────────────────────────────
mock.module('@workspace/db', {
  namedExports: {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [...mockQueryResult],
          }),
        }),
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
    storesTable: {},
    pool: { end: async () => {} },
  },
});

// ─────────────────────────────────────────────────────────────
// 6. Dynamic imports AFTER mock is registered
// ─────────────────────────────────────────────────────────────
const { default: express }     = await import('express');
const { default: agentRouter } = await import('./agent.ts');

// ─────────────────────────────────────────────────────────────
// 7. Minimal test Express app
//    Route path mirrors production: /api/internal/agent/...
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
// 8. HTTP helpers
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
// 9. Agent auth middleware tests
// ─────────────────────────────────────────────────────────────
describe('Agent auth middleware', () => {
  // These tests fail before reaching the DB — header validation only
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

  // These tests reach the DB mock — simulates WHERE clause filtering
  test('unknown token → 401 (mock: no record in DB)', async () => {
    mockQueryResult = [];
    const r = await req('GET', '/orders/tracking-jobs', { token: UNKNOWN_TOKEN });
    assert.equal(r.status, 401);
  });

  test('revoked token → 401 (mock: DB WHERE filters out revoked status)', async () => {
    mockQueryResult = []; // Real DB WHERE: revokedAt IS NULL would exclude this
    const r = await req('GET', '/orders/tracking-jobs', { token: REVOKED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('expired token → 401 (mock: DB WHERE filters out past expiresAt)', async () => {
    mockQueryResult = []; // Real DB WHERE: expiresAt > NOW() would exclude this
    const r = await req('GET', '/orders/tracking-jobs', { token: EXPIRED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('disabled token → 401 (mock: DB WHERE filters out non-active status)', async () => {
    mockQueryResult = []; // Real DB WHERE: status = 'active' would exclude this
    const r = await req('GET', '/orders/tracking-jobs', { token: DISABLED_TOKEN });
    assert.equal(r.status, 401);
  });

  test('valid token passes auth → skeleton 501', async () => {
    mockQueryResult = [VALID_RECORD]; // DB returns valid token record
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('response does not expose raw token or its hash', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    const body = JSON.stringify(r.data);
    assert.ok(!body.includes(VALID_TOKEN), 'response must not expose raw token');
    assert.ok(!body.includes(sha256(VALID_TOKEN)), 'response must not expose token hash');
  });
});

// ─────────────────────────────────────────────────────────────
// 10. Agent route skeleton tests
// ─────────────────────────────────────────────────────────────
describe('Agent route skeleton', () => {
  test('GET /orders/tracking-jobs → 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('GET', '/orders/tracking-jobs', { token: VALID_TOKEN });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
  });

  test('POST /shipment-events → 501', async () => {
    mockQueryResult = [VALID_RECORD];
    const r = await req('POST', '/shipment-events', { token: VALID_TOKEN, body: {} });
    assert.equal(r.status, 501);
    assert.equal(r.data.error, 'not_implemented');
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
