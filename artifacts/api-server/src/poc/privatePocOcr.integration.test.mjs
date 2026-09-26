// Real isolated PostgreSQL and HTTP routes; Clerk, R2 and provider are local fixtures.
// No provider key or paid API call is used by this suite.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";
assertPocDatabase();
Object.assign(process.env, {
  PIKA_PRIVATE_POC: "true", PIKA_OWNER_CLERK_USER_ID: "user_poc_ocr_owner",
  PIKA_POC_PROXY_SECRET: "synthetic-ocr-gateway-more-than-32-characters",
  INVOICE_OCR_ENABLED: "true", INVOICE_OCR_TEST_MODE: "true",
  INVOICE_OCR_ALLOWED_CLERK_USER_IDS: "user_poc_ocr_owner", OPENAI_INVOICE_COMPARE_MODELS: "",
  OPENAI_API_KEY: "local-test-placeholder-never-sent", LOG_LEVEL: "silent",
});
mock.module("@clerk/express", { namedExports: {
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const objects = new Map();
let storageReads = 0;
mock.module("../lib/r2.ts", { namedExports: { getR2Config: () => ({ bucket: "synthetic-ocr-only",
  client: { send: async command => {
    assert.equal(command.input.Bucket, "synthetic-ocr-only");
    assert.match(command.input.Key, /^invoice-ocr\/\d+\/[a-f0-9]{64}(?:\/runs\/\d+\.json)?$/);
    if (command.constructor.name === "PutObjectCommand") {
      objects.set(command.input.Key, { bytes: Buffer.from(command.input.Body), type: command.input.ContentType });
      return {};
    }
    storageReads++;
    const object = objects.get(command.input.Key);
    if (!object) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return { ContentType: object.type, ContentLength: object.bytes.length,
      Body: { transformToByteArray: async () => object.bytes } };
  } },
}) } });
const realDb = await import("@workspace/db");
let failCommit = false;
const dbProxy = new Proxy(realDb.db, { get(target, property) {
  if (property === "transaction") return async callback => {
    if (failCommit) { failCommit = false; throw new Error("synthetic database unavailable"); }
    return target.transaction(callback);
  };
  return Reflect.get(target, property);
} });
mock.module("@workspace/db", { namedExports: { ...realDb, db: dbProxy } });
const realProvider = await import("../lib/invoiceOcr/openaiInvoiceExtractor.ts");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const sha = createHash("sha256").update(png).digest("hex");
const prediction = { merchant_name: "SYNTHETIC OCR MART", invoice_date: "2026-09-26",
  total_amount: "123.45", currency: "TWD", review_required: true, review_reasons: ["人工複核待完成"],
  evidence: { merchant_name: "SYNTHETIC OCR MART", invoice_date: "2026-09-26", total_amount: "123.45", currency: "TWD" } };
let calls = 0, providerError = null, failSave = false, gate = null;
mock.module("../lib/invoiceOcr/openaiInvoiceExtractor.ts", { namedExports: { ...realProvider,
  extractInvoiceWithOpenAI: async (input, config) => {
    calls++;
    assert.equal(config.maxAttempts, 1);
    assert.equal(input.imageDataUrl, `data:image/png;base64,${png.toString("base64")}`);
    assert.deepEqual(Object.keys(input).sort(), ["imageDataUrl", "imageDetail", "model", "reasoningEffort"]);
    if (gate) await gate.promise;
    if (providerError) throw providerError;
    if (failSave) { failSave = false; failCommit = true; }
    return { prediction, requestedModel: input.model, actualModel: "fixture-terra-actual",
      promptVersion: "invoice-extraction-v1", imageDetail: input.imageDetail, reasoningEffort: input.reasoningEffort,
      responseId: `fixture_response_${calls}`, requestId: `fixture_request_${calls}`,
      inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedInputTokens: 0, reasoningTokens: 10,
      latencyMs: 12, attemptCount: 1 };
  },
} });
const { db, pool, storesTable, invoiceOcrTestCasesTable: cases, invoiceOcrRunsTable: runs, invoiceOcrReviewsTable: reviews } = realDb;
const { eq, inArray } = await import("drizzle-orm");
const { default: express } = await import("express");
const { default: router } = await import("../routes/invoiceOcr.ts");
const { privatePocBoundary } = await import("../lib/privatePoc.ts");
const app = express(); app.use(express.json()); app.use(privatePocBoundary); app.use("/api", router);
let server, origin, store, testCase, firstRun;
async function start() { await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); origin = `http://127.0.0.1:${server.address().port}`; }
function headers(owner = "user_poc_ocr_owner") { return { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET,
  ...(owner ? { "x-test-clerk-user": owner } : {}) }; }
const path = tail => `/api/stores/${store.id}/invoice-ocr/${tail}`;
async function analyze({ id = randomUUID(), owner, model = "gpt-5.6-terra", confirm = false } = {}) {
  const response = await fetch(origin + path(`test-cases/${testCase.id}/analyze`), { method: "POST",
    headers: { ...headers(owner), "content-type": "application/json", "x-client-request-id": id },
    body: JSON.stringify({ model, confirmRerun: String(confirm) }) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  [store] = await db.insert(storesTable).values({ name: "合成 OCR 測試", merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
    slug: `poc-ocr-${randomUUID()}` }).returning();
  process.env.PIKA_OWNER_STORE_ID = String(store.id); await start();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (store) {
    const rows = await db.select({ id: runs.id }).from(runs).where(eq(runs.storeId, store.id));
    if (rows.length) await db.delete(reviews).where(inArray(reviews.runId, rows.map(row => row.id)));
    for (const row of rows.sort((a, b) => b.id - a.id)) await db.delete(runs).where(eq(runs.id, row.id));
    await db.delete(cases).where(eq(cases.storeId, store.id));
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
  await pool.end();
});

test("normal upload saves private image and case identity in PostgreSQL", async () => {
  const form = new FormData(); form.append("image", new Blob([png], { type: "image/png" }), "synthetic.png");
  for (const [key, value] of Object.entries({ merchantName: "SYNTHETIC OCR MART", invoiceDate: "2026-09-26", totalAmount: "123.45", currency: "TWD", privacyConfirmed: "true" })) form.append(key, value);
  const response = await fetch(origin + path("test-cases"), { method: "POST", headers: headers(), body: form });
  assert.equal(response.status, 201); testCase = (await response.json()).testCase;
  assert.equal(testCase.imageSha256, sha);
  assert.deepEqual(objects.get(`invoice-ocr/${store.id}/${sha}`).bytes, png);
  const image = await fetch(origin + path(`test-cases/${testCase.id}/image`), { headers: headers() });
  assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
});
test("guest, other owner, wrong store and product-image gateway cannot read receipt or start OCR", async () => {
  for (const owner of [null, "user_other"]) {
    assert.equal((await analyze({ owner })).status, owner ? 403 : 401);
    for (const tail of ["test-cases", `test-cases/${testCase.id}/image`]) {
      assert.equal((await fetch(origin + path(tail), { headers: headers(owner) })).status, owner ? 403 : 401);
    }
  }
  assert.equal((await fetch(origin + path(`test-cases/${testCase.id}/image`).replace(`/stores/${store.id}/`, `/stores/${store.id + 1}/`), { headers: headers() })).status, 403);
  assert.equal((await fetch(origin + `/api/poc/images/invoice-ocr/${store.id}/${sha}`, { headers: headers() })).status, 403);
  assert.equal(calls, 0);
});
test("missing key, unapproved model and unavailable R2 image spend zero provider calls", async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await analyze()).body.code, "openai_key_missing");
  process.env.OPENAI_API_KEY = "local-test-placeholder-never-sent";
  assert.equal((await analyze({ model: "gpt-5.6-sol" })).body.code, "model_not_allowed");
  const key = `invoice-ocr/${store.id}/${sha}`, saved = objects.get(key); objects.delete(key);
  assert.equal((await analyze()).body.code, "invoice_image_unavailable"); objects.set(key, saved);
  assert.equal(calls, 0);
});
test("R2 bytes reach provider fixture once, concurrent ID is deduped, result persists pending review", async () => {
  const id = randomUUID(); let resolve; gate = { promise: new Promise(r => { resolve = r; }) };
  const pending = analyze({ id });
  const deadline = Date.now() + 30000;
  while (!calls && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
  if (!calls) { resolve(); gate = null; assert.fail(JSON.stringify(await pending)); }
  assert.equal((await analyze({ id })).body.run.status, "processing");
  resolve(); gate = null;
  const result = await pending; assert.equal(result.status, 201, JSON.stringify(result.body)); firstRun = result.body.run;
  assert.equal(firstRun.predicted.totalAmount, "123.45"); assert.equal(firstRun.actualModel, "fixture-terra-actual");
  assert.equal(result.body.review.reviewedAt, null); assert.equal(result.body.review.reviewedBy, null);
  assert.equal(firstRun.predicted.reviewRequired, true);
  assert.equal((await analyze({ id })).body.run.id, firstRun.id); assert.equal(calls, 1);
});
test("page data and HTTP restart read same image/result without extraction", async () => {
  await new Promise(resolve => server.close(resolve)); await start();
  const list = await (await fetch(origin + path("test-cases"), { headers: headers() })).json();
  assert.equal(list.testCases[0].runs[0].run.id, firstRun.id);
  const response = await fetch(origin + path(`test-cases/${testCase.id}/image`), { headers: headers() });
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(calls, 1);
});
test("database save failure restores validated R2 result on same request without second call", async () => {
  const id = randomUUID(); failSave = true;
  const failed = await analyze({ id, confirm: true }); assert.equal(failed.body.code, "invoice_ocr_result_save_failed");
  const before = calls; const restored = await analyze({ id });
  assert.equal(restored.status, 200, JSON.stringify(restored.body)); assert.equal(restored.body.recovered, true);
  assert.equal(restored.body.run.status, "completed"); assert.equal(restored.body.run.errorCode, null);
  assert.equal(calls, before);
});
test("provider timeout is persisted honestly and same request does not resend", async () => {
  const failure = realProvider.classifyInvoiceApiError(Object.assign(new Error("timeout"), { name: "APIConnectionTimeoutError" }));
  providerError = new realProvider.InvoiceExtractionRequestError(failure, 1, 90000);
  const id = randomUUID(); const failed = await analyze({ id, confirm: true });
  assert.equal(failed.body.code, "openai_timeout_unknown"); const before = calls;
  const same = await analyze({ id }); assert.equal(same.body.run.status, "failed");
  assert.equal(same.body.run.predicted, null); assert.equal(calls, before); providerError = null;
});
