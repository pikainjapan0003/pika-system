import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInvoiceOcrEnabled,
  assertInvoiceOcrUserAllowed,
  readInvoiceOcrConfig,
  parseRequestedInvoiceModel,
  requireInvoiceApiKey,
} from "./config.ts";
import {
  invoiceExtractionSchema,
  isPositiveAmountString,
  isValidIsoDate,
  parseGroundTruthInput,
} from "./schema.ts";
import {
  amountsAreExactlyEqual,
  scoreInvoicePrediction,
} from "./normalization.ts";
import {
  InvoiceImageValidationError,
  validateInvoiceImage,
} from "./imageValidation.ts";
import {
  buildInvoiceOpenAIRequest,
  classifyInvoiceApiError,
  extractInvoiceWithOpenAI,
  InvoiceExtractionRequestError,
} from "./openaiInvoiceExtractor.ts";
import {
  buildInvoiceBenchmarkCsv,
  escapeCsvCell,
} from "./csv.ts";
import {
  selectCanonicalBenchmarkRuns,
  summarizeInvoiceBenchmark,
} from "./benchmark.ts";

const VALID_PREDICTION = {
  merchant_name: "測試商店",
  invoice_date: "2026-08-31",
  total_amount: "1234.50",
  currency: "TWD",
  review_required: false,
  review_reasons: [],
  evidence: {
    merchant_name: "測試商店",
    invoice_date: "2026/08/31",
    total_amount: "合計 1,234.50",
    currency: "TWD",
  },
};

const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function config(overrides = {}) {
  return {
    enabled: true,
    testMode: true,
    apiKey: null,
    defaultModel: "gpt-5.6-terra",
    allowedModels: [
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "gpt-5.6-luna",
    ],
    imageDetail: "original",
    reasoningEffort: "low",
    maxFileBytes: 12 * 1024 * 1024,
    timeoutMs: 90_000,
    allowedClerkUserIds: new Set(["user_owner"]),
    ...overrides,
  };
}

test("strict schema accepts a complete verified prediction", () => {
  assert.deepEqual(
    invoiceExtractionSchema.parse(VALID_PREDICTION),
    VALID_PREDICTION,
  );
  assert.throws(
    () =>
      invoiceExtractionSchema.parse({
        ...VALID_PREDICTION,
        unexpected: "not allowed",
      }),
    /unrecognized|key/i,
  );
});

test("calendar date validation rejects impossible dates", () => {
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.equal(isValidIsoDate("2025-02-29"), false);
  assert.equal(isValidIsoDate("2026-13-01"), false);
  assert.throws(
    () =>
      invoiceExtractionSchema.parse({
        ...VALID_PREDICTION,
        invoice_date: "2026-02-30",
      }),
    /YYYY-MM-DD/,
  );
});

test("positive amount validation rejects zero, signs, commas, and exponents", () => {
  for (const value of ["1", "0.01", "001.00", "1234.50"]) {
    assert.equal(isPositiveAmountString(value), true, value);
  }
  for (const value of ["0", "0.00", "-1", "+1", "1,000", "1e3"]) {
    assert.equal(isPositiveAmountString(value), false, value);
  }
  assert.equal(isPositiveAmountString("123456789012345678.123456789012"), true);
  assert.equal(isPositiveAmountString("1234567890123456789"), false);
  assert.equal(isPositiveAmountString("1.1234567890123"), false);
});

test("Ground Truth normalizes display commas and currency casing", () => {
  assert.deepEqual(
    parseGroundTruthInput({
      merchantName: "  ＡＢＣ   Store ",
      invoiceDate: "2026-08-31",
      totalAmount: "１,２３４.５０",
      currency: "twd",
    }),
    {
      merchantName: "ABC Store",
      invoiceDate: "2026-08-31",
      totalAmount: "1234.50",
      currency: "TWD",
    },
  );
  assert.throws(
    () =>
      parseGroundTruthInput({
        merchantName: "ABC",
        invoiceDate: "2026-08-31",
        totalAmount: "10",
        currency: "TW",
      }),
    /三碼/,
  );
});

test("missing prediction fields require review and a clear review has no reasons", () => {
  assert.throws(
    () =>
      invoiceExtractionSchema.parse({
        ...VALID_PREDICTION,
        currency: null,
        review_required: false,
      }),
    /必須要求複查/,
  );
  assert.throws(
    () =>
      invoiceExtractionSchema.parse({
        ...VALID_PREDICTION,
        review_reasons: ["有疑慮"],
      }),
    /原因陣列必須為空/,
  );
  assert.doesNotThrow(() =>
    invoiceExtractionSchema.parse({
      ...VALID_PREDICTION,
      currency: null,
      review_required: true,
      review_reasons: ["圖片內沒有可靠的幣別證據"],
      evidence: { ...VALID_PREDICTION.evidence, currency: null },
    }),
  );
});

test("model allowlist rejects arbitrary and unconfigured model names", () => {
  const parsed = readInvoiceOcrConfig({
    OPENAI_INVOICE_MODEL: "gpt-5.6-terra",
    OPENAI_INVOICE_COMPARE_MODELS: "gpt-5.6-sol",
    INVOICE_OCR_ALLOWED_CLERK_USER_IDS: "user_owner",
  });
  assert.equal(
    parseRequestedInvoiceModel("gpt-5.6-sol", parsed),
    "gpt-5.6-sol",
  );
  assert.throws(
    () => parseRequestedInvoiceModel("gpt-4o", parsed),
    /允許/,
  );
  assert.throws(
    () => parseRequestedInvoiceModel("gpt-5.6-luna", parsed),
    /尚未開放/,
  );
  assert.equal(parsed.allowedClerkUserIds.has("another_user"), false);
});

test("feature flags, personal allowlist, and server-only key fail closed", () => {
  const disabled = config({ enabled: false });
  assert.throws(() => assertInvoiceOcrEnabled(disabled), /尚未開啟/);
  assert.throws(
    () => assertInvoiceOcrUserAllowed("another_user", config()),
    /沒有.*權限/,
  );
  assert.doesNotThrow(() =>
    assertInvoiceOcrUserAllowed("user_owner", config()),
  );
  assert.throws(() => requireInvoiceApiKey(config()), /API Key/);
  assert.equal(requireInvoiceApiKey(config({ apiKey: "server-secret" })), "server-secret");
});

test("valid PNG is accepted and MIME mismatch, fake, and oversized files are rejected", () => {
  const valid = validateInvoiceImage({
    buffer: VALID_PNG,
    declaredMimeType: "image/png",
    originalName: "../receipt.png",
    maxFileBytes: 1024 * 1024,
  });
  assert.equal(valid.mimeType, "image/png");
  assert.equal(valid.safeFilename, "receipt.png");
  assert.match(valid.sha256, /^[0-9a-f]{64}$/);

  assert.throws(
    () =>
      validateInvoiceImage({
        buffer: VALID_PNG,
        declaredMimeType: "image/jpeg",
        originalName: "fake.jpg",
        maxFileBytes: 1024 * 1024,
      }),
    (error) =>
      error instanceof InvoiceImageValidationError &&
      error.code === "mime_type_mismatch",
  );
  assert.throws(
    () =>
      validateInvoiceImage({
        buffer: Buffer.from("not an image"),
        declaredMimeType: "image/png",
        originalName: "fake.png",
        maxFileBytes: 1024 * 1024,
      }),
    (error) =>
      error instanceof InvoiceImageValidationError &&
      error.code === "unsupported_image_type",
  );
  assert.throws(
    () =>
      validateInvoiceImage({
        buffer: Buffer.alloc(1025),
        declaredMimeType: "image/png",
        originalName: "large.png",
        maxFileBytes: 1024,
      }),
    (error) =>
      error instanceof InvoiceImageValidationError &&
      error.code === "image_too_large",
  );
  assert.throws(
    () =>
      validateInvoiceImage({
        buffer: VALID_PNG,
        declaredMimeType: "image/heic",
        originalName: "receipt.heic",
        maxFileBytes: 1024 * 1024,
      }),
    (error) =>
      error instanceof InvoiceImageValidationError &&
      error.code === "unsupported_image_type",
  );
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    8 + data.length,
  );
  return result;
}

test("animated PNG is rejected", () => {
  const headerEnd = 8 + 12 + 13;
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(1, 0);
  const animated = Buffer.concat([
    VALID_PNG.subarray(0, headerEnd),
    pngChunk("acTL", animationControl),
    VALID_PNG.subarray(headerEnd),
  ]);
  assert.throws(
    () =>
      validateInvoiceImage({
        buffer: animated,
        declaredMimeType: "image/png",
        originalName: "animated.png",
        maxFileBytes: 1024 * 1024,
      }),
    (error) =>
      error instanceof InvoiceImageValidationError &&
      error.code === "animated_image_not_supported",
  );
});

test("OpenAI request contains no Ground Truth, key, or tools", () => {
  const request = buildInvoiceOpenAIRequest({
    model: "gpt-5.6-terra",
    imageDataUrl: "data:image/png;base64,aW1hZ2U=",
    imageDetail: "original",
    reasoningEffort: "low",
  });
  const serialized = JSON.stringify(request);
  assert.equal(request.store, false);
  assert.equal("tools" in request, false);
  assert.equal(request.text.format.strict, true);
  assert.doesNotMatch(serialized, /ground.?truth/i);
  assert.doesNotMatch(serialized, /人工正確店名|2020-01-02|sk-/);
  assert.match(serialized, /input_image/);
  assert.match(serialized, /original/);
});

test("temporary server errors retry exactly once without model fallback", async () => {
  let calls = 0;
  let clock = 0;
  const result = await extractInvoiceWithOpenAI(
    {
      model: "gpt-5.6-terra",
      imageDataUrl: "data:image/png;base64,aW1hZ2U=",
      imageDetail: "original",
      reasoningEffort: "low",
    },
    config(),
    {
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      executeRequest: async (request) => {
        calls++;
        assert.equal(request.model, "gpt-5.6-terra");
        if (calls === 1) throw { status: 500 };
        return {
          responseId: "resp_test",
          requestId: "req_test",
          actualModel: "gpt-5.6-terra-2026-08-01",
          status: "completed",
          outputParsed: VALID_PREDICTION,
          output: [],
          incompleteReason: null,
          usage: {
            inputTokens: 100,
            outputTokens: 40,
            totalTokens: 140,
            cachedInputTokens: 0,
            reasoningTokens: 10,
          },
        };
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.requestedModel, "gpt-5.6-terra");
  assert.equal(result.actualModel, "gpt-5.6-terra-2026-08-01");
  assert.equal(result.totalTokens, 140);
});

test("timeout, invalid key, quota, and model errors are not auto-retried", async () => {
  assert.equal(
    classifyInvoiceApiError({ status: 401 }).automaticRetry,
    false,
  );
  assert.equal(
    classifyInvoiceApiError({
      status: 429,
      code: "insufficient_quota",
    }).automaticRetry,
    false,
  );
  assert.equal(
    classifyInvoiceApiError({ status: 403 }).automaticRetry,
    false,
  );
  assert.equal(
    classifyInvoiceApiError({ status: 404 }).automaticRetry,
    false,
  );

  let calls = 0;
  await assert.rejects(
    () =>
      extractInvoiceWithOpenAI(
        {
          model: "gpt-5.6-terra",
          imageDataUrl: "data:image/png;base64,aW1hZ2U=",
          imageDetail: "original",
          reasoningEffort: "low",
        },
        config(),
        {
          executeRequest: async () => {
            calls++;
            throw { name: "APIConnectionTimeoutError" };
          },
        },
      ),
    (error) =>
      error instanceof InvoiceExtractionRequestError &&
      error.failure.code === "openai_timeout_unknown" &&
      error.attemptCount === 1,
  );
  assert.equal(calls, 1);
  assert.equal(
    classifyInvoiceApiError({
      name: "APIConnectionError",
      cause: { code: "ECONNRESET" },
    }).automaticRetry,
    false,
  );
});

test("exact amount comparison and unsafe confident error scoring are deterministic", () => {
  assert.equal(amountsAreExactlyEqual("1234.50", "1234.500"), true);
  assert.equal(amountsAreExactlyEqual("0.1", "0.10"), true);
  assert.equal(amountsAreExactlyEqual("0.1", "0.11"), false);
  const score = scoreInvoicePrediction(
    { ...VALID_PREDICTION, total_amount: "999" },
    {
      merchantName: "測試商店",
      invoiceDate: "2026-08-31",
      totalAmount: "1234.50",
      currency: "TWD",
    },
  );
  assert.equal(score.totalAmountCorrect, false);
  assert.equal(score.unsafeConfidentError, true);
});

test("CSV escapes formulas and contains no image, Base64, key, or raw error fields", () => {
  assert.equal(escapeCsvCell("=2+2"), `"'=2+2"`);
  const csv = buildInvoiceBenchmarkCsv([
    {
      testCaseId: 1,
      runId: 2,
      originalFilename: "=formula.png",
      imageSha256: "a".repeat(64),
      requestedModel: "gpt-5.6-terra",
      actualModel: "gpt-5.6-terra",
      promptVersion: "invoice-extraction-v1",
      imageDetail: "original",
      reasoningEffort: "low",
      status: "completed",
      safeErrorCode: null,
      groundTruthMerchantName: "測試商店",
      groundTruthInvoiceDate: "2026-08-31",
      groundTruthTotalAmount: "1234.50",
      groundTruthCurrency: "TWD",
      merchantName: "測試商店",
      invoiceDate: "2026-08-31",
      totalAmount: "1234.50",
      currency: "TWD",
      reviewRequired: false,
      merchantNameCorrect: true,
      invoiceDateCorrect: true,
      totalAmountCorrect: true,
      currencyCorrect: true,
      unsafeConfidentError: false,
      correctedMerchantName: null,
      correctedInvoiceDate: null,
      correctedTotalAmount: null,
      correctedCurrency: null,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cachedInputTokens: 0,
      reasoningTokens: 5,
      latencyMs: 900,
      createdAt: "2026-08-31T00:00:00.000Z",
    },
  ]);
  assert.match(csv, /"'=formula\.png"/);
  assert.doesNotMatch(csv, /data:image|base64|OPENAI_API_KEY|sk-/i);
  assert.doesNotMatch(csv, /raw_error|stack/i);
});

test("benchmark uses the first run per case and never mixes configurations", () => {
  const base = {
    requestedModel: "gpt-5.6-terra",
    promptVersion: "invoice-extraction-v1",
    imageDetail: "original",
    reasoningEffort: "low",
    status: "completed",
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    latencyMs: 1000,
    merchantNameCorrect: true,
    invoiceDateCorrect: true,
    totalAmountCorrect: true,
    currencyCorrect: true,
    unsafeConfidentError: false,
  };
  const records = [
    {
      ...base,
      testCaseId: 1,
      runId: 1,
      totalAmountCorrect: false,
      createdAt: new Date("2026-08-31T00:00:00Z"),
    },
    {
      ...base,
      testCaseId: 1,
      runId: 2,
      totalAmountCorrect: true,
      createdAt: new Date("2026-08-31T00:01:00Z"),
    },
    {
      ...base,
      testCaseId: 1,
      runId: 3,
      requestedModel: "gpt-5.6-sol",
      createdAt: new Date("2026-08-31T00:02:00Z"),
    },
  ];
  assert.deepEqual(
    selectCanonicalBenchmarkRuns(records).map((item) => item.runId),
    [1, 3],
  );
  const summaries = summarizeInvoiceBenchmark(records);
  assert.equal(summaries.length, 2);
  assert.equal(
    summaries.find((item) => item.requestedModel.endsWith("terra"))
      .totalAmountCorrect,
    0,
  );
});
