/**
 * Invoice OCR billing-safety route tests.
 *
 * OpenAI and @workspace/db are fully mocked. No API key, network API call,
 * database connection, migration, or real invoice is used.
 *
 * Runner:
 *   node --experimental-test-module-mocks --import tsx/esm \
 *     --test src/routes/invoiceOcr.route.test.mjs
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";

const { sql } = await import("drizzle-orm");

const STORE_ID = 42;
const TEST_CASE_ID = 7;
const USER_ID = "invoice_ocr_fake_admin";
const MODEL = "gpt-5.6-terra";
const PROMPT_VERSION = "invoice-extraction-v1";
const UUIDS = {
  duplicate: "11111111-1111-4111-8111-111111111111",
  active: "22222222-2222-4222-8222-222222222222",
  stale: "33333333-3333-4333-8333-333333333333",
  confirmed: "44444444-4444-4444-8444-444444444444",
  previous: "55555555-5555-4555-8555-555555555555",
  completed: "66666666-6666-4666-8666-666666666666",
};

const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const VALID_PREDICTION = {
  merchant_name: "假商店",
  invoice_date: "2026-08-31",
  total_amount: "123.00",
  currency: "TWD",
  review_required: false,
  review_reasons: [],
  evidence: {
    merchant_name: "假商店",
    invoice_date: "2026-08-31",
    total_amount: "123.00",
    currency: "TWD",
  },
};

const columnFields = new WeakMap();

function fakeTable(name, fields) {
  const table = { __name: name };
  for (const field of fields) {
    const column = sql.raw(`"${name}"."${field}"`);
    table[field] = column;
    columnFields.set(column, field);
  }
  return table;
}

const invoiceOcrRunsTable = fakeTable("invoice_ocr_runs", [
  "id",
  "testCaseId",
  "storeId",
  "createdByUserId",
  "clientRequestId",
  "requestedModel",
  "actualModel",
  "promptVersion",
  "imageDetail",
  "reasoningEffort",
  "predictedJson",
  "reviewRequired",
  "reviewReasons",
  "evidenceJson",
  "openaiResponseId",
  "openaiRequestId",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "reasoningTokens",
  "latencyMs",
  "status",
  "safeErrorCode",
  "attemptCount",
  "rerunOfRunId",
  "createdAt",
  "completedAt",
]);

const invoiceOcrTestCasesTable = fakeTable("invoice_ocr_test_cases", [
  "id",
  "storeId",
  "createdByUserId",
  "originalFilename",
  "imageSha256",
  "groundTruthMerchantName",
  "groundTruthInvoiceDate",
  "groundTruthTotalAmount",
  "groundTruthCurrency",
  "groundTruthLockedAt",
  "createdAt",
  "updatedAt",
]);

const invoiceOcrReviewsTable = fakeTable("invoice_ocr_reviews", [
  "id",
  "runId",
  "merchantNameCorrect",
  "invoiceDateCorrect",
  "totalAmountCorrect",
  "currencyCorrect",
  "unsafeConfidentError",
  "correctedJson",
  "reviewedBy",
  "reviewedAt",
  "createdAt",
  "updatedAt",
]);

let database;
let openAiCalls;
let openAiInputs;
let openAiGate;
let nextRunId;
let nextReviewId;
const safeLogs = [];

function resetFakes() {
  const now = new Date();
  database = {
    testCases: [
      {
        id: TEST_CASE_ID,
        storeId: STORE_ID,
        createdByUserId: USER_ID,
        originalFilename: "fake.png",
        imageSha256:
          "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460",
        groundTruthMerchantName: "假商店",
        groundTruthInvoiceDate: "2026-08-31",
        groundTruthTotalAmount: "123.00",
        groundTruthCurrency: "TWD",
        groundTruthLockedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [],
    reviews: [],
  };
  openAiCalls = 0;
  openAiInputs = [];
  openAiGate = null;
  nextRunId = 100;
  nextReviewId = 500;
  safeLogs.length = 0;
}

function addProcessingRun({
  clientRequestId = UUIDS.previous,
  createdAt = new Date(),
} = {}) {
  const run = {
    id: nextRunId++,
    testCaseId: TEST_CASE_ID,
    storeId: STORE_ID,
    createdByUserId: USER_ID,
    clientRequestId,
    requestedModel: MODEL,
    actualModel: null,
    promptVersion: PROMPT_VERSION,
    imageDetail: "original",
    reasoningEffort: "low",
    predictedJson: null,
    reviewRequired: null,
    reviewReasons: null,
    evidenceJson: null,
    openaiResponseId: null,
    openaiRequestId: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    latencyMs: null,
    status: "processing",
    safeErrorCode: null,
    attemptCount: 1,
    rerunOfRunId: null,
    createdAt,
    completedAt: null,
  };
  database.runs.push(run);
  return run;
}

function collectConditionValues(value, result = []) {
  if (value instanceof Date) {
    result.push(value);
    return result;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectConditionValues(item, result);
    return result;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.queryChunks)
  ) {
    for (const chunk of value.queryChunks) {
      collectConditionValues(chunk, result);
    }
  }
  return result;
}

function filteredRows(table, condition) {
  const values = collectConditionValues(condition);
  if (table === invoiceOcrTestCasesTable) {
    return database.testCases.filter(
      (row) =>
        (!values.includes(TEST_CASE_ID) || row.id === TEST_CASE_ID) &&
        (!values.includes(STORE_ID) || row.storeId === STORE_ID),
    );
  }
  if (table === invoiceOcrReviewsTable) {
    return database.reviews.filter(
      (row) =>
        !values.some(
          (value) =>
            typeof value === "number" && value >= 100 && value !== row.runId,
        ),
    );
  }
  if (table !== invoiceOcrRunsTable) return [];

  const requestedUuid = values.find(
    (value) =>
      typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value),
  );
  const requestedStatus = values.find(
    (value) =>
      value === "processing" || value === "completed" || value === "failed",
  );
  const requestedRunId = values.find(
    (value) =>
      typeof value === "number" &&
      database.runs.some((run) => run.id === value),
  );
  const staleBefore = values.find((value) => value instanceof Date);
  return database.runs.filter(
    (row) =>
      (!requestedUuid || row.clientRequestId === requestedUuid) &&
      (!requestedStatus || row.status === requestedStatus) &&
      (!values.includes(USER_ID) || row.createdByUserId === USER_ID) &&
      (!values.includes(MODEL) || row.requestedModel === MODEL) &&
      (!values.includes(PROMPT_VERSION) ||
        row.promptVersion === PROMPT_VERSION) &&
      (!values.includes(TEST_CASE_ID) || row.testCaseId === TEST_CASE_ID) &&
      (!values.includes(STORE_ID) || row.storeId === STORE_ID) &&
      (!requestedRunId || row.id === requestedRunId) &&
      (!(staleBefore instanceof Date) || row.createdAt < staleBefore),
  );
}

function projectRow(selection, row) {
  if (!selection) return { ...row };
  return Object.fromEntries(
    Object.entries(selection).map(([alias, column]) => [
      alias,
      row[columnFields.get(column)],
    ]),
  );
}

function selectBuilder(selection, table) {
  let condition;
  let ordered = false;
  const execute = (limit) => {
    let rows = filteredRows(table, condition);
    if (ordered && table === invoiceOcrRunsTable) {
      rows = [...rows].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
    }
    if (limit !== undefined) rows = rows.slice(0, limit);
    return rows.map((row) => projectRow(selection, row));
  };
  const builder = {
    where(nextCondition) {
      condition = nextCondition;
      return builder;
    },
    orderBy() {
      ordered = true;
      return builder;
    },
    leftJoin() {
      return builder;
    },
    innerJoin() {
      return builder;
    },
    limit(limit) {
      return Promise.resolve(execute(limit));
    },
    then(resolve, reject) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return builder;
}

function updateBuilder(table, values) {
  let condition;
  let result;
  const execute = () => {
    if (result) return result;
    const rows = filteredRows(table, condition);
    for (const row of rows) Object.assign(row, values);
    result = rows.map((row) => ({ ...row }));
    return result;
  };
  const builder = {
    where(nextCondition) {
      condition = nextCondition;
      return builder;
    },
    returning() {
      return Promise.resolve(execute());
    },
    then(resolve, reject) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return builder;
}

function insertBuilder(table, values) {
  return {
    async returning() {
      if (table === invoiceOcrRunsTable) {
        if (
          database.runs.some(
            (run) => run.clientRequestId === values.clientRequestId,
          ) ||
          database.runs.some(
            (run) =>
              run.createdByUserId === values.createdByUserId &&
              run.status === "processing",
          )
        ) {
          const conflict = new Error("fake unique conflict");
          conflict.code = "23505";
          throw conflict;
        }
        const run = {
          id: nextRunId++,
          actualModel: null,
          predictedJson: null,
          reviewRequired: null,
          reviewReasons: null,
          evidenceJson: null,
          openaiResponseId: null,
          openaiRequestId: null,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          cachedInputTokens: null,
          reasoningTokens: null,
          latencyMs: null,
          safeErrorCode: null,
          attemptCount: 1,
          rerunOfRunId: null,
          completedAt: null,
          createdAt: new Date(),
          ...values,
        };
        database.runs.push(run);
        return [{ ...run }];
      }
      if (table === invoiceOcrReviewsTable) {
        const now = new Date();
        const review = {
          id: nextReviewId++,
          correctedJson: null,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          ...values,
        };
        database.reviews.push(review);
        return [{ ...review }];
      }
      throw new Error("unexpected fake insert");
    },
  };
}

const fakeDb = {
  select(selection) {
    return {
      from(table) {
        return selectBuilder(selection, table);
      },
    };
  },
  update(table) {
    return {
      set(values) {
        return updateBuilder(table, values);
      },
    };
  },
  insert(table) {
    return {
      values(values) {
        return insertBuilder(table, values);
      },
    };
  },
  async transaction(callback) {
    return callback(fakeDb);
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    invoiceOcrRunsTable,
    invoiceOcrTestCasesTable,
    invoiceOcrReviewsTable,
  },
});

mock.module("../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (request, _response, next) => {
      request.userId = USER_ID;
      next();
    },
    verifyStoreOwner: async () => true,
  },
});

const fakeConfig = {
  enabled: true,
  testMode: true,
  apiKey: null,
  defaultModel: MODEL,
  allowedModels: [MODEL, "gpt-5.6-sol", "gpt-5.6-luna"],
  imageDetail: "original",
  reasoningEffort: "low",
  maxFileBytes: 12 * 1024 * 1024,
  timeoutMs: 90_000,
  allowedClerkUserIds: new Set([USER_ID]),
};

mock.module("../lib/invoiceOcr/config.ts", {
  namedExports: {
    readInvoiceOcrConfig: () => fakeConfig,
    requireInvoiceApiKey: () => "fake-key-never-used",
    parseRequestedInvoiceModel: (value) => {
      if (!fakeConfig.allowedModels.includes(value)) {
        throw new Error("model not allowed");
      }
      return value;
    },
  },
});

class FakeInvoiceExtractionRequestError extends Error {}

mock.module("../lib/invoiceOcr/openaiInvoiceExtractor.ts", {
  namedExports: {
    InvoiceExtractionRequestError: FakeInvoiceExtractionRequestError,
    extractInvoiceWithOpenAI: async (input) => {
      openAiCalls++;
      openAiInputs.push(input);
      if (openAiGate) await openAiGate;
      return {
        prediction: VALID_PREDICTION,
        requestedModel: input.model,
        actualModel: input.model,
        promptVersion: PROMPT_VERSION,
        imageDetail: input.imageDetail,
        reasoningEffort: input.reasoningEffort,
        responseId: "fake_response_id",
        requestId: "fake_request_id",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        latencyMs: 1,
        attemptCount: 1,
      };
    },
  },
});

mock.module("../lib/logger.ts", {
  namedExports: {
    logger: {
      error: (...values) => safeLogs.push(values),
    },
  },
});

const { default: express } = await import("express");
const { default: invoiceOcrRouter } = await import("./invoiceOcr.ts");

const app = express();
app.use("/api", invoiceOcrRouter);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetFakes();
});

async function analyze(clientRequestId, { confirmUnknownRerun = false } = {}) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([VALID_PNG], { type: "image/png" }),
    "fake.png",
  );
  form.append("model", MODEL);
  form.append("confirmRerun", "false");
  form.append("confirmUnknownRerun", confirmUnknownRerun ? "true" : "false");
  const response = await fetch(
    `${baseUrl}/stores/${STORE_ID}/invoice-ocr/test-cases/${TEST_CASE_ID}/analyze`,
    {
      method: "POST",
      headers: { "x-client-request-id": clientRequestId },
      body: form,
    },
  );
  return { status: response.status, data: await response.json() };
}

async function waitForOpenAiCall() {
  for (let attempt = 0; attempt < 100 && openAiCalls === 0; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(openAiCalls, 1, "fake OpenAI call did not start");
}

test("the same clientRequestId returns its processing run and calls fake OpenAI once", async () => {
  let releaseOpenAi;
  openAiGate = new Promise((resolve) => {
    releaseOpenAi = resolve;
  });

  const firstRequest = analyze(UUIDS.duplicate);
  await waitForOpenAiCall();
  const duplicate = await analyze(UUIDS.duplicate);

  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.existing, true);
  assert.equal(duplicate.data.run.status, "processing");
  assert.equal(openAiCalls, 1);

  releaseOpenAi();
  const first = await firstRequest;
  assert.equal(first.status, 201);
  assert.equal(first.data.existing, false);
  assert.equal(openAiCalls, 1);
});

test("a fresh processing run blocks a second fake OpenAI call", async () => {
  addProcessingRun();

  const response = await analyze(UUIDS.active);

  assert.equal(response.status, 409);
  assert.equal(response.data.code, "invoice_ocr_already_processing");
  assert.match(response.data.error, /不會建立第二筆 OpenAI 請求/);
  assert.equal(openAiCalls, 0);
  assert.equal(database.runs.length, 1);
});

test("an expired processing run stays untouched and costs zero calls without confirmation", async () => {
  const staleRun = addProcessingRun({
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
  });

  const response = await analyze(UUIDS.stale);

  assert.equal(response.status, 409);
  assert.equal(response.data.code, "invoice_ocr_previous_status_unknown");
  assert.match(response.data.error, /可能已收到照片.*Token/);
  assert.equal(response.data.requiresUnknownRerunConfirmation, true);
  assert.equal(openAiCalls, 0);
  assert.equal(staleRun.status, "processing");
  assert.equal(database.runs.length, 1);
});

test("explicit unknown-status confirmation retires the stale run and calls the same model once", async () => {
  const completedRun = addProcessingRun({
    clientRequestId: UUIDS.completed,
    createdAt: new Date(Date.now() - 20 * 60 * 1000),
  });
  completedRun.status = "completed";
  completedRun.completedAt = new Date(Date.now() - 19 * 60 * 1000);
  const staleRun = addProcessingRun({
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
  });

  const response = await analyze(UUIDS.confirmed, {
    confirmUnknownRerun: true,
  });

  assert.equal(response.status, 201);
  assert.equal(response.data.existing, false);
  assert.equal(openAiCalls, 1);
  assert.equal(openAiInputs[0].model, MODEL);
  assert.equal(staleRun.status, "failed");
  assert.equal(staleRun.safeErrorCode, "stale_processing_unknown");
  assert.equal(database.runs.length, 3);
  assert.equal(response.data.run.rerunOfRunId, staleRun.id);
});
