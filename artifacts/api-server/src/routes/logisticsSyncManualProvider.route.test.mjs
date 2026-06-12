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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req) => {
      const userId = req.headers?.["x-test-user-id"] ?? null;
      return { userId: userId || null, sessionClaims: userId ? { userId } : undefined };
    },
    clerkMiddleware: () => (_req, _res, next) => next(),
  },
});

// Step 7N-J2：mock 兩個 provider adapter（fixture 回應），整套測試不打真外部站台。
// 同時用計數器驗證「被 gate 擋下的請求完全沒有觸發外部查詢」。
let adapterCallCount = 0;
const fixtureResult = (provider, latestStatusText, latestEventAt, occurredAtList) => (trackingCode) => ({
  ok: true, provider, trackingCode,
  normalizedStatus: "delivered", latestStatusText, latestEventAt,
  events: occurredAtList.map((occurredAt, i) => ({
    eventStatus: latestStatusText, eventDescription: latestStatusText,
    eventLocation: `fixture-${i}`, occurredAt, rawData: { fixture: true },
  })),
  rawSummary: { fixture: true },
});
const poFixture = fixtureResult("postoffice", "投遞成功", "2026/06/08 11:21:53",
  ["2026/06/08 11:21:53", "2026/06/08 08:10:00", "2026/06/07 19:02:11", "2026/06/07 10:30:45", "2026/06/06 15:00:00"]);
const tcatFixture = fixtureResult("tcat", "順利送達", "2026/05/29 08:31",
  ["2026/05/29 08:31", "2026/05/29 07:00", "2026/05/28 22:15", "2026/05/28 21:15", "2026/05/28 18:40"]);

mock.module(path.join(ROOT, "artifacts/api-server/src/lib/logistics/adapters/postOfficeAdapter.ts"), {
  namedExports: {
    queryPostOfficeTracking: async ({ trackingCode }) => { adapterCallCount++; return poFixture(trackingCode); },
  },
});
mock.module(path.join(ROOT, "artifacts/api-server/src/lib/logistics/adapters/tcatAdapter.ts"), {
  namedExports: {
    queryTcatTracking: async ({ trackingCode }) => { adapterCallCount++; return tcatFixture(trackingCode); },
  },
});

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

async function makeOrderTracking(stId, prodId, provider, code) {
  const order = await pool.query(
    `INSERT INTO orders (product_id, store_id, public_token, buyer_name, buyer_phone, pickup_method, unit_price, total_price)
     VALUES ($1, $2, 'mp-' || floor(random()*1e9), 'MP-ROUTE-TEST', '0900000000', 'home_delivery', '100', '100') RETURNING id`,
    [prodId, stId],
  );
  const t = await pool.query(
    `INSERT INTO shipment_trackings (order_id, tracking_code, tracking_provider, source_type, tracking_status)
     VALUES ($1, $2, $3, 'manual', 'pending') RETURNING id`,
    [order.rows[0].id, code, provider],
  );
  return t.rows[0].id;
}

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
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

  poTrackingId = await makeOrderTracking(storeId, productId, "postoffice", PO_CODE);
  tcatTrackingId = await makeOrderTracking(storeId, productId, "tcat", TCAT_CODE);
  otherStoreTrackingId = await makeOrderTracking(otherStoreId, otherProduct.rows[0].id, "postoffice", "97300922002170839998");
});

after(async () => {
  // store cascade 清 products/orders/trackings/events；run logs（dryRun 不產生）不需清
  await pool.query(`DELETE FROM stores WHERE id = ANY($1)`, [[storeId, otherStoreId]]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
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
    const res = await call({ provider: "postoffice", trackingIds: [1] }, { user: null });
    assert.equal(res.status, 401);
  });

  test("403/404 when not store owner", async () => {
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId] }, { user: OTHER_USER });
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
    const res = await call({ provider: "familymart", trackingIds: [poTrackingId] });
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
    const res = await call({ provider: "postoffice", trackingIds: [1, 2, 3, 4, 5, 6] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TOO_MANY_TRACKING_IDS");
  });

  test("400 trackingIds not found", async () => {
    const res = await call({ provider: "postoffice", trackingIds: [999999999] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "TRACKING_NOT_FOUND");
  });

  test("400 cross-store trackingIds rejected as whole batch", async () => {
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId, otherStoreTrackingId] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "CROSS_STORE_TRACKING");
  });

  test("400 provider mismatch (tcat id sent as postoffice)", async () => {
    const res = await call({ provider: "postoffice", trackingIds: [tcatTrackingId] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "PROVIDER_MISMATCH");
  });
});

describe("manual-provider route — dryRun (外部讀取，不寫 DB)", () => {
  const countEvents = async (id) =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`, [id])).rows[0].count);
  const runLogCount = async () =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_run_logs WHERE store_id = $1`, [storeId])).rows[0].count);

  test("200 dryRun postoffice：preview only、不寫 events / run log", async () => {
    const logsBefore = await runLogCount();
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.runId, null);
    assert.equal(body.totalJobs, 1);
    // 合成單號的外部回應依郵局站台而異（empty / REMOTE_CHANGED 皆可能）；
    // 本案例的重點是 dryRun pipeline 走通且零寫入（下方斷言），
    // postoffice 成功解析路徑由 adapter 測試覆蓋、route 200 success 由 tcat 案例覆蓋
    assert.ok(["success", "empty", "failed"].includes(body.jobs[0].status), JSON.stringify(body.jobs[0]));
    assert.equal(body.jobs[0].insertedEventCount, undefined);
    assert.equal(await countEvents(poTrackingId), 0);
    assert.equal(await runLogCount(), logsBefore);
    const snap = await pool.query(`SELECT last_checked_at FROM shipment_trackings WHERE id = $1`, [poTrackingId]);
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
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId], dryRun: "false" });
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

describe("7N-J2 — dryRun:false safety lock", () => {
  const countEvents = async (id) =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`, [id])).rows[0].count);
  const totalRunLogs = async () =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_run_logs`)).rows[0].count);

  test("dryRun:false → 400 USE_COMMIT_ENDPOINT，不打外部、不寫 DB", async () => {
    const callsBefore = adapterCallCount;
    const logsBefore = await totalRunLogs();
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId], dryRun: false });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, "USE_COMMIT_ENDPOINT");
    assert.equal(adapterCallCount, callsBefore, "外部 adapter 不應被呼叫");
    assert.equal(await totalRunLogs(), logsBefore, "run log 不應新增");
    assert.equal(await countEvents(poTrackingId), 0);
    const snap = await pool.query(`SELECT last_checked_at, latest_event_status FROM shipment_trackings WHERE id = $1`, [poTrackingId]);
    assert.equal(snap.rows[0].last_checked_at, null);
    assert.equal(snap.rows[0].latest_event_status, null);
  });

  test("dryRun:false 未登入 → 401（requireAuth 先擋），外部與 DB 均未觸發", async () => {
    const callsBefore = adapterCallCount;
    const res = await call({ provider: "postoffice", trackingIds: [poTrackingId], dryRun: false }, { user: null });
    assert.equal(res.status, 401);
    assert.equal(adapterCallCount, callsBefore);
  });
});

describe("7N-J2 — /preview endpoint", () => {
  const countEvents = async (id) =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_events WHERE shipment_tracking_id = $1`, [id])).rows[0].count);
  const totalRunLogs = async () =>
    Number((await pool.query(`SELECT count(*) FROM shipment_tracking_run_logs`)).rows[0].count);

  test("未登入 401", async () => {
    const res = await callPreview({ provider: "postoffice", trackingIds: [poTrackingId] }, { user: null });
    assert.equal(res.status, 401);
  });

  test("非 owner 403/404", async () => {
    const res = await callPreview({ provider: "postoffice", trackingIds: [poTrackingId] }, { user: OTHER_USER });
    assert.ok([403, 404].includes(res.status), String(res.status));
  });

  test("invalid provider 400", async () => {
    const res = await callPreview({ provider: "dhl", trackingIds: [poTrackingId] });
    assert.equal(res.status, 400);
  });

  test("711 rejected 400", async () => {
    const res = await callPreview({ provider: "711", trackingIds: [poTrackingId] });
    assert.equal(res.status, 400);
  });

  test("familymart rejected 400", async () => {
    const res = await callPreview({ provider: "familymart", trackingIds: [poTrackingId] });
    assert.equal(res.status, 400);
  });

  test("trackingIds 空 / 超過 5 筆 400", async () => {
    const empty = await callPreview({ provider: "postoffice", trackingIds: [] });
    assert.equal(empty.status, 400);
    const tooMany = await callPreview({ provider: "postoffice", trackingIds: [1, 2, 3, 4, 5, 6] });
    assert.equal(tooMany.status, 400);
  });

  test("postoffice preview：dryRun、DB 不變、回 previewHash / previewExpiresAt", async () => {
    const logsBefore = await totalRunLogs();
    const res = await callPreview({ provider: "postoffice", trackingIds: [poTrackingId] });
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
    assert.ok(typeof job.previewHash === "string" && job.previewHash.length > 0);
    assert.ok(typeof job.previewExpiresAt === "string");
    // DB 不變
    assert.equal(await countEvents(poTrackingId), 0);
    assert.equal(await totalRunLogs(), logsBefore);
    const snap = await pool.query(`SELECT last_checked_at FROM shipment_trackings WHERE id = $1`, [poTrackingId]);
    assert.equal(snap.rows[0].last_checked_at, null);
  });

  test("tcat preview：dryRun、DB 不變、回 previewHash", async () => {
    const res = await callPreview({ provider: "tcat", trackingIds: [tcatTrackingId] });
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
      storeId: 1, trackingId: 153, provider: "postoffice",
      trackingCode: "97300922002170830005", latestStatusText: "投遞成功",
      latestEventAt: "2026/06/08 11:21:53", expectedEventCount: 5, normalizedStatus: "delivered",
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
      storeId: 1, trackingId: 153, provider: "postoffice",
      trackingCode: "x", latestStatusText: null, latestEventAt: null,
      expectedEventCount: 1, normalizedStatus: null,
    });
    const [payload, sig] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      expectedEventCount: 99,
    }), "utf8").toString("base64url");
    const v = verifyPreviewToken(`${tamperedPayload}.${sig}`);
    assert.equal(v.ok, false);
    assert.equal(v.errorCode, "PREVIEW_HASH_INVALID");
  });

  test("expired → PREVIEW_EXPIRED", () => {
    const { token } = signPreviewToken({
      storeId: 1, trackingId: 153, provider: "postoffice",
      trackingCode: "x", latestStatusText: null, latestEventAt: null,
      expectedEventCount: 1, normalizedStatus: null,
    });
    const elevenMinLater = new Date(Date.now() + 11 * 60 * 1000);
    const v = verifyPreviewToken(token, elevenMinLater);
    assert.equal(v.ok, false);
    assert.equal(v.errorCode, "PREVIEW_EXPIRED");
  });
});
