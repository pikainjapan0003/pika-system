#!/usr/bin/env node
/**
 * Step 7F — FamilyMart worker DB smoke test（live endpoint + dev DB，手動跑）。
 *
 * Usage: node scripts/step7/test-familymart-worker-db-smoke.mjs [knownTrackingCode]
 *
 * 驗證：dryRun 不寫 DB、實跑更新 shipment_trackings / events / run log、
 * 重跑不重複寫 events、fake code 走 failure + exception 路徑。
 * fake-code 測試資料（order / tracking / exception / run log 不刪）跑完即清除。
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

if (!process.env.__FAMI_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"),
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: { ...process.env, __FAMI_TSX: "1" } },
  );
  process.exit(r.status ?? 1);
}

const workers = await import(
  pathToFileURL(
    path.join(
      ROOT,
      "artifacts/api-server/src/lib/logistics/workers/familyMartTrackingWorker.ts",
    ),
  )
);
const dbMod = await import(
  pathToFileURL(path.join(ROOT, "lib/db/src/index.ts"))
);
const { runFamilyMartTrackingWorker } = workers;
const {
  db,
  pool,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingEventsTable,
  shipmentTrackingExceptionsTable,
  shipmentTrackingRunLogsTable,
  storesTable,
  productsTable,
} = dbMod;
const { eq, and } = await import(
  pathToFileURL(
    path.join(ROOT, "artifacts/api-server/node_modules/drizzle-orm/index.js"),
  )
);

const KNOWN = process.argv[2] ?? "16341539811";
const FAKE = "99999999998";
let failures = 0;
function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? "✔" : "✖"} ${name}${ok ? "" : ` — ${detail ?? ""}`}`);
  if (!ok) failures++;
}
const mask = (c) => `${c.slice(0, 4)}****${c.slice(-4)}`;

async function getTracking(id) {
  const [row] = await db
    .select()
    .from(shipmentTrackingsTable)
    .where(eq(shipmentTrackingsTable.id, id));
  return row;
}
async function countEvents(id) {
  const rows = await db
    .select({ id: shipmentTrackingEventsTable.id })
    .from(shipmentTrackingEventsTable)
    .where(eq(shipmentTrackingEventsTable.shipmentTrackingId, id));
  return rows.length;
}

// --- 準備測試資料 ---
const [store] = await db
  .select({ id: storesTable.id })
  .from(storesTable)
  .limit(1);
const [product] = await db
  .select({ id: productsTable.id })
  .from(productsTable)
  .limit(1);
if (!store || !product) {
  console.error("dev DB 缺 store / product seed，無法跑 smoke");
  process.exit(1);
}

const createdOrderIds = [];
async function makeTestOrder(trackingCode) {
  const token = `step7f-smoke-${trackingCode}`;
  const [order] = await db
    .insert(ordersTable)
    .values({
      productId: product.id,
      storeId: store.id,
      publicToken: token,
      buyerName: "SMOKE-TEST",
      buyerPhone: "0900000000",
      pickupMethod: "convenience_store",
      unitPrice: "100",
      totalPrice: "100",
    })
    .returning({ id: ordersTable.id });
  createdOrderIds.push(order.id);
  const [tracking] = await db
    .insert(shipmentTrackingsTable)
    .values({
      orderId: order.id,
      trackingCode,
      trackingProvider: "familymart",
      sourceType: "manual",
      trackingStatus: "pending",
    })
    .returning({ id: shipmentTrackingsTable.id });
  return tracking.id;
}

// known code：若 DB 已有該 tracking（Excel 匯入），直接用它；否則建測試單
let knownId,
  knownIsTestData = false;
const [existing] = await db
  .select({ id: shipmentTrackingsTable.id })
  .from(shipmentTrackingsTable)
  .where(
    and(
      eq(shipmentTrackingsTable.trackingProvider, "familymart"),
      eq(shipmentTrackingsTable.trackingCode, KNOWN),
    ),
  );
if (existing) {
  knownId = existing.id;
  console.log(
    `known code ${mask(KNOWN)} 已存在 tracking #${knownId}（沿用既有資料，更新即正式貨態）`,
  );
} else {
  knownId = await makeTestOrder(KNOWN);
  knownIsTestData = true;
  console.log(`known code ${mask(KNOWN)} 建立測試 tracking #${knownId}`);
}

try {
  // --- 1. dryRun：可查到 in_transit，且不寫 DB ---
  const before = await getTracking(knownId);
  const dry = await runFamilyMartTrackingWorker({
    trackingIds: [knownId],
    dryRun: true,
  });
  check("dryRun: totalJobs = 1", dry.totalJobs === 1, JSON.stringify(dry));
  check(
    "dryRun: success",
    dry.results[0]?.status === "success",
    JSON.stringify(dry.results),
  );
  check(
    "dryRun: normalizedStatus 有值",
    Boolean(dry.results[0]?.normalizedStatus),
  );
  check("dryRun: runLogId = null", dry.runLogId === null);
  const afterDry = await getTracking(knownId);
  check(
    "dryRun: 不寫 shipment_trackings",
    String(afterDry.lastCheckedAt) === String(before.lastCheckedAt) &&
      afterDry.trackingStatus === before.trackingStatus,
  );
  const eventsAfterDry = await countEvents(knownId);
  console.log(
    `  → dryRun normalizedStatus=${dry.results[0]?.normalizedStatus} latest="${dry.results[0]?.latestStatusText}"`,
  );

  // --- 2. 實跑：更新 trackings + events + run log ---
  const run1 = await runFamilyMartTrackingWorker({ trackingIds: [knownId] });
  check(
    "run1: success",
    run1.results[0]?.status === "success",
    JSON.stringify(run1.results),
  );
  check("run1: runLogId 有值", typeof run1.runLogId === "number");
  const t1 = await getTracking(knownId);
  check(
    "run1: tracking_status 更新（非 pending）",
    t1.trackingStatus !== "pending" &&
      ["active", "delivered"].includes(t1.trackingStatus),
    t1.trackingStatus,
  );
  check(
    "run1: latest_event_description 有值",
    Boolean(t1.latestEventDescription),
    t1.latestEventDescription,
  );
  check("run1: latest_event_at 有值", t1.latestEventAt !== null);
  check("run1: last_checked_at 有值", t1.lastCheckedAt !== null);
  check("run1: failure_count = 0", t1.failureCount === 0);
  check("run1: check_error = null", t1.checkError === null);
  const ev1 = await countEvents(knownId);
  check(
    "run1: events 寫入",
    ev1 > eventsAfterDry,
    `before=${eventsAfterDry} after=${ev1}`,
  );
  const [log1] = await db
    .select()
    .from(shipmentTrackingRunLogsTable)
    .where(eq(shipmentTrackingRunLogsTable.id, run1.runLogId));
  check(
    "run1: run log status = success",
    log1?.status === "success",
    log1?.status,
  );
  check(
    "run1: run log counts",
    log1?.totalJobs === 1 &&
      log1?.successCount === 1 &&
      log1?.failedCount === 0,
  );

  // --- 3. 重跑：不重複寫 events ---
  const run2 = await runFamilyMartTrackingWorker({ trackingIds: [knownId] });
  check("run2: success", run2.results[0]?.status === "success");
  const ev2 = await countEvents(knownId);
  check("run2: 不重複寫 events", ev2 === ev1, `before=${ev1} after=${ev2}`);
  check(
    "run2: insertedEventCount = 0",
    run2.results[0]?.insertedEventCount === 0,
    run2.results[0]?.insertedEventCount,
  );
  const t2 = await getTracking(knownId);
  check(
    "run2: tracking 狀態保持正確",
    t2.trackingStatus === t1.trackingStatus && t2.failureCount === 0,
  );

  // --- 4. fake code：failure + exception + run log failed ---
  const fakeId = await makeTestOrder(FAKE);
  const runF = await runFamilyMartTrackingWorker({ trackingIds: [fakeId] });
  check(
    "fake: failed",
    runF.results[0]?.status === "failed",
    JSON.stringify(runF.results),
  );
  check(
    "fake: errorCode = NO_RESULT",
    runF.results[0]?.errorCode === "NO_RESULT",
    runF.results[0]?.errorCode,
  );
  const tf = await getTracking(fakeId);
  check("fake: failure_count = 1", tf.failureCount === 1, tf.failureCount);
  check("fake: check_error 有值", Boolean(tf.checkError), tf.checkError);
  check(
    "fake: tracking_status = failed（non-retryable）",
    tf.trackingStatus === "failed",
    tf.trackingStatus,
  );
  const exs = await db
    .select()
    .from(shipmentTrackingExceptionsTable)
    .where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, fakeId));
  check("fake: exception 建立", exs.length === 1, exs.length);
  check(
    "fake: exception open/error/non-retryable",
    exs[0]?.status === "open" &&
      exs[0]?.severity === "error" &&
      exs[0]?.retryable === false,
  );
  const [logF] = await db
    .select()
    .from(shipmentTrackingRunLogsTable)
    .where(eq(shipmentTrackingRunLogsTable.id, runF.runLogId));
  check(
    "fake: run log status = failed",
    logF?.status === "failed",
    logF?.status,
  );
  check(
    "fake: run log errorSummary 含 NO_RESULT",
    /NO_RESULT/.test(logF?.errorSummary ?? ""),
    logF?.errorSummary,
  );
} finally {
  // --- 清除本 script 建立的測試資料（exception 先刪再刪 order，tracking/events cascade） ---
  for (const orderId of createdOrderIds) {
    const trackings = await db
      .select({ id: shipmentTrackingsTable.id })
      .from(shipmentTrackingsTable)
      .where(eq(shipmentTrackingsTable.orderId, orderId));
    for (const t of trackings) {
      await db
        .delete(shipmentTrackingExceptionsTable)
        .where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, t.id));
    }
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  }
  if (createdOrderIds.length)
    console.log(
      `已清除 ${createdOrderIds.length} 筆測試 order（cascade tracking/events）`,
    );
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
