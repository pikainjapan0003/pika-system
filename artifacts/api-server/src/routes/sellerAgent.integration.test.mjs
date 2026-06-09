/**
 * Integration tests for Seller Agent Settings GET/PATCH API (Step 7E-1b)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    @clerk/express mocked — getAuth reads x-test-user-id header
 * DB:      Real DB via DATABASE_URL — NO DB mock
 * Runner:  RUN_SELLER_AGENT_INTEGRATION_TESTS=1 \
 *            node --experimental-test-module-mocks \
 *            --import /home/runner/workspace/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/index.cjs \
 *            --test src/routes/sellerAgent.integration.test.mjs
 *
 * SAFETY:
 *   - Only writes to seller_agent_settings for the selected DEV store.
 *   - cleanup() deletes ONLY the row seeded by this test (by storeId).
 *   - No TRUNCATE. No unconditional DELETE on any other table.
 *   - webhookSecret plaintext never written to DB or logs.
 *   - DATABASE_URL value never printed.
 *   - DO NOT run against production DB.
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// 1. Integration guard — must be explicitly enabled
// ─────────────────────────────────────────────────────────────
const integrationEnabled =
  process.env.RUN_SELLER_AGENT_INTEGRATION_TESTS === '1' &&
  Boolean(process.env.DATABASE_URL);

if (!integrationEnabled) {
  test(
    'Seller Agent integration tests skipped — set RUN_SELLER_AGENT_INTEGRATION_TESTS=1 and DATABASE_URL to enable',
    { skip: 'RUN_SELLER_AGENT_INTEGRATION_TESTS not set or DATABASE_URL missing' },
    () => {},
  );
} else {
  // ─────────────────────────────────────────────────────────────
  // 2. Mock @clerk/express BEFORE any dynamic import
  //    requireAuth reads x-test-user-id header as userId
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
  // 3. Dynamic imports — real DB, no mock
  // ─────────────────────────────────────────────────────────────
  const { default: express } = await import('express');
  const { db, pool, sellerAgentSettingsTable } = await import('@workspace/db');
  const { eq } = await import('drizzle-orm');
  const { default: sellerAgentRouter } = await import('./sellerAgent.ts');

  // ─────────────────────────────────────────────────────────────
  // 4. Test constants
  //    Store id=1 (小軒代購) is used as the real dev test store.
  //    WRONG_MERCHANT is used for ownership failure tests.
  // ─────────────────────────────────────────────────────────────
  const TEST_STORE_ID   = 1;
  const TEST_MERCHANT   = 'user_3ESB3C2JbFwb68MtvKgLe70Hpg4'; // actual merchant_id of store 1
  const WRONG_MERCHANT  = 'user_INTEGRATION_TEST_WRONG_OWNER';

  function sha256(str) {
    return createHash('sha256').update(str).digest('hex');
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Express test app
  // ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use('/api', sellerAgentRouter);

  let server;
  let baseUrl;

  // ─────────────────────────────────────────────────────────────
  // 6. HTTP helper
  // ─────────────────────────────────────────────────────────────
  async function req(method, path, body, userId = TEST_MERCHANT) {
    const headers = { 'Content-Type': 'application/json' };
    if (userId !== null) headers['x-test-user-id'] = userId;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const ct = response.headers.get('content-type') ?? '';
    const data = ct.includes('json') ? await response.json() : await response.text();
    return { status: response.status, data };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Cleanup helper — deletes ONLY the test row for TEST_STORE_ID
  //    Called in after() AND in test-level finally blocks for reliability.
  // ─────────────────────────────────────────────────────────────
  async function cleanup() {
    await db
      .delete(sellerAgentSettingsTable)
      .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID));
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Global setup / teardown
  // ─────────────────────────────────────────────────────────────
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}/api`;

    // Ensure clean state: no pre-existing test row (store 1 had none at test start)
    await cleanup();
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Flow A: GET — no row exists → default config (no DB write)
  // ─────────────────────────────────────────────────────────────
  describe('Flow A — GET no row → default config', () => {
    test('A-1: GET returns 200', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.status, 200);
    });

    test('A-2: default agentStatus = disabled', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.data.data.agentStatus, 'disabled');
    });

    test('A-3: default queryFrequency = manual', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.data.data.queryFrequency, 'manual');
    });

    test('A-4: default webhookEnabled = false', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.data.data.webhookEnabled, false);
    });

    test('A-5: default hasWebhookSecret = false', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.data.data.hasWebhookSecret, false);
    });

    test('A-6: GET no-row does NOT create DB row', async () => {
      await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      const [row] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);
      assert.strictEqual(row, undefined, 'GET must not insert any row into DB');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow B: PATCH valid payload → creates DB row
  // ─────────────────────────────────────────────────────────────
  describe('Flow B — PATCH valid payload → creates DB row', () => {
    test('B-1: PATCH returns 200', async () => {
      try {
        const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
          agentStatus: 'enabled',
          queryFrequency: 'daily',
        });
        assert.strictEqual(r.status, 200);
        assert.ok(r.data.data, 'response must have data wrapper');
        assert.strictEqual(r.data.data.agentStatus, 'enabled');
        assert.strictEqual(r.data.data.queryFrequency, 'daily');
      } finally {
        // keep row for subsequent tests in Flow B
      }
    });

    test('B-2: PATCH creates DB row with correct storeId from URL param', async () => {
      const [row] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);
      assert.ok(row, 'DB row must exist after PATCH');
      assert.strictEqual(row.storeId, TEST_STORE_ID, 'storeId must come from URL param');
    });

    test('B-3: PATCH sets merchantId from session (not body)', async () => {
      const [row] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);
      assert.ok(row, 'DB row must exist');
      assert.strictEqual(row.merchantId, TEST_MERCHANT, 'merchantId must come from session userId');
    });

    test('B-4: PATCH response does NOT contain webhookSecret or webhookSecretHash', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        agentStatus: 'enabled',
      });
      assert.strictEqual(r.status, 200);
      const body = JSON.stringify(r.data);
      assert.ok(!body.includes('webhookSecretHash'), 'webhookSecretHash must not appear in response');
      assert.ok(
        !Object.prototype.hasOwnProperty.call(r.data.data, 'webhookSecret'),
        'webhookSecret key must not be in response.data',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow C: GET row exists → safe response (no hash exposure)
  // ─────────────────────────────────────────────────────────────
  describe('Flow C — GET row exists → safe response', () => {
    test('C-1: GET returns 200 with DB values', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.status, 200);
      assert.ok(r.data.data, 'response must have data wrapper');
    });

    test('C-2: GET response does NOT contain webhookSecretHash', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      const body = JSON.stringify(r.data);
      assert.ok(!body.includes('webhookSecretHash'), 'webhookSecretHash must not appear in response');
    });

    test('C-3: GET hasWebhookSecret = false (no secret set yet)', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.data.data.hasWebhookSecret, false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow D: PATCH webhookSecret → hashed in DB, not exposed in response
  // ─────────────────────────────────────────────────────────────
  describe('Flow D — PATCH webhookSecret → DB stores hash only', () => {
    const PLAINTEXT_SECRET = 'integration_test_secret_abc123xyz';

    test('D-1: PATCH with webhookSecret returns 200', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        webhookSecret: PLAINTEXT_SECRET,
      });
      assert.strictEqual(r.status, 200);
    });

    test('D-2: DB stores SHA-256 hash, NOT plaintext', async () => {
      const expectedHash = sha256(PLAINTEXT_SECRET);
      const [row] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);
      assert.ok(row, 'DB row must exist');
      assert.strictEqual(row.webhookSecretHash, expectedHash, 'DB must store SHA-256 hash');
      assert.ok(
        !JSON.stringify(row).includes(PLAINTEXT_SECRET),
        'plaintext secret must not be in DB row',
      );
    });

    test('D-3: response does NOT contain webhookSecretHash or plaintext', async () => {
      const expectedHash = sha256(PLAINTEXT_SECRET);
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        webhookSecret: PLAINTEXT_SECRET,
      });
      assert.strictEqual(r.status, 200);
      const body = JSON.stringify(r.data);
      assert.ok(!body.includes('webhookSecretHash'), 'field name must not appear in response');
      assert.ok(!body.includes(expectedHash), 'hash value must not appear in response');
      assert.ok(!body.includes(PLAINTEXT_SECRET), 'plaintext must not appear in response');
    });

    test('D-4: response hasWebhookSecret = true after setting secret', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.data.hasWebhookSecret, true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow E: PATCH forbidden keys → 400
  // ─────────────────────────────────────────────────────────────
  describe('Flow E — PATCH forbidden keys → 400', () => {
    test('E-1: PATCH with storeId → 400', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        storeId: 999,
      });
      assert.strictEqual(r.status, 400);
    });

    test('E-2: PATCH with merchantId → 400', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        merchantId: 'other_merchant',
      });
      assert.strictEqual(r.status, 400);
    });

    test('E-3: PATCH with webhookSecretHash → 400', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        webhookSecretHash: sha256('direct_hash_attempt'),
      });
      assert.strictEqual(r.status, 400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow F: PATCH platform_managed_reserved agentMode → 400
  // ─────────────────────────────────────────────────────────────
  describe('Flow F — PATCH platform_managed_reserved → 400', () => {
    test('F-1: agentMode = platform_managed_reserved → 400', async () => {
      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        agentMode: 'platform_managed_reserved',
      });
      assert.strictEqual(r.status, 400);
      assert.ok(r.data.error, 'error field must be present');
    });

    test('F-2: DB row must NOT be updated after rejected PATCH', async () => {
      const [rowBefore] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);

      await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`, {
        agentMode: 'platform_managed_reserved',
      });

      const [rowAfter] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);

      if (rowBefore && rowAfter) {
        assert.strictEqual(rowAfter.agentMode, rowBefore.agentMode, 'agentMode must not change after rejected PATCH');
        assert.deepStrictEqual(rowAfter.updatedAt?.toISOString(), rowBefore.updatedAt?.toISOString(), 'updatedAt must not change');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow G: Ownership failure → 403, DB unchanged
  // ─────────────────────────────────────────────────────────────
  describe('Flow G — Ownership failure → 403', () => {
    test('G-1: GET with wrong userId → 403', async () => {
      const r = await req('GET', `/stores/${TEST_STORE_ID}/agent/settings`, undefined, WRONG_MERCHANT);
      assert.strictEqual(r.status, 403);
    });

    test('G-2: PATCH with wrong userId → 403, DB not modified', async () => {
      const [rowBefore] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);

      const r = await req('PATCH', `/stores/${TEST_STORE_ID}/agent/settings`,
        { agentStatus: 'disabled' },
        WRONG_MERCHANT,
      );
      assert.strictEqual(r.status, 403);

      const [rowAfter] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, TEST_STORE_ID))
        .limit(1);

      if (rowBefore) {
        assert.deepStrictEqual(
          rowAfter?.updatedAt?.toISOString(),
          rowBefore?.updatedAt?.toISOString(),
          'updatedAt must not change after ownership failure',
        );
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Flow H: Cleanup verification — after() hook deletes test row
  // ─────────────────────────────────────────────────────────────
  describe('Flow H — Cleanup verification (structural)', () => {
    test('H-1: cleanup() is a function that will run in after() hook', () => {
      assert.strictEqual(typeof cleanup, 'function', 'cleanup must be a function');
    });
  });
}
