/**
 * Integration tests for CVS routes — auth enforcement (Step 6C-0 / 6C-0b)
 *
 * Runtime: Node.js v24 built-in test runner (node:test)
 * Auth:    @clerk/express is mocked — getAuth reads x-test-user-id header
 * DB:      Real DB via DATABASE_URL (read-only tests; no data written)
 * Runner:  node --experimental-test-module-mocks --import /path/to/tsx/dist/esm/index.mjs --test src/routes/cvs.route.test.mjs
 *
 * PENDING DECISION (Step 6C-0b):
 *   POST /cvs/711/import-from-emap is currently guarded by requireAuth only.
 *   The project has no admin/role model (only requireAuth + verifyStoreOwner(storeId)).
 *   A "403 — authenticated but not owner/admin" test cannot be added until a product/engineering
 *   decision is made on one of these options:
 *     A) Add storeId scoping to this endpoint and use verifyStoreOwner.
 *     B) Introduce an admin/role concept in the stores schema or a separate mechanism.
 *     C) Disable / remove this endpoint until emap compliance and access scope are confirmed.
 *   See cvs.ts comment for full options.
 */

import { mock, describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

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
const { default: express }      = await import('express');
const { pool }                  = await import('@workspace/db');
const { default: cvsRouter }    = await import('./cvs.ts');

// ─────────────────────────────────────────────────────────────
// 3. Minimal test Express app
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', cvsRouter);

// ─────────────────────────────────────────────────────────────
// 4. Shared state
// ─────────────────────────────────────────────────────────────
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// ─────────────────────────────────────────────────────────────
// 5. HTTP helper
// ─────────────────────────────────────────────────────────────
async function req(method, path, body, userId = 'test_merchant') {
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
// 6. POST /cvs/711/import-from-emap — auth guard
// ─────────────────────────────────────────────────────────────
describe('POST /cvs/711/import-from-emap — auth', () => {
  test('401 — unauthenticated request is rejected before reaching emap', async () => {
    const { status, data } = await req('POST', '/cvs/711/import-from-emap', { query: 'test' }, null);
    assert.strictEqual(status, 401, `expected 401, got ${status}: ${JSON.stringify(data)}`);
  });

  test('400 — authenticated but missing query body returns 400 (not 401)', async () => {
    // Verifies auth passes and route logic is reached; emap not called due to validation error.
    const { status } = await req('POST', '/cvs/711/import-from-emap', {}, 'test_merchant');
    assert.strictEqual(status, 400);
  });

  // TODO (Step 6C-0b pending decision): add 403 test once a role/owner guard is implemented.
  // Cannot test "authenticated but no permission → 403" because the project has no admin/role
  // model. verifyStoreOwner(storeId) requires a storeId, which this endpoint does not have.
  // Options: (A) add storeId param, (B) add admin role, (C) disable endpoint.
  test('role guard pending — no admin model exists yet (todo)', { todo: 'requires product/engineering decision on access scope (Step 6C-0b)' }, async () => {});
});

// ─────────────────────────────────────────────────────────────
// 7. GET /cvs/stores — must remain public (no regression)
// ─────────────────────────────────────────────────────────────
describe('GET /cvs/stores — remains public', () => {
  test('200 — unauthenticated request is allowed', async () => {
    const { status, data } = await req('GET', '/cvs/stores', null, null);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.ok(Array.isArray(data.stores), 'should return { stores: [...] }');
  });
});

// ─────────────────────────────────────────────────────────────
// 8. GET /cvs/regions — must remain public (no regression)
// ─────────────────────────────────────────────────────────────
describe('GET /cvs/regions — remains public', () => {
  test('200 — unauthenticated request is allowed', async () => {
    const { status, data } = await req('GET', '/cvs/regions', null, null);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.ok(Array.isArray(data.cities), 'should return { cities: [...] }');
  });
});
