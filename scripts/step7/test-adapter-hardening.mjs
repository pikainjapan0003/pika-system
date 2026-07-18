/**
 * Step 7M-B：adapter hardening — negative validation
 *
 * 所有測試使用 mock / injected fetchImpl，不打外部網站。
 *
 * 用法：node --experimental-strip-types scripts/step7/test-adapter-hardening.mjs
 */

import { queryPostOfficeTracking } from "../../artifacts/api-server/src/lib/logistics/adapters/postOfficeAdapter.ts";
import { queryTcatTracking } from "../../artifacts/api-server/src/lib/logistics/adapters/tcatAdapter.ts";

// ---------------------------------------------------------------------------
// Mini test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log("  PASS", label);
    passed++;
  } catch (err) {
    console.error("  FAIL", label, "—", err.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assertion failed");
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error(
      msg ??
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

/** Returns a Response-like object with the given body and status. */
function makeMockFetch(body, status = 200) {
  const ok = status >= 200 && status < 300;
  const textFn = async () =>
    typeof body === "string" ? body : JSON.stringify(body);
  return async (_url, _opts) => ({ ok, status, text: textFn });
}

/** Mock fetch that throws a network error. */
function makeNetworkErrorFetch(message = "network error") {
  return async () => {
    throw new Error(message);
  };
}

/** Mock fetch that throws a TimeoutError. */
function makeTimeoutFetch() {
  return async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    throw err;
  };
}

// ---------------------------------------------------------------------------
// postoffice mock data
// ---------------------------------------------------------------------------

const PO_TRACKING = "97300922002170830005";

function makePostOfficeSuccessBody(overrides = {}) {
  return [
    {
      header: { OutputType: "Screen" },
      body: {
        cptCheck: false,
        host_rs: {
          ITEM: [
            {
              MAILNO: PO_TRACKING,
              DATIME: "20260608112153",
              STATUS: "投遞成功",
              BRHNC: "鳳山郵局快捷股",
              EVCODE: "I4",
            },
            {
              MAILNO: PO_TRACKING,
              DATIME: "20260605162332",
              STATUS: "交寄郵件",
              BRHNC: "板橋江翠郵局",
              EVCODE: "A1",
            },
          ],
        },
        incorrectList: [],
        ...overrides,
      },
    },
    {
      header: { OutputType: "EndBracket" },
      body: { result: "success" },
    },
  ];
}

function makePostOfficeMessageOnlyBody(
  msgCode = "Z999",
  msgData = "Z899|資料欄位未完成。",
) {
  return [
    {
      header: { OutputType: "Message" },
      body: { showType: "Show", messageType: "Ok", msgCode, msgData },
    },
    {
      header: { OutputType: "EndBracket" },
      body: { result: "success" },
    },
  ];
}

// ---------------------------------------------------------------------------
// tcat mock HTML helpers
// ---------------------------------------------------------------------------

const TCAT_TRACKING = "135063214096";

function makeTcatSuccessHtml(trackingCode = TCAT_TRACKING) {
  // Single space between cells → after stripTags+normalize, datetime removal leaves 2 spaces between status+location
  return `<html><body>
<table id="resultTable" cellpadding="2" border="1">
  <tr class="top">
    <td>包裹查詢號碼</td><td>貨態</td><td>資料登入時間</td><td>負責營業所</td>
  </tr>
  <tr>
    <td rowspan="3">${trackingCode}</td>
    <td>順利送達</td>
    <td>2026/05/29 08:31</td>
    <td>新營營業所</td>
  </tr>
  <tr>
    <td>配送中</td>
    <td>2026/05/29 07:02</td>
    <td>新營營業所</td>
  </tr>
  <tr>
    <td>已集貨</td>
    <td>2026/05/28 15:57</td>
    <td>板橋一營業所</td>
  </tr>
</table>
</body></html>`;
}

/** HTML with noise rows OUTSIDE resultTable (mirrors real page structure) */
function makeTcatNoiseOutsideHtml() {
  return `<html><body>
<table id="resultTable" cellpadding="2" border="1">
  <tr>
    <td rowspan="2">${TCAT_TRACKING}</td>
    <td>順利送達</td>
    <td>2026/05/29 08:31</td>
    <td>新營營業所</td>
  </tr>
  <tr>
    <td>配送中</td>
    <td>2026/05/29 07:02</td>
    <td>新營營業所</td>
  </tr>
</table>
<!-- Noise section outside resultTable — should be ignored by parser -->
<table id="exampleTable">
  <tr>
    <td>2021/06/18 08:03</td>
    <td>未順利取件，請洽客服中心</td>
    <td><a href="">嘉義營業所</a></td>
  </tr>
</table>
</body></html>`;
}

/** HTML without resultTable but still containing trackingCode */
function makeTcatNoResultTableHtml() {
  return `<html><body>
<p>已查詢 ${TCAT_TRACKING}</p>
<table id="otherTable">
  <tr><td>no tracking data</td></tr>
</table>
</body></html>`;
}

/** HTML with resultTable but rows without valid datetime */
function makeTcatEmptyResultTableHtml() {
  return `<html><body>
<table id="resultTable" cellpadding="2" border="1">
  <tr class="top"><td>包裹查詢號碼</td><td>貨態</td></tr>
  <tr><td>${TCAT_TRACKING}</td><td>查無資料</td></tr>
</table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\n=== postoffice hardening ===\n");

await test("postoffice success mock — ok=true, 2 events, latestStatus=投遞成功", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(makePostOfficeSuccessBody()) },
  );
  assert(result.ok === true, `ok should be true, got ${result.ok}`);
  if (!result.ok) return;
  assertEqual(result.provider, "postoffice");
  assertEqual(result.trackingCode, PO_TRACKING);
  assertEqual(
    result.latestStatusText,
    "投遞成功",
    "latestStatus should be 投遞成功 (newest first)",
  );
  assertEqual(
    result.latestEventAt,
    "2026/06/08 11:21:53",
    "latestEventAt DATIME 14-digit parsed",
  );
  assert(
    result.events.length === 2,
    `expected 2 events, got ${result.events.length}`,
  );
  // Verify rawData does not contain sensitive fields
  const raw = result.events[0].rawData;
  assert(!("name" in raw), "rawData must not contain name");
  assert(!("phone" in raw), "rawData must not contain phone");
  assert(!("address" in raw), "rawData must not contain address");
  // Verify DATIME conversion
  assertEqual(result.events[0].occurredAt, "2026/06/08 11:21:53");
});

await test("postoffice EMPTY_LIST — ITEM is empty array", async () => {
  const body = makePostOfficeSuccessBody({ host_rs: { ITEM: [] } });
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "EMPTY_LIST");
});

await test("postoffice REMOTE_CHANGED — no Screen element (Message-only)", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(makePostOfficeMessageOnlyBody()) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
  assert(
    result.message.includes("Z899"),
    "message should include server msgData",
  );
});

await test("postoffice REMOTE_CHANGED — ITEM is not an array", async () => {
  const body = makePostOfficeSuccessBody({ host_rs: { ITEM: "not-an-array" } });
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
});

await test("postoffice REMOTE_CHANGED — MAILNO mismatch", async () => {
  const body = [
    {
      header: { OutputType: "Screen" },
      body: {
        cptCheck: false,
        host_rs: {
          ITEM: [
            {
              MAILNO: "99999999999999999999",
              DATIME: "20260608112153",
              STATUS: "投遞成功",
              BRHNC: "某郵局",
            },
          ],
        },
        incorrectList: [],
      },
    },
  ];
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
  assert(result.message.includes("MAILNO"), "message should mention MAILNO");
});

await test("postoffice VERIFY_FAILED — cptCheck=true in Screen body", async () => {
  const body = makePostOfficeSuccessBody({ cptCheck: true });
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "VERIFY_FAILED");
});

await test("postoffice PARSER_FAILED — non-JSON response", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch("<html>error page</html>") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "PARSER_FAILED");
});

await test("postoffice REMOTE_ERROR — HTTP 500", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch("", 500) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_ERROR");
});

await test("postoffice NETWORK_FAILED — fetch throws", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeNetworkErrorFetch("ECONNREFUSED") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "NETWORK_FAILED");
});

await test("postoffice TIMEOUT — fetch throws TimeoutError", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeTimeoutFetch() },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "TIMEOUT");
});

await test("postoffice REMOTE_CHANGED — response not array", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch({ wrong: "object" }) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
});

await test("postoffice REMOTE_CHANGED — missing host_rs", async () => {
  const body = [
    { header: { OutputType: "Screen" }, body: { cptCheck: false } },
  ];
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
});

await test("postoffice INVALID_TRACKING_CODE — empty string", async () => {
  const result = await queryPostOfficeTracking(
    { trackingCode: "" },
    { fetchImpl: makeNetworkErrorFetch("should not be called") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "INVALID_TRACKING_CODE");
});

await test("postoffice DATIME non-14 digit handled gracefully", async () => {
  const body = makePostOfficeSuccessBody();
  // Override one item to have invalid DATIME
  body[0].body.host_rs.ITEM[0].DATIME = "INVALID";
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  // Should still succeed (invalid DATIME → null occurredAt)
  assert(result.ok === true, `ok should be true, got ${result.ok}`);
  if (!result.ok) return;
  const withNull = result.events.find((e) => e.occurredAt === null);
  assert(
    withNull !== undefined,
    "event with invalid DATIME should have null occurredAt",
  );
});

await test("postoffice latest sorting — newest first", async () => {
  const body = makePostOfficeSuccessBody();
  // First item in array has older date to test sort
  body[0].body.host_rs.ITEM = [
    {
      MAILNO: PO_TRACKING,
      DATIME: "20260605162332",
      STATUS: "交寄郵件",
      BRHNC: "板橋江翠郵局",
      EVCODE: "A1",
    },
    {
      MAILNO: PO_TRACKING,
      DATIME: "20260608112153",
      STATUS: "投遞成功",
      BRHNC: "鳳山郵局快捷股",
      EVCODE: "I4",
    },
  ];
  const result = await queryPostOfficeTracking(
    { trackingCode: PO_TRACKING },
    { fetchImpl: makeMockFetch(body) },
  );
  assert(result.ok === true);
  if (!result.ok) return;
  assertEqual(
    result.latestStatusText,
    "投遞成功",
    "newest event should be first regardless of ITEM order",
  );
});

console.log("\n=== tcat hardening ===\n");

await test("tcat success mock — ok=true, 3 events, latestStatus=順利送達", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(makeTcatSuccessHtml()) },
  );
  assert(result.ok === true, `ok should be true, got ${result.ok}`);
  if (!result.ok) return;
  assertEqual(result.provider, "tcat");
  assertEqual(result.trackingCode, TCAT_TRACKING);
  assertEqual(result.latestStatusText, "順利送達");
  assertEqual(result.latestEventAt, "2026/05/29 08:31");
  assertEqual(result.normalizedStatus, "delivered");
  assert(
    result.events.length >= 2,
    `expected >= 2 events, got ${result.events.length}`,
  );
});

await test("tcat EMPTY_LIST — response does not contain trackingCode", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch("<html><body><p>查無資料</p></body></html>") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "EMPTY_LIST");
});

await test("tcat REMOTE_CHANGED — no resultTable, no 查無 hint", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(makeTcatNoResultTableHtml()) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_CHANGED");
  assert(
    result.message.toLowerCase().includes("resulttable"),
    "message should mention resultTable",
  );
});

await test("tcat EMPTY_LIST — resultTable exists but no parseable datetime rows", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(makeTcatEmptyResultTableHtml()) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "EMPTY_LIST");
});

await test("tcat noise row filter — 2021 rows outside resultTable are NOT parsed", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(makeTcatNoiseOutsideHtml()) },
  );
  assert(result.ok === true, `ok should be true, got ${result.ok}`);
  if (!result.ok) return;
  assert(
    result.events.length === 2,
    `expected exactly 2 events from resultTable, got ${result.events.length}`,
  );
  const has2021 = result.events.some((e) => e.occurredAt?.startsWith("2021"));
  assert(!has2021, "2021 noise row should NOT appear in events");
  assertEqual(result.latestStatusText, "順利送達");
});

await test("tcat non-target rows — only rows with datetime are extracted", async () => {
  // HTML where resultTable has a header row (no datetime) + data rows
  const html = `<html><body>
<table id="resultTable">
  <tr class="top"><td>包裹查詢號碼</td><td>貨態</td><td>資料登入時間</td><td>負責營業所</td></tr>
  <tr>
    <td rowspan="2">${TCAT_TRACKING}</td>
    <td>順利送達</td>
    <td>2026/05/29 08:31</td>
    <td>新營營業所</td>
  </tr>
  <tr>
    <td>配送中</td>
    <td>2026/05/29 07:02</td>
    <td>新營營業所</td>
  </tr>
</table>
</body></html>`;
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(html) },
  );
  assert(result.ok === true);
  if (!result.ok) return;
  // Header row should be skipped (no datetime)
  assert(
    result.events.length === 2,
    `expected 2 data rows, got ${result.events.length}`,
  );
});

await test("tcat REMOTE_ERROR — HTTP 503", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch("", 503) },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "REMOTE_ERROR");
});

await test("tcat NETWORK_FAILED — fetch throws", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeNetworkErrorFetch("ECONNREFUSED") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "NETWORK_FAILED");
});

await test("tcat TIMEOUT — fetch throws TimeoutError", async () => {
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeTimeoutFetch() },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "TIMEOUT");
});

await test("tcat INVALID_TRACKING_CODE — empty string", async () => {
  const result = await queryTcatTracking(
    { trackingCode: "" },
    { fetchImpl: makeNetworkErrorFetch("should not be called") },
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEqual(result.errorCode, "INVALID_TRACKING_CODE");
});

await test("tcat latest sorting — newest first", async () => {
  // Mock with events in older-first order in HTML; adapter should sort newest first
  const html = `<html><body>
<table id="resultTable">
  <tr>
    <td rowspan="2">${TCAT_TRACKING}</td>
    <td>已集貨</td>
    <td>2026/05/28 15:57</td>
    <td>板橋一營業所</td>
  </tr>
  <tr>
    <td>順利送達</td>
    <td>2026/05/29 08:31</td>
    <td>新營營業所</td>
  </tr>
</table>
</body></html>`;
  const result = await queryTcatTracking(
    { trackingCode: TCAT_TRACKING },
    { fetchImpl: makeMockFetch(html) },
  );
  assert(result.ok === true);
  if (!result.ok) return;
  assertEqual(
    result.latestStatusText,
    "順利送達",
    "newest (2026/05/29) should be latestStatus",
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
