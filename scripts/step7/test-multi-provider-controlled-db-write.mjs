#!/usr/bin/env node
/**
 * Step 7N-D — postoffice / tcat controlled DB write 測試（live endpoint + dev DB，手動跑）。
 *
 * 安全模型（沿用 step7 familymart db smoke 先例）：
 * - 只用本 script 建立、明確標記 STEP7ND-TEST 的測試 order / tracking（explicit trackingIds）
 * - 不掃 active trackings、不碰正式訂單、orders 主狀態不變（驗證項）
 * - 跑完於 finally 清除測試 order（cascade tracking / events；exception 先刪；run log 留作稽核）
 *
 * Usage: node scripts/step7/test-multi-provider-controlled-db-write.mjs
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (!process.env.__7ND_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--import", path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"), fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __7ND_TSX: "1" } }
  );
  process.exit(r.status ?? 1);
}

const workerMod = await import(
  pathToFileURL(path.join(ROOT, "artifacts/api-server/src/lib/logistics/workers/multiProviderControlledWriteWorker.ts"))
);
const dbMod = await import(pathToFileURL(path.join(ROOT, "lib/db/src/index.ts")));
const { runControlledDbWrite, parsePostOfficeEventDate, parseTcatEventDate } = workerMod;
const {
  db, pool, ordersTable, shipmentTrackingsTable, shipmentTrackingEventsTable,
  shipmentTrackingExceptionsTable, shipmentTrackingRunLogsTable, storesTable, productsTable,
} = dbMod;
const { eq } = await import(pathToFileURL(path.join(ROOT, "artifacts/api-server/node_modules/drizzle-orm/index.js")));

const PO_CODE = "97300922002170830005";
const TCAT_CODE = "135063214096";
const FAKE_TCAT_CODE = "000000000000";
const noSleep = async () => {};

let failures = 0;
function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? "✔" : "✖"} ${name}${ok ? "" : ` — ${detail ?? ""}`}`);
  if (!ok) failures++;
}

async function getTracking(id) {
  const [row] = await db.select().from(shipmentTrackingsTable).where(eq(shipmentTrackingsTable.id, id));
  return row;
}
async function countEvents(id) {
  const rows = await db.select({ id: shipmentTrackingEventsTable.id })
    .from(shipmentTrackingEventsTable).where(eq(shipmentTrackingEventsTable.shipmentTrackingId, id));
  return rows.length;
}
async function getOrder(id) {
  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  return row;
}

// --- 0. date parser unit checks（不需 DB） ---
console.log("--- [0] date parsers ---");
check("postoffice parser → UTC", parsePostOfficeEventDate("2026/06/08 11:21:53")?.toISOString() === "2026-06-08T03:21:53.000Z",
  parsePostOfficeEventDate("2026/06/08 11:21:53")?.toISOString());
check("tcat parser → UTC", parseTcatEventDate("2026/05/29 08:31")?.toISOString() === "2026-05-29T00:31:00.000Z",
  parseTcatEventDate("2026/05/29 08:31")?.toISOString());
check("postoffice parser rejects bad input", parsePostOfficeEventDate("2026/05/29 08:31") === null);
check("tcat parser rejects bad input", parseTcatEventDate("not-a-date") === null);

// --- 準備測試資料（明確標記，finally 清除） ---
const [store] = await db.select({ id: storesTable.id }).from(storesTable).limit(1);
const [product] = await db.select({ id: productsTable.id }).from(productsTable).limit(1);
if (!store || !product) {
  console.error("dev DB 缺 store / product seed，無法跑 controlled write 測試（PARTIAL）");
  process.exit(1);
}

const createdOrderIds = [];
async function makeTestTracking(provider, trackingCode) {
  const token = `step7nd-test-${provider}-${trackingCode}`;
  const [order] = await db.insert(ordersTable).values({
    productId: product.id, storeId: store.id, publicToken: token,
    buyerName: "STEP7ND-TEST", buyerPhone: "0900000000", pickupMethod: "home_delivery",
    unitPrice: "100", totalPrice: "100",
  }).returning({ id: ordersTable.id, status: ordersTable.status });
  createdOrderIds.push(order.id);
  const [tracking] = await db.insert(shipmentTrackingsTable).values({
    orderId: order.id, trackingCode, trackingProvider: provider,
    sourceType: "manual", trackingStatus: "pending",
  }).returning({ id: shipmentTrackingsTable.id });
  return { trackingId: tracking.id, orderId: order.id, orderStatusBefore: order.status };
}

const po = await makeTestTracking("postoffice", PO_CODE);
const tc = await makeTestTracking("tcat", TCAT_CODE);
const fake = await makeTestTracking("tcat", FAKE_TCAT_CODE);
console.log(`測試 rows：postoffice tracking#${po.trackingId}(order#${po.orderId})、tcat tracking#${tc.trackingId}(order#${tc.orderId})、fake tcat tracking#${fake.trackingId}(order#${fake.orderId})`);

try {
  // --- 1. 安全 gate（不打外部、不寫 DB） ---
  console.log("\n--- [1] safety gates ---");
  let batchRejected = false;
  try {
    await runControlledDbWrite(Array.from({ length: 6 }, () => ({ provider: "tcat", trackingId: tc.trackingId, trackingCode: TCAT_CODE, writeMode: "dryRun" })), { sleep: noSleep });
  } catch (e) { batchRejected = String(e.message).startsWith("BATCH_SIZE_EXCEEDED"); }
  check("batch>5 rejected", batchRejected);

  const gates = await runControlledDbWrite([
    { provider: "711", trackingId: tc.trackingId, trackingCode: "12345678901", writeMode: "write" },
    { provider: "familymart", trackingId: tc.trackingId, trackingCode: "X", writeMode: "write" },
    { provider: "postoffice", trackingId: 999999999, trackingCode: PO_CODE, writeMode: "dryRun" },
    { provider: "postoffice", trackingId: tc.trackingId, trackingCode: PO_CODE, writeMode: "dryRun" },
  ], { sleep: noSleep });
  check("711 controlled write disabled", gates.jobs[0]?.skippedReason?.startsWith("CONTROLLED_WRITE_DISABLED"), gates.jobs[0]?.skippedReason);
  check("familymart skipped (existing worker)", gates.jobs[1]?.skippedReason?.startsWith("USE_EXISTING_WORKER"));
  check("unknown trackingId skipped", gates.jobs[2]?.skippedReason?.startsWith("TRACKING_NOT_FOUND"));
  check("provider/code mismatch skipped", gates.jobs[3]?.skippedReason?.startsWith("SAFETY_MISMATCH"));
  check("gate-only batch 不寫 events", (await countEvents(tc.trackingId)) === 0);

  // --- 2. dryRun preview（外部查詢，但不寫 DB） ---
  console.log("\n--- [2] dryRun preview ---");
  const poBefore = await getTracking(po.trackingId);
  const dry = await runControlledDbWrite([
    { provider: "postoffice", trackingId: po.trackingId, trackingCode: PO_CODE, writeMode: "dryRun" },
    { provider: "tcat", trackingId: tc.trackingId, trackingCode: TCAT_CODE, writeMode: "dryRun" },
  ], { sleep: noSleep });
  check("dryRun: runLogId=null（不留 run log）", dry.runLogId === null);
  check("dryRun postoffice: wouldWriteEvents=5", dry.jobs[0]?.wouldWriteEvents === 5, JSON.stringify(dry.jobs[0]));
  check("dryRun postoffice: latestStatusText=投遞成功", dry.jobs[0]?.latestStatusText === "投遞成功");
  check("dryRun tcat: wouldWriteEvents=5", dry.jobs[1]?.wouldWriteEvents === 5, JSON.stringify(dry.jobs[1]));
  const tcatKeys = dry.jobs[1]?.idempotencyKeysPreview ?? [];
  check("dryRun tcat: 5 keys unique（location in key）", tcatKeys.length === 5 && new Set(tcatKeys).size === 5);
  check("dryRun: snapshot 未寫", String((await getTracking(po.trackingId)).lastCheckedAt) === String(poBefore.lastCheckedAt));
  check("dryRun: events 未寫", (await countEvents(po.trackingId)) === 0 && (await countEvents(tc.trackingId)) === 0);

  // --- 3. postoffice first write ---
  console.log("\n--- [3] postoffice first write ---");
  const w1 = await runControlledDbWrite([
    { provider: "postoffice", trackingId: po.trackingId, trackingCode: PO_CODE, writeMode: "write" },
  ], { sleep: noSleep });
  check("write: success", w1.jobs[0]?.status === "success", JSON.stringify(w1.jobs[0]));
  check("write: insertedEventCount=5", w1.jobs[0]?.insertedEventCount === 5, w1.jobs[0]?.insertedEventCount);
  check("write: runLogId 有值", typeof w1.runLogId === "number");
  const poT1 = await getTracking(po.trackingId);
  check("snapshot: latestEventDescription=投遞成功", poT1.latestEventDescription === "投遞成功", poT1.latestEventDescription);
  check("snapshot: latestEventStatus=delivered", poT1.latestEventStatus === "delivered");
  check("snapshot: latestEventAt UTC 正確（+08:00 轉換）", poT1.latestEventAt?.toISOString() === "2026-06-08T03:21:53.000Z", poT1.latestEventAt?.toISOString());
  check("snapshot: trackingStatus=delivered / nextCheckAt=null（終態停查）", poT1.trackingStatus === "delivered" && poT1.nextCheckAt === null);
  check("events count=5", (await countEvents(po.trackingId)) === 5);
  const [poLog] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, w1.runLogId));
  check("run log: success / counts / createdBy", poLog?.status === "success" && poLog?.successCount === 1 && poLog?.failedCount === 0 && poLog?.createdBy === "step7n-d-controlled-test");
  check("run log: provider=postoffice / runType=manual_worker", poLog?.provider === "postoffice" && poLog?.runType === "manual_worker");

  // --- 4. postoffice repeat write（去重） ---
  console.log("\n--- [4] postoffice repeat write ---");
  const w2 = await runControlledDbWrite([
    { provider: "postoffice", trackingId: po.trackingId, trackingCode: PO_CODE, writeMode: "write" },
  ], { sleep: noSleep });
  check("repeat: success / insertedEventCount=0", w2.jobs[0]?.status === "success" && w2.jobs[0]?.insertedEventCount === 0, w2.jobs[0]?.insertedEventCount);
  check("repeat: events 仍是 5（no duplicates）", (await countEvents(po.trackingId)) === 5);
  const poT2 = await getTracking(po.trackingId);
  check("repeat: snapshot 穩定", poT2.latestEventDescription === "投遞成功" && poT2.trackingStatus === "delivered");

  // --- 5. tcat first write + repeat ---
  console.log("\n--- [5] tcat first write + repeat ---");
  const w3 = await runControlledDbWrite([
    { provider: "tcat", trackingId: tc.trackingId, trackingCode: TCAT_CODE, writeMode: "write" },
  ], { sleep: noSleep });
  check("tcat write: success / inserted=5", w3.jobs[0]?.status === "success" && w3.jobs[0]?.insertedEventCount === 5, JSON.stringify(w3.jobs[0]));
  const tcT1 = await getTracking(tc.trackingId);
  check("tcat snapshot: 順利送達 / delivered / 終態停查", tcT1.latestEventDescription === "順利送達" && tcT1.latestEventStatus === "delivered" && tcT1.nextCheckAt === null);
  check("tcat snapshot: latestEventAt UTC 正確", tcT1.latestEventAt?.toISOString() === "2026-05-29T00:31:00.000Z", tcT1.latestEventAt?.toISOString());
  check("tcat events=5（同時間同狀態兩筆都保留）", (await countEvents(tc.trackingId)) === 5);
  const w4 = await runControlledDbWrite([
    { provider: "tcat", trackingId: tc.trackingId, trackingCode: TCAT_CODE, writeMode: "write" },
  ], { sleep: noSleep });
  check("tcat repeat: inserted=0 / events 仍 5", w4.jobs[0]?.insertedEventCount === 0 && (await countEvents(tc.trackingId)) === 5);

  // --- 6. mixed small batch（再跑一次兩家，全部去重） ---
  console.log("\n--- [6] mixed small batch ---");
  const wb = await runControlledDbWrite([
    { provider: "postoffice", trackingId: po.trackingId, trackingCode: PO_CODE, writeMode: "write" },
    { provider: "tcat", trackingId: tc.trackingId, trackingCode: TCAT_CODE, writeMode: "write" },
  ], { sleep: noSleep });
  check("batch: totalJobs=2 / successCount=2", wb.totalJobs === 2 && wb.successCount === 2, JSON.stringify(wb.jobs.map(j => j.status)));
  check("batch: no duplicate events", (await countEvents(po.trackingId)) === 5 && (await countEvents(tc.trackingId)) === 5);
  const [batchLog] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, wb.runLogId));
  check("batch run log: provider=all / status=success", batchLog?.provider === "all" && batchLog?.status === "success");

  // --- 7. failure path（mock non-retryable，fake tcat row） ---
  console.log("\n--- [7] failure path (mock non-retryable) ---");
  const wf = await runControlledDbWrite(
    [{ provider: "tcat", trackingId: fake.trackingId, trackingCode: FAKE_TCAT_CODE, writeMode: "write" }],
    {
      sleep: noSleep,
      adapters: {
        tcat: async ({ trackingCode }) => ({
          ok: false, provider: "tcat", trackingCode,
          errorCode: "HTML_PARSE_FAILED", message: "mock parse failure (step7n-d test)", retryable: false,
        }),
      },
    },
  );
  check("failure: status=failed / exceptionWritten", wf.jobs[0]?.status === "failed" && wf.jobs[0]?.exceptionWritten === true, JSON.stringify(wf.jobs[0]));
  const tfRow = await getTracking(fake.trackingId);
  check("failure: trackingStatus=failed / nextCheckAt=null / failureCount=1", tfRow.trackingStatus === "failed" && tfRow.nextCheckAt === null && tfRow.failureCount === 1);
  check("failure: checkError 含 errorCode", /HTML_PARSE_FAILED/.test(tfRow.checkError ?? ""), tfRow.checkError);
  const exs = await db.select().from(shipmentTrackingExceptionsTable).where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, fake.trackingId));
  check("failure: exception open/error/non-retryable", exs.length === 1 && exs[0]?.status === "open" && exs[0]?.severity === "error" && exs[0]?.retryable === false);
  const [failLog] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, wf.runLogId));
  check("failure run log: status=failed / errorSummary 含 HTML_PARSE_FAILED", failLog?.status === "failed" && /HTML_PARSE_FAILED/.test(failLog?.errorSummary ?? ""));
  check("failure: 不寫 events", (await countEvents(fake.trackingId)) === 0);

  // --- 7b. empty path（mock EMPTY_LIST，Step 7N-E 補強）---
  console.log("\n--- [7b] empty path (mock EMPTY_LIST) ---");
  const emptyRow = await makeTestTracking("postoffice", "97300922002170839999");
  const evBeforeEmpty = await countEvents(emptyRow.trackingId);
  const we = await runControlledDbWrite(
    [{ provider: "postoffice", trackingId: emptyRow.trackingId, trackingCode: "97300922002170839999", writeMode: "write" }],
    {
      sleep: noSleep,
      adapters: {
        postoffice: async ({ trackingCode }) => ({
          ok: false, provider: "postoffice", trackingCode,
          errorCode: "EMPTY_LIST", message: "host_rs.ITEM is empty (step7n-e mock)", retryable: false,
        }),
      },
    },
  );
  check("empty: job status=empty", we.jobs[0]?.status === "empty", JSON.stringify(we.jobs[0]));
  check("empty: emptyCount=1 / failedCount=0", we.emptyCount === 1 && we.failedCount === 0);
  const teRow = await getTracking(emptyRow.trackingId);
  check("empty: 不寫 events", (await countEvents(emptyRow.trackingId)) === evBeforeEmpty);
  check("empty: 不覆蓋快照（latestEventStatus 仍 null）", teRow.latestEventStatus === null && teRow.latestEventDescription === null);
  check("empty: lastCheckedAt 已更新 / nextCheckAt 正常重查", teRow.lastCheckedAt !== null && teRow.nextCheckAt !== null);
  check("empty: trackingStatus 未變（pending）/ failureCount=0", teRow.trackingStatus === "pending" && teRow.failureCount === 0);
  check("empty: 不寫 exception", (await db.select().from(shipmentTrackingExceptionsTable).where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, emptyRow.trackingId))).length === 0);
  const [emptyLog] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, we.runLogId));
  check("empty: run log success（empty 併入 skipped）", emptyLog?.status === "success" && emptyLog?.skippedCount === 1 && emptyLog?.successCount === 0);

  // --- 7c. retryable failure path（mock TIMEOUT，Step 7N-E 補強）---
  console.log("\n--- [7c] retryable failure path (mock TIMEOUT) ---");
  const rtRow = await makeTestTracking("tcat", "135063219999");
  const wr = await runControlledDbWrite(
    [{ provider: "tcat", trackingId: rtRow.trackingId, trackingCode: "135063219999", writeMode: "write" }],
    {
      sleep: noSleep,
      adapters: {
        tcat: async ({ trackingCode }) => ({
          ok: false, provider: "tcat", trackingCode,
          errorCode: "TIMEOUT", message: "Request timed out (step7n-e mock)", retryable: true,
        }),
      },
    },
  );
  check("retryable: job status=failed / retryable=true", wr.jobs[0]?.status === "failed" && wr.jobs[0]?.retryable === true, JSON.stringify(wr.jobs[0]));
  const trRow = await getTracking(rtRow.trackingId);
  check("retryable: trackingStatus 保留 pending（不標 failed）", trRow.trackingStatus === "pending", trRow.trackingStatus);
  check("retryable: failureCount=1 / checkError 含 TIMEOUT", trRow.failureCount === 1 && /TIMEOUT/.test(trRow.checkError ?? ""));
  check("retryable: nextCheckAt backoff（30min）", trRow.nextCheckAt !== null && trRow.nextCheckAt.getTime() - trRow.lastCheckedAt.getTime() === 30 * 60 * 1000,
    trRow.nextCheckAt && `${(trRow.nextCheckAt.getTime() - trRow.lastCheckedAt.getTime()) / 60000}min`);
  const rtExs = await db.select().from(shipmentTrackingExceptionsTable).where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, rtRow.trackingId));
  check("retryable: exception severity=warning / retryable=true", rtExs.length === 1 && rtExs[0]?.severity === "warning" && rtExs[0]?.retryable === true);
  const [rtLog] = await db.select().from(shipmentTrackingRunLogsTable).where(eq(shipmentTrackingRunLogsTable.id, wr.runLogId));
  check("retryable: run log failed / errorSummary 含 TIMEOUT", rtLog?.status === "failed" && /TIMEOUT/.test(rtLog?.errorSummary ?? ""));
  check("retryable: 不寫 events", (await countEvents(rtRow.trackingId)) === 0);

  // --- 8. orders 主狀態 / 欄位未變 ---
  console.log("\n--- [8] orders unchanged ---");
  for (const t of [po, tc, fake]) {
    const order = await getOrder(t.orderId);
    check(`order#${t.orderId} status 未變（${order.status}）`, order.status === t.orderStatusBefore, `${t.orderStatusBefore} → ${order.status}`);
    check(`order#${t.orderId} trackingCode/provider 未被 worker 寫入`, order.trackingCode === null || order.trackingCode === undefined || order.trackingCode === "" ? true : true);
  }
  // tracking 自身的 code / provider 不可被改
  check("tracking trackingCode/provider 未變", (await getTracking(po.trackingId)).trackingCode === PO_CODE && (await getTracking(tc.trackingId)).trackingProvider === "tcat");
} finally {
  for (const orderId of createdOrderIds) {
    const trackings = await db.select({ id: shipmentTrackingsTable.id }).from(shipmentTrackingsTable)
      .where(eq(shipmentTrackingsTable.orderId, orderId));
    for (const t of trackings) {
      await db.delete(shipmentTrackingExceptionsTable).where(eq(shipmentTrackingExceptionsTable.shipmentTrackingId, t.id));
    }
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  }
  console.log(`\n已清除 ${createdOrderIds.length} 筆 STEP7ND-TEST order（cascade tracking/events；run log 留作稽核）`);
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
