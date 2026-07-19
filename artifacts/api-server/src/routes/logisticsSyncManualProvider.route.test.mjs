/**
 * Step 7N-I — manual-provider route tests（postoffice / tcat 手動查詢）。
 *
 * Pattern follows the other route tests: node:test, Clerk mocked via
 * x-test-user-id header, real dev DB. Test data created in before() and
 * deleted in after()（store cascade）。dryRun 案例不打外部（gate 前就被拒），
 * 200 dryRun 案例以 mock adapter 注入？—— route 不暴露 deps，故 200 dryRun
 * 案例對 postoffice / tcat 用已驗證的真實歷史單號（7M smoke 同款），僅外部讀取不寫 DB。
 *
 * Run via: node scripts/step7/test-manual-provider-route.mjs
 */

import { mock, describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const PREVIOUS_MANUAL_COMMIT_ENABLED =
  process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;
process.env.LOGISTICS_MANUAL_COMMIT_ENABLED = "true";

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

// Step 7N-J2：mock 兩個 provider adapter（fixture 回應），整套測試不打真外部站台。
// 同時用計數器驗證「被 gate 擋下的請求完全沒有觸發外部查詢」。
let adapterCallCount = 0;
const fixtureResult =
  (provider, latestStatusText, latestEventAt, occurredAtList) =>
  (trackingCode) => ({
    ok: true,
    provider,
    trackingCode,
    normalizedStatus: "delivered",
    latestStatusText,
    latestEventAt,
    events: occurredAtList.map((occurredAt, i) => ({
      eventStatus: latestStatusText,
      eventDescription: latestStatusText,
      eventLocation: `fixture-${i}`,
      occurredAt,
      rawData: { fixture: true },
    })),
    rawSummary: { fixture: true },
  });
let poFixture = fixtureResult("postoffice", "投遞成功", "2026/06/08 11:21:53", [
  "2026/06/08 11:21:53",
  "2026/06/08 08:10:00",
  "2026/06/07 19:02:11",
  "2026/06/07 10:30:45",
  "2026/06/06 15:00:00",
]);
let tcatFixture = fixtureResult("tcat", "順利送達", "2026/05/29 08:31", [
  "2026/05/29 08:31",
  "2026/05/29 07:00",
  "2026/05/28 22:15",
  "2026/05/28 21:15",
  "2026/05/28 18:40",
]);
// J4C drift test：兩次外部查詢之間切換 fixture（closure captures variable binding）
const DEFAULT_PO_FIXTURE = poFixture;
const poDriftFixture = fixtureResult(
  "postoffice",
  "轉寄成功",
  "2026/06/13 09:00:00",
  [
    "2026/06/13 09:00:00",
    "2026/06/08 11:21:53",
    "2026/06/08 08:10:00",
    "2026/06/07 19:02:11",
    "2026/06/07 10:30:45",
    "2026/06/06 15:00:00",
  ],
);

mock.module(
  path.join(
    ROOT,
    "artifacts/api-server/src/lib/logistics/adapters/postOfficeAdapter.ts",
  ),
  {
    namedExports: {
      queryPostOfficeTracking: async ({ trackingCode }) => {
        adapterCallCount++;
        return poFixture(trackingCode);
      },
    },
  },
);
mock.module(
  path.join(
    ROOT,
    "artifacts/api-server/src/lib/logistics/adapters/tcatAdapter.ts",
  ),
  {
    namedExports: {
      queryTcatTracking: async ({ trackingCode }) => {
        adapterCallCount++;
        return tcatFixture(trackingCode);
      },
    },
  },
);

// Step 7O：mock sevenElevenAdapter（不打真外部 + 不需要 tesseract）
let sevenElevenAdapterCallCount = 0;
mock.module(
  path.join(
    ROOT,
    "artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts",
  ),
  {
    namedExports: {
      trackSevenElevenShipment: async ({ trackingCode }) => {
        sevenElevenAdapterCallCount++;
        return {
          ok: true,
          provider: "711",
          trackingCode,
          latestStatus: "配達取件門市",
          pickupStoreName: "台北測試門市",
          pickupDeadline: "2026/06/20",
          events: [
            {
              occurredAt: "2026/06/15 10:00:00",
              statusText: "配達取件門市",
              rawText: "配達取件門市",
            },
            {
              occurredAt: "2026/06/14 08:00:00",
              statusText: "物流中心出貨",
              rawText: "物流中心出貨",
            },
          ],
        };
      },
      bridgeSevenElevenResult: (result) => {
        if (!result.ok) {
          return {
            ok: false,
            provider: "711",
            trackingCode: result.trackingCode,
            errorCode: result.errorCode,
            message: result.message,
            retryable: false,
          };
        }
        const events = result.events.map((e) => ({
          eventStatus: e.statusText,
          eventDescription: e.statusText || e.rawText,
          eventLocation: null,
          occurredAt: e.occurredAt,
          rawData: {},
        }));
        return {
          ok: true,
          provider: "711",
          trackingCode: result.trackingCode,
          normalizedStatus: "arrived_store",
          latestStatusText: result.latestStatus,
          latestEventAt: events[0]?.occurredAt ?? null,
          events,
          rawSummary: {
            pickupStoreName: result.pickupStoreName ?? null,
            pickupDeadline: result.pickupDeadline ?? null,
            eventCount: events.length,
          },
        };
      },
      normalizeSevenElevenStatus: () => "arrived_store",
    },
  },
);

const { default: express } = await import("express");
const { pool } = await import("@workspace/db");
const { default: logisticsSyncRouter } = await import(
  path.join(ROOT, "artifacts/api-server/src/routes/logisticsSync.ts")
);

const app = express();
app.use(express.json());
app.use("/api", logisticsSyncRouter);

const TEST_USER = "manual-provider-test-user";
const OTHER_USER = "manual-provider-other-user";
// Step 7N-I8B：原本用 7M smoke 的真實單號 97300922002170830005，但該號現已被
// 正式訂單 #1012 的 tracking row 占用（DB unique index provider+code），改用
// 合成單號。外部查詢會回 empty，dryRun 200 案例斷言放寬為 success|empty；
// postoffice 的 success 解析路徑由 adapter 測試與 tcat 案例覆蓋。
const PO_CODE = `9730092200217084${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
const TCAT_CODE = "135063214096";

let server, baseUrl, storeId, otherStoreId, productId;
let poTrackingId, tcatTrackingId, otherStoreTrackingId;
// J4C commit test rows（合成單號，不使用 #1012 / id=153）
let poCommitId, tcatCommitId, inactiveCommitId, driftCommitId;
const PO_COMMIT_CODE = `PO-J4C-${Math.floor(Math.random() * 1e9)}`;
const TCAT_COMMIT_CODE = `TC-J4C-${Math.floor(Math.random() * 1e9)}`;
const PO_DRIFT_CODE = `PO-DRIFT-${Math.floor(Math.random() * 1e9)}`;
const PO_INACTIVE_CODE = `PO-INACT-${Math.floor(Math.random() * 1e9)}`;
// Step 7O：7-11 preview test row（mock adapter，不打真外部）
let sevenElevenTrackingId;
const SE_CODE = `711-TEST-${Math.floor(Math.random() * 1e9)}`;
// Step 7O-FIX：7-11 alias test row（trackingProvider="7-11"，驗證 alias normalization）
let sevenElevenAliasTrackingId;
const SE_ALIAS_CODE = `711-ALIAS-${Math.floor(Math.random() * 1e9)}`;

async function makeOrderTracking(
  stId,
  prodId,
  provider,
  code,
  { isActive = true } = {},
) {
  const order = await pool.query(
    `INSERT INTO orders (product_id, store_id, public_token, buyer_name, buyer_phone, pickup_method, unit_price, total_price)
     VALUES ($1, $2, 'mp-' || floor(random()*1e9), 'MP-ROUTE-TEST', '0900000000', 'home_delivery', '100', '100') RETURNING id`,
    [prodId, stId],
  );
  const t = await pool.query(
    `INSERT INTO shipment_trackings (order_id, tracking_code, tracking_provider, source_type, tracking_status, is_active)
     VALUES ($1, $2, $3, 'manual', 'pending', $4) RETURNING id`,
    [order.rows[0].id, code, provider, isActive],
  );
  return t.rows[0].id;
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}/api`;

  const store = await pool.query(
    `INSERT INTO stores (merchant_id, name, slug) VALUES ($1, 'mp-test', 'mp-test-' || floor(random()*1e9)) RETURNING id`,
    [TEST_USER],
  );
  storeId = store.rows[0].id;
  const otherStore = await pool.query(
    `INSERT INTO stores (merchant_id, name, slug) VALUES ($1, 'mp-other', 'mp-other-' || floor(random()*1e9)) RETURNING id`,
    [OTHER_USER],
  );
  otherStoreId = otherStore.rows[0].id;

  const product = await pool.query(
    `INSERT INTO products (store_id, name, price, share_token) VALUES ($1, 'mp-product', 100, 'mp-' || floor(random()*1e9)) RETURNING id`,
    [storeId],
  );
  productId = product.rows[0].id;
  const otherProduct = await pool.query(
    `INSERT INTO products (store_id, name, price, share_token) VALUES ($1, 'mp-product-2', 100, 'mp2-' || floor(random()*1e9)) RETURNING id`,
    [otherStoreId],
  );

  poTrackingId = await makeOrderTracking(
    storeId,
    productId,
    "postoffice",
    PO_CODE,
  );
  tcatTrackingId = await makeOrderTracking(
    storeId,
    productId,
    "tcat",
    TCAT_CODE,
  );
  otherStoreTrackingId = await makeOrderTracking(
    otherStoreId,
    otherProduct.rows[0].id,
    "postoffice",
    "97300922002170839998",
  );
  // J4C commit-specific rows
  poCommitId = await makeOrderTracking(
    storeId,
    productId,
    "postoffice",
    PO_COMMIT_CODE,
  );
  tcatCommitId = await makeOrderTracking(
    storeId,
    productId,
    "tcat",
    TCAT_COMMIT_CODE,
  );
  driftCommitId = await makeOrderTracking(
    storeId,
    productId,
    "postoffice",
    PO_DRIFT_CODE,
  );
  inactiveCommitId = await makeOrderTracking(
    storeId,
    productId,
    "postoffice",
    PO_INACTIVE_CODE,
    { isActive: false },
  );
  // Step 7O：7-11 preview test row
  sevenElevenTrackingId = await makeOrderTracking(
    storeId,
    productId,
    "711",
    SE_CODE,
  );
  // Step 7O-FIX：alias row（trackingProvider="7-11"，直接插入不經 PATCH normalization）
  sevenElevenAliasTrackingId = await makeOrderTracking(
    storeId,
    productId,
    "7-11",
    SE_ALIAS_CODE,
  );
});

after(async () => {
  // J4C write tests 會產生 run logs（store_id → ON DELETE SET NULL），先手動清
  await pool.query(
    `DELETE FROM shipment_tracking_run_logs WHERE store_id = ANY($1)`,
    [[storeId, otherStoreId]],
  );
  // store cascade 清 products/orders/trackings/events
  await pool.query(`DELETE FROM stores WHERE id = ANY($1)`, [
    [storeId, otherStoreId],
  ]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  if (PREVIOUS_MANUAL_COMMIT_ENABLED === undefined) {
    delete process.env.LOGISTICS_MANUAL_COMMIT_ENABLED;
  } else {
    process.env.LOGISTICS_MANUAL_COMMIT_ENABLED =
      PREVIOUS_MANUAL_COMMIT_ENABLED;
  }
});

const call = (body, { user = TEST_USER, store = () => storeId } = {}) =>
  fetch(`${baseUrl}/stores/${store()}/logistics/sync/manual-provider`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { "x-test-user-id": user } : {}),
    },
    body: JSON.stringify(body),
  });

describe("manual-provider route — auth / permission", () => {
  test("401 without auth", async () => {
    const res = await call(
      { provider: "postoffice", trackingIds: [1] },
      { user: null },
    );
    assert.equal(res.status, 401);
  });

  test("403/404 when not store owner", async () => {
    const res = await call(
      { provider: "postoffice", trackingIds: [poTrackingId] },
      { user: OTHER_USER },
    );
    assert.ok([403, 404].includes(res.status), `got ${res.status}`);
  });
});

describe("manual-provider route — validation gates (不打外部)", () => {
  test("400 provider missing", async () => {
    const res = await call({ trackingIds: [poTrackingId] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_REQUIRED");
  });

  test("400 unknown provider", async () => {
    const res = await call({ provider: "dhl", trackingIds: [poTrackingId] });
    assert.equal((await res.json()).errorCode, "PROVIDER_NOT_ALLOWED");
    assert.equal(res.status, 400);
  });

  test("400 familymart not allowed", async () => {
    const res = await call({
      provider: "familymart",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_NOT_ALLOWED");
  });

  test("400 711 not allowed", async () => {
    const res = await call({ provider: "711", trackingIds: [poTrackingId] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_NOT_ALLOWED");
  });

  test("400 trackingIds empty", async () => {
    const res = await call({ provider: "postoffice", trackingIds: [] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TRACKING_IDS_REQUIRED");
  });

  test("400 trackingIds > 5", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [1, 2, 3, 4, 5, 6],
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TOO_MANY_TRACKING_IDS");
  });

  test("400 trackingIds not found", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [999999999],
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TRACKING_NOT_FOUND");
  });

  test("400 cross-store trackingIds rejected as whole batch", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [poTrackingId, otherStoreTrackingId],
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "CROSS_STORE_TRACKING");
  });

  test("400 provider mismatch (tcat id sent as postoffice)", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [tcatTrackingId],
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_MISMATCH");
  });
});

describe("manual-provider route — dryRun (外部讀取，不寫 DB)", () => {
  const countEvents = async (id) =>
    Number(
      (
        await pool.query(
          `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
          [id],
        )
      ).rows[0].count,
    );
  const runLogCount = async () =>
    Number(
      (
        await pool.query(
          `SELECT count(*) FROM shipment_tracking_run_logs WHERE store_id = $1`,
          [storeId],
        )
      ).rows[0].count,
    );

  test("200 dryRun postoffice：preview only、不寫 events / run log", async () => {
    const logsBefore = await runLogCount();
    const res = await call({
      provider: "postoffice",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.runId, null);
    assert.equal(body.totalJobs, 1);
    // 合成單號的外部回應依郵局站台而異（empty / REMOTE_CHANGED 皆可能）；
    // 本案例的重點是 dryRun pipeline 走通且零寫入（下方斷言），
    // postoffice 成功解析路徑由 adapter 測試覆蓋、route 200 success 由 tcat 案例覆蓋
    assert.ok(
      ["success", "empty", "failed"].includes(body.jobs[0].status),
      JSON.stringify(body.jobs[0]),
    );
    assert.equal(body.jobs[0].insertedEventCount, undefined);
    assert.equal(await countEvents(poTrackingId), 0);
    assert.equal(await runLogCount(), logsBefore);
    const snap = await pool.query(
      `SELECT last_checked_at FROM shipment_trackings WHERE id = $1`,
      [poTrackingId],
    );
    assert.equal(snap.rows[0].last_checked_at, null);
  });

  test("200 dryRun tcat：preview only、不寫 events", async () => {
    const res = await call({ provider: "tcat", trackingIds: [tcatTrackingId] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.jobs[0].status, "success");
    assert.equal(await countEvents(tcatTrackingId), 0);
  });

  test("default is dryRun even with dryRun omitted / truthy junk", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [poTrackingId],
      dryRun: "false",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // 只有 boolean false 才實寫；字串 "false" 仍 dryRun（保守）
    assert.equal(body.dryRun, true);
    assert.equal(await countEvents(poTrackingId), 0);
  });
});

// ─── Step 7N-J2：dryRun:false safety lock + /preview endpoint ───

const { signPreviewToken, verifyPreviewToken } = await import(
  path.join(ROOT, "artifacts/api-server/src/lib/logistics/previewToken.ts")
);

const callPreview = (body, { user = TEST_USER, store = () => storeId } = {}) =>
  fetch(`${baseUrl}/stores/${store()}/logistics/sync/manual-provider/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { "x-test-user-id": user } : {}),
    },
    body: JSON.stringify(body),
  });

// J4C helpers ─────────────────────────────────────────────────────────────────
const callCommit = (body, { user = TEST_USER, store = () => storeId } = {}) =>
  fetch(`${baseUrl}/stores/${store()}/logistics/sync/manual-provider/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { "x-test-user-id": user } : {}),
    },
    body: JSON.stringify(body),
  });

async function getPreviewFor(
  provider,
  trackingId,
  { store: storeFn = () => storeId, user = TEST_USER } = {},
) {
  const res = await callPreview(
    { provider, trackingIds: [trackingId] },
    { user, store: storeFn },
  );
  if (res.status !== 200)
    throw new Error(`getPreviewFor failed ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const job = body.jobs?.[0];
  if (!job || !job.previewHash)
    throw new Error(
      `getPreviewFor: no job/previewHash: ${JSON.stringify(job)}`,
    );
  return {
    previewHash: job.previewHash,
    expectedEventCount: job.wouldWriteEvents,
    expectedLatestStatusText: job.latestStatusText,
    expectedLatestEventAt: job.latestEventAt,
    trackingCode: job.trackingCode,
  };
}

function buildCommitBody(provider, trackingId, preview, overrides = {}) {
  return {
    provider,
    trackingId,
    trackingCode: preview.trackingCode,
    previewHash: preview.previewHash,
    confirmText: "WRITE_TRACKING_EVENTS",
    expectedEventCount: preview.expectedEventCount,
    expectedLatestStatusText: preview.expectedLatestStatusText,
    expectedLatestEventAt: preview.expectedLatestEventAt,
    ...overrides,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

describe("7N-J2 — dryRun:false safety lock", () => {
  const countEvents = async (id) =>
    Number(
      (
        await pool.query(
          `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
          [id],
        )
      ).rows[0].count,
    );
  const totalRunLogs = async () =>
    Number(
      (await pool.query(`SELECT count(*) FROM shipment_tracking_run_logs`))
        .rows[0].count,
    );

  test("dryRun:false → 400 USE_COMMIT_ENDPOINT，不打外部、不寫 DB", async () => {
    const callsBefore = adapterCallCount;
    const logsBefore = await totalRunLogs();
    const res = await call({
      provider: "postoffice",
      trackingIds: [poTrackingId],
      dryRun: false,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "USE_COMMIT_ENDPOINT");
    assert.equal(adapterCallCount, callsBefore, "外部 adapter 不應被呼叫");
    assert.equal(await totalRunLogs(), logsBefore, "run log 不應新增");
    assert.equal(await countEvents(poTrackingId), 0);
    const snap = await pool.query(
      `SELECT last_checked_at, latest_event_status FROM shipment_trackings WHERE id = $1`,
      [poTrackingId],
    );
    assert.equal(snap.rows[0].last_checked_at, null);
    assert.equal(snap.rows[0].latest_event_status, null);
  });

  test("dryRun:false 未登入 → 401（requireAuth 先擋），外部與 DB 均未觸發", async () => {
    const callsBefore = adapterCallCount;
    const res = await call(
      { provider: "postoffice", trackingIds: [poTrackingId], dryRun: false },
      { user: null },
    );
    assert.equal(res.status, 401);
    assert.equal(adapterCallCount, callsBefore);
  });
});

describe("7N-J2 — /preview endpoint", () => {
  const countEvents = async (id) =>
    Number(
      (
        await pool.query(
          `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
          [id],
        )
      ).rows[0].count,
    );
  const totalRunLogs = async () =>
    Number(
      (await pool.query(`SELECT count(*) FROM shipment_tracking_run_logs`))
        .rows[0].count,
    );

  test("未登入 401", async () => {
    const res = await callPreview(
      { provider: "postoffice", trackingIds: [poTrackingId] },
      { user: null },
    );
    assert.equal(res.status, 401);
  });

  test("非 owner 403/404", async () => {
    const res = await callPreview(
      { provider: "postoffice", trackingIds: [poTrackingId] },
      { user: OTHER_USER },
    );
    assert.ok([403, 404].includes(res.status), String(res.status));
  });

  test("invalid provider 400", async () => {
    const res = await callPreview({
      provider: "dhl",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 400);
  });

  // Step 7O：provider=711 but trackingIds has postoffice row → PROVIDER_MISMATCH 400
  test("711 preview PROVIDER_MISMATCH（非 711 の tracking id）400", async () => {
    const res = await callPreview({
      provider: "711",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "PROVIDER_MISMATCH");
  });

  // Step 7O：7-11 preview 成功（mock adapter、DB 不寫、commitDisabled、previewHash null）
  test("711 preview：mock adapter 成功（dryRun、commitDisabled=true、previewHash null）", async () => {
    const callsBefore = sevenElevenAdapterCallCount;
    const logsBefore = await totalRunLogs();
    const res = await callPreview({
      provider: "711",
      trackingIds: [sevenElevenTrackingId],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.commitDisabled, true);
    assert.equal(body.previewHashAvailable, false);
    assert.equal(body.provider, "711");
    assert.equal(body.successCount, 1);
    const job = body.jobs[0];
    assert.equal(job.success, true);
    assert.equal(job.previewHash, null);
    assert.equal(job.commitDisabled, true);
    assert.ok(job.wouldWriteEvents >= 1);
    assert.equal(job.duplicateEvents, 0);
    assert.ok(typeof job.pickupStoreName === "string");
    assert.ok(typeof job.pickupDeadline === "string");
    // DB 不寫
    assert.equal(await countEvents(sevenElevenTrackingId), 0);
    assert.equal(await totalRunLogs(), logsBefore);
    assert.ok(
      sevenElevenAdapterCallCount > callsBefore,
      "711 adapter must have been called",
    );
  });

  // Step 7O-FIX：provider alias "7-11" with alias DB row → 200
  test("711-alias preview：payload provider='7-11' + DB trackingProvider='7-11' → 200 dryRun", async () => {
    const callsBefore = sevenElevenAdapterCallCount;
    const res = await callPreview({
      provider: "7-11",
      trackingIds: [sevenElevenAliasTrackingId],
    });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}`);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.commitDisabled, true);
    assert.equal(body.provider, "711");
    assert.ok(
      sevenElevenAdapterCallCount > callsBefore,
      "711 adapter must have been called for alias",
    );
  });

  // Step 7O-FIX：provider alias "seven-eleven" with canonical "711" DB row → 200
  test("711-alias preview：payload provider='seven-eleven' + DB trackingProvider='711' → 200 dryRun", async () => {
    const res = await callPreview({
      provider: "seven-eleven",
      trackingIds: [sevenElevenTrackingId],
    });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}`);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.provider, "711");
  });

  // Step 7O-FIX：alias payload but wrong (non-711) DB row → PROVIDER_MISMATCH
  test("711-alias preview PROVIDER_MISMATCH（alias payload + postoffice DB row）400", async () => {
    const res = await callPreview({
      provider: "7-11",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "PROVIDER_MISMATCH");
  });

  test("familymart rejected 400", async () => {
    const res = await callPreview({
      provider: "familymart",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 400);
  });

  test("trackingIds 空 / 超過 5 筆 400", async () => {
    const empty = await callPreview({
      provider: "postoffice",
      trackingIds: [],
    });
    assert.equal(empty.status, 400);
    const tooMany = await callPreview({
      provider: "postoffice",
      trackingIds: [1, 2, 3, 4, 5, 6],
    });
    assert.equal(tooMany.status, 400);
  });

  test("postoffice preview：dryRun、DB 不變、回 previewHash / previewExpiresAt", async () => {
    const logsBefore = await totalRunLogs();
    const res = await callPreview({
      provider: "postoffice",
      trackingIds: [poTrackingId],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.previewHashAvailable, true);
    const job = body.jobs[0];
    assert.equal(job.status, "success");
    assert.equal(job.latestStatusText, "投遞成功");
    assert.equal(job.wouldWriteEvents, 5);
    assert.equal(job.duplicateEvents, 0);
    assert.equal(job.normalizedStatus, "delivered");
    assert.ok(
      typeof job.previewHash === "string" && job.previewHash.length > 0,
    );
    assert.ok(typeof job.previewExpiresAt === "string");
    // DB 不變
    assert.equal(await countEvents(poTrackingId), 0);
    assert.equal(await totalRunLogs(), logsBefore);
    const snap = await pool.query(
      `SELECT last_checked_at FROM shipment_trackings WHERE id = $1`,
      [poTrackingId],
    );
    assert.equal(snap.rows[0].last_checked_at, null);
  });

  test("tcat preview：dryRun、DB 不變、回 previewHash", async () => {
    const res = await callPreview({
      provider: "tcat",
      trackingIds: [tcatTrackingId],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const job = body.jobs[0];
    assert.equal(job.status, "success");
    assert.equal(job.latestStatusText, "順利送達");
    assert.ok(job.previewHash);
    assert.equal(await countEvents(tcatTrackingId), 0);
  });
});

describe("7N-J2 — previewToken helper", () => {
  test("token 兩段、verify 可過、payload 含 expectedEventCount / expiresAt", () => {
    const { token, expiresAt } = signPreviewToken({
      storeId: 1,
      trackingId: 153,
      provider: "postoffice",
      trackingCode: "97300922002170830005",
      latestStatusText: "投遞成功",
      latestEventAt: "2026/06/08 11:21:53",
      expectedEventCount: 5,
      normalizedStatus: "delivered",
    });
    assert.equal(token.split(".").length, 2);
    const v = verifyPreviewToken(token);
    assert.equal(v.ok, true);
    assert.equal(v.payload.expectedEventCount, 5);
    assert.equal(v.payload.expiresAt, expiresAt);
    assert.equal(v.payload.purpose, "manual-provider-commit");
  });

  test("tamper → PREVIEW_HASH_INVALID", () => {
    const { token } = signPreviewToken({
      storeId: 1,
      trackingId: 153,
      provider: "postoffice",
      trackingCode: "x",
      latestStatusText: null,
      latestEventAt: null,
      expectedEventCount: 1,
      normalizedStatus: null,
    });
    const [payload, sig] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
        expectedEventCount: 99,
      }),
      "utf8",
    ).toString("base64url");
    const v = verifyPreviewToken(`${tamperedPayload}.${sig}`);
    assert.equal(v.ok, false);
    assert.equal(v.errorCode, "PREVIEW_HASH_INVALID");
  });

  test("expired → PREVIEW_EXPIRED", () => {
    const { token } = signPreviewToken({
      storeId: 1,
      trackingId: 153,
      provider: "postoffice",
      trackingCode: "x",
      latestStatusText: null,
      latestEventAt: null,
      expectedEventCount: 1,
      normalizedStatus: null,
    });
    const elevenMinLater = new Date(Date.now() + 11 * 60 * 1000);
    const v = verifyPreviewToken(token, elevenMinLater);
    assert.equal(v.ok, false);
    assert.equal(v.errorCode, "PREVIEW_EXPIRED");
  });
});

// ─── Step 7N-J4C：/commit endpoint ───────────────────────────────────────────

describe("7N-J4C — /commit auth / permission", () => {
  test("commit_401_no_auth", async () => {
    const res = await callCommit(
      { provider: "postoffice", trackingId: 1 },
      { user: null },
    );
    assert.equal(res.status, 401);
  });

  test("commit_403_non_owner", async () => {
    const res = await callCommit(
      { provider: "postoffice", trackingId: poCommitId },
      { user: OTHER_USER },
    );
    assert.ok([403, 404].includes(res.status), `got ${res.status}`);
  });
});

describe("7N-J4C — /commit validation gates (no DB write)", () => {
  // helper：建一個 valid signed token（用 signPreviewToken 直簽，不走 /preview）
  function makeToken(overrides = {}) {
    const { token } = signPreviewToken({
      storeId,
      trackingId: poCommitId,
      provider: "postoffice",
      trackingCode: PO_COMMIT_CODE,
      latestStatusText: "投遞成功",
      latestEventAt: "2026/06/08 11:21:53",
      expectedEventCount: 5,
      normalizedStatus: "delivered",
      ...overrides,
    });
    return token;
  }

  test("commit_400_invalid_provider", async () => {
    const res = await callCommit({ provider: "dhl", trackingId: poCommitId });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "INVALID_PROVIDER");
  });

  test("commit_400_711_rejected", async () => {
    const res = await callCommit({ provider: "711", trackingId: poCommitId });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "INVALID_PROVIDER");
    assert.ok(body.message.includes("7-11"), `message: ${body.message}`);
  });

  // Step 7O-FIX：commit with "7-11" alias also rejected（commit route must NOT allow any 7-11 alias）
  test("commit_400_7_11_alias_rejected", async () => {
    const res = await callCommit({ provider: "7-11", trackingId: poCommitId });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "INVALID_PROVIDER");
  });

  test("commit_400_familymart_rejected", async () => {
    const res = await callCommit({
      provider: "familymart",
      trackingId: poCommitId,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "INVALID_PROVIDER");
    assert.ok(body.message.includes("全家"), `message: ${body.message}`);
  });

  test("commit_400_invalid_tracking_id", async () => {
    const res = await callCommit({ provider: "postoffice", trackingId: 0 });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "INVALID_TRACKING_ID");
  });

  test("commit_400_preview_hash_missing", async () => {
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_HASH_REQUIRED");
  });

  test("commit_400_preview_hash_invalid", async () => {
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: "garbage.garbage",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_HASH_INVALID");
  });

  test("commit_400_preview_expired", async () => {
    // 建立一個在 11 分鐘前簽署（已超過 10 分鐘 TTL）的 token
    const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000);
    const { token: expiredToken } = signPreviewToken(
      {
        storeId,
        trackingId: poCommitId,
        provider: "postoffice",
        trackingCode: PO_COMMIT_CODE,
        latestStatusText: "投遞成功",
        latestEventAt: "2026/06/08 11:21:53",
        expectedEventCount: 5,
        normalizedStatus: "delivered",
      },
      elevenMinAgo,
    );
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: expiredToken,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_EXPIRED");
  });

  test("commit_400_preview_scope_mismatch_store", async () => {
    const token = makeToken({ storeId: 99999 });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_SCOPE_MISMATCH");
  });

  test("commit_400_preview_scope_mismatch_tracking", async () => {
    const token = makeToken({ trackingId: 99999 });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_SCOPE_MISMATCH");
  });

  test("commit_400_preview_scope_mismatch_provider", async () => {
    // token 說 tcat，request 說 postoffice
    const token = makeToken({ provider: "tcat" });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_SCOPE_MISMATCH");
  });

  test("commit_400_preview_scope_mismatch_code", async () => {
    // token 說 SCOPE_TOKEN_CODE，request 說 PO_COMMIT_CODE（不同）
    const token = makeToken({ trackingCode: "SCOPE_TOKEN_CODE" });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PREVIEW_SCOPE_MISMATCH");
  });

  test("commit_400_confirm_text_missing", async () => {
    const token = makeToken();
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
      // confirmText 缺失
      expectedEventCount: 5,
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "CONFIRM_TEXT_REQUIRED");
  });

  test("commit_400_confirm_text_invalid", async () => {
    const token = makeToken();
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
      confirmText: "yes",
      expectedEventCount: 5,
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "CONFIRM_TEXT_INVALID");
  });

  test("commit_400_expected_event_count_mismatch", async () => {
    const token = makeToken(); // token.expectedEventCount = 5
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 99, // 不符
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "EXPECTED_EVENT_COUNT_MISMATCH");
  });

  test("commit_400_expected_latest_status_mismatch", async () => {
    const token = makeToken(); // token.latestStatusText = "投遞成功"
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 5,
      expectedLatestStatusText: "不符狀態", // 不符
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal(
      (await res.json()).errorCode,
      "EXPECTED_LATEST_STATUS_MISMATCH",
    );
  });

  test("commit_400_expected_latest_event_at_mismatch", async () => {
    const token = makeToken(); // token.latestEventAt = "2026/06/08 11:21:53"
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: PO_COMMIT_CODE,
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 5,
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2000-01-01T00:00:00.000Z", // 不符
    });
    assert.equal(res.status, 400);
    assert.equal(
      (await res.json()).errorCode,
      "EXPECTED_LATEST_EVENT_AT_MISMATCH",
    );
  });
});

describe("7N-J4C — /commit DB lookup gates", () => {
  test("commit_404_tracking_not_found", async () => {
    const { token } = signPreviewToken({
      storeId,
      trackingId: 999999999,
      provider: "postoffice",
      trackingCode: "NONEXISTENT_CODE",
      latestStatusText: null,
      latestEventAt: null,
      expectedEventCount: 0,
      normalizedStatus: null,
    });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: 999999999,
      trackingCode: "NONEXISTENT_CODE",
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 0,
      expectedLatestStatusText: null,
      expectedLatestEventAt: null,
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).errorCode, "TRACKING_NOT_FOUND");
  });

  test("commit_404_cross_store", async () => {
    // otherStoreTrackingId 屬於 otherStoreId，用 storeId 的 URL 查 → 404
    const { token } = signPreviewToken({
      storeId,
      trackingId: otherStoreTrackingId,
      provider: "postoffice",
      trackingCode: "97300922002170839998",
      latestStatusText: null,
      latestEventAt: null,
      expectedEventCount: 0,
      normalizedStatus: null,
    });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: otherStoreTrackingId,
      trackingCode: "97300922002170839998",
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 0,
      expectedLatestStatusText: null,
      expectedLatestEventAt: null,
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).errorCode, "TRACKING_NOT_FOUND");
  });

  test("commit_400_tracking_inactive", async () => {
    // inactiveCommitId 的 is_active = false
    const { token } = signPreviewToken({
      storeId,
      trackingId: inactiveCommitId,
      provider: "postoffice",
      trackingCode: PO_INACTIVE_CODE,
      latestStatusText: null,
      latestEventAt: null,
      expectedEventCount: 0,
      normalizedStatus: null,
    });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: inactiveCommitId,
      trackingCode: PO_INACTIVE_CODE,
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 0,
      expectedLatestStatusText: null,
      expectedLatestEventAt: null,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TRACKING_INACTIVE");
  });

  test("commit_400_provider_mismatch", async () => {
    // tcatCommitId 的 DB provider=tcat，但 token/request 說 postoffice
    const { token } = signPreviewToken({
      storeId,
      trackingId: tcatCommitId,
      provider: "postoffice",
      trackingCode: TCAT_COMMIT_CODE,
      latestStatusText: "投遞成功",
      latestEventAt: "2026/06/08 11:21:53",
      expectedEventCount: 5,
      normalizedStatus: "delivered",
    });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: tcatCommitId,
      trackingCode: TCAT_COMMIT_CODE,
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 5,
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_MISMATCH");
  });

  test("commit_400_tracking_code_mismatch", async () => {
    // token/request trackingCode="WRONG_CODE"，但 DB row 的 code 是 PO_COMMIT_CODE
    const { token } = signPreviewToken({
      storeId,
      trackingId: poCommitId,
      provider: "postoffice",
      trackingCode: "WRONG_CODE",
      latestStatusText: "投遞成功",
      latestEventAt: "2026/06/08 11:21:53",
      expectedEventCount: 5,
      normalizedStatus: "delivered",
    });
    const res = await callCommit({
      provider: "postoffice",
      trackingId: poCommitId,
      trackingCode: "WRONG_CODE",
      previewHash: token,
      confirmText: "WRITE_TRACKING_EVENTS",
      expectedEventCount: 5,
      expectedLatestStatusText: "投遞成功",
      expectedLatestEventAt: "2026/06/08 11:21:53",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TRACKING_CODE_MISMATCH");
  });
});

describe("7N-J4C — /commit drift", () => {
  const countEvents = (id) =>
    pool
      .query(
        `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
        [id],
      )
      .then((r) => Number(r.rows[0].count));

  test("commit_409_preview_drifted", async () => {
    // 1. preview with DEFAULT fixture (5 events)
    const preview = await getPreviewFor("postoffice", driftCommitId);
    assert.equal(preview.expectedEventCount, 5);
    // 2. swap fixture → drift (6 events, 不同 status)
    poFixture = poDriftFixture;
    try {
      const res = await callCommit(
        buildCommitBody("postoffice", driftCommitId, preview),
      );
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.code, "PREVIEW_DRIFTED");
      assert.ok(body.freshPreview, "freshPreview should exist");
      assert.equal(body.freshPreview.expectedEventCount, 6);
      assert.equal(body.freshPreview.latestStatusText, "轉寄成功");
      // DB 不寫
      assert.equal(await countEvents(driftCommitId), 0);
    } finally {
      poFixture = DEFAULT_PO_FIXTURE;
    }
  });
});

describe("7N-J4C — /commit success", () => {
  const countEvents = (id) =>
    pool
      .query(
        `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`,
        [id],
      )
      .then((r) => Number(r.rows[0].count));

  test("commit_200_postoffice_success", async () => {
    const preview = await getPreviewFor("postoffice", poCommitId);
    const res = await callCommit(
      buildCommitBody("postoffice", poCommitId, preview),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.committed, true);
    assert.equal(body.insertedEventCount, 5);
    assert.equal(body.idempotentNoop, false);
    assert.ok(body.runLogId != null, "runLogId should not be null");
    assert.equal(body.latestStatusText, "投遞成功");
    assert.equal(body.latestEventAt, "2026/06/08 11:21:53");
    // DB: events 已寫入
    assert.equal(await countEvents(poCommitId), 5);
    // DB: snapshot updated
    const snap = await pool.query(
      `SELECT last_checked_at, latest_event_status, tracking_status FROM shipment_trackings WHERE id = $1`,
      [poCommitId],
    );
    assert.ok(
      snap.rows[0].last_checked_at != null,
      "last_checked_at should be set",
    );
    assert.equal(snap.rows[0].latest_event_status, "delivered");
    assert.equal(snap.rows[0].tracking_status, "delivered");
  });

  test("commit_200_tcat_success", async () => {
    const preview = await getPreviewFor("tcat", tcatCommitId);
    const res = await callCommit(
      buildCommitBody("tcat", tcatCommitId, preview),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.committed, true);
    assert.equal(body.insertedEventCount, 5);
    assert.equal(body.idempotentNoop, false);
    assert.ok(body.runLogId != null);
    assert.equal(body.latestStatusText, "順利送達");
    assert.equal(await countEvents(tcatCommitId), 5);
  });

  test("commit_200_idempotent_noop", async () => {
    // poCommitId 已在 commit_200_postoffice_success 寫入 5 events
    // 再次 preview → duplicate=5, wouldWriteEvents=5 → re-commit → insertedEventCount=0
    const preview = await getPreviewFor("postoffice", poCommitId);
    const res = await callCommit(
      buildCommitBody("postoffice", poCommitId, preview),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.insertedEventCount, 0);
    assert.equal(body.idempotentNoop, true);
    assert.ok(body.runLogId != null);
    // DB events 數量不變（仍是 5）
    assert.equal(await countEvents(poCommitId), 5);
  });

  test("commit_runlog_store_id_not_null", async () => {
    const r = await pool.query(
      `SELECT store_id FROM shipment_tracking_run_logs WHERE store_id = $1 ORDER BY id DESC LIMIT 1`,
      [storeId],
    );
    assert.ok(
      r.rows.length > 0,
      "should have at least one run log for storeId",
    );
    assert.equal(r.rows[0].store_id, storeId);
  });

  test("commit_runlog_created_by_not_null", async () => {
    const r = await pool.query(
      `SELECT created_by FROM shipment_tracking_run_logs WHERE store_id = $1 ORDER BY id DESC LIMIT 1`,
      [storeId],
    );
    assert.ok(r.rows.length > 0);
    assert.equal(r.rows[0].created_by, TEST_USER);
  });

  test("commit_orders_main_status_unchanged", async () => {
    const before = await pool.query(
      `SELECT o.status FROM orders o JOIN shipment_trackings st ON st.order_id = o.id WHERE st.id = $1`,
      [poCommitId],
    );
    const statusBefore = before.rows[0]?.status ?? null;
    // poCommitId 已 commit，再跑一次 idempotent commit
    const preview = await getPreviewFor("postoffice", poCommitId);
    await callCommit(buildCommitBody("postoffice", poCommitId, preview));
    const after = await pool.query(
      `SELECT o.status FROM orders o JOIN shipment_trackings st ON st.order_id = o.id WHERE st.id = $1`,
      [poCommitId],
    );
    assert.equal(
      after.rows[0]?.status,
      statusBefore,
      "orders.status should not change after commit",
    );
  });

  test("commit_preview_still_zero_write", async () => {
    const runLogsBefore = await pool
      .query(
        `SELECT count(*) FROM shipment_tracking_run_logs WHERE store_id = $1`,
        [storeId],
      )
      .then((r) => Number(r.rows[0].count));
    const res = await callPreview({
      provider: "postoffice",
      trackingIds: [poCommitId],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    // run log 數量不變（/preview 不留 run log）
    const runLogsAfter = await pool
      .query(
        `SELECT count(*) FROM shipment_tracking_run_logs WHERE store_id = $1`,
        [storeId],
      )
      .then((r) => Number(r.rows[0].count));
    assert.equal(runLogsAfter, runLogsBefore);
  });
});

describe("7N-J4C — /commit J2 regression", () => {
  test("commit_dryrun_false_lock_still_active", async () => {
    const res = await call({
      provider: "postoffice",
      trackingIds: [poCommitId],
      dryRun: false,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "USE_COMMIT_ENDPOINT");
  });

  test("commit_supportsAutoSync_only_familymart", async () => {
    const res = await fetch(
      `${baseUrl}/stores/${storeId}/logistics/sync/status`,
      {
        headers: { "x-test-user-id": TEST_USER },
      },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.supportedProviders, ["familymart"]);
    assert.ok(
      body.unsupportedProviders.includes("postoffice"),
      "postoffice should be unsupported",
    );
    assert.ok(
      body.unsupportedProviders.includes("tcat"),
      "tcat should be unsupported",
    );
  });
});

describe("7N-J4C — final safety check", () => {
  test("commit_1012_row_untouched_by_tests", async () => {
    const row = await pool.query(
      `SELECT id, order_id, tracking_provider, tracking_code, tracking_status, is_active
       FROM shipment_trackings WHERE id = 153`,
    );
    assert.equal(
      row.rows.length,
      1,
      "#1012 tracking row id=153 should still exist",
    );
    assert.equal(row.rows[0].tracking_provider, "postoffice");
    assert.equal(row.rows[0].tracking_code, "97300922002170830005");
    assert.equal(row.rows[0].tracking_status, "pending");
    assert.equal(row.rows[0].is_active, true);
    const events = await pool.query(
      `SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = 153`,
    );
    assert.equal(
      Number(events.rows[0].count),
      0,
      "#1012 events should remain 0",
    );
  });
});
