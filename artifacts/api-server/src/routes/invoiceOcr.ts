import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  lt,
} from "drizzle-orm";
import {
  db,
  invoiceOcrReviewsTable,
  invoiceOcrRunsTable,
  invoiceOcrTestCasesTable,
  type InvoiceOcrReview,
  type InvoiceOcrRun,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.ts";
import {
  parseRequestedInvoiceModel,
  requireInvoiceApiKey,
} from "../lib/invoiceOcr/config.ts";
import {
  InvoiceImageValidationError,
  invoiceImageToDataUrl,
  validateInvoiceImage,
  type ValidatedInvoiceImage,
} from "../lib/invoiceOcr/imageValidation.ts";
import {
  parseCorrectedInvoiceFields,
  parseGroundTruthInput,
  type InvoiceGroundTruth,
} from "../lib/invoiceOcr/schema.ts";
import {
  normalizeMerchantForComparison,
  scoreInvoicePrediction,
} from "../lib/invoiceOcr/normalization.ts";
import {
  extractInvoiceWithOpenAI,
  InvoiceExtractionRequestError,
} from "../lib/invoiceOcr/openaiInvoiceExtractor.ts";
import { INVOICE_PROMPT_VERSION } from "../lib/invoiceOcr/prompt.ts";
import {
  buildInvoiceBenchmarkCsv,
  type InvoiceBenchmarkCsvRow,
} from "../lib/invoiceOcr/csv.ts";
import {
  summarizeInvoiceBenchmark,
  type InvoiceBenchmarkRecord,
} from "../lib/invoiceOcr/benchmark.ts";
import {
  databaseConstraintName,
  databaseErrorCode,
  invoiceOcrAnalyzeLimiter,
  invoiceOcrMutationLimiter,
  loadInvoiceOcrAccess,
  parseInvoiceUpload,
  positiveId,
  requiredBodyString,
  sendInvoiceUploadError,
  serializeInvoiceOcrReview,
  serializeInvoiceOcrRun,
  serializeInvoiceOcrTestCase,
  type AuthenticatedInvoiceRequest,
} from "./invoiceOcrSupport.ts";

const router = Router();
const MAX_BENCHMARK_CASES = 10;

router.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  next();
});

function sendImageValidationError(
  error: InvoiceImageValidationError,
  response: any,
): void {
  response.status(400).json({
    error: error.message,
    code: error.code,
    retryable: false,
  });
}

async function receiveValidatedImage(
  request: AuthenticatedInvoiceRequest,
  response: any,
  maxFileBytes: number,
): Promise<ValidatedInvoiceImage | null> {
  try {
    await parseInvoiceUpload(request, response);
  } catch (error) {
    sendInvoiceUploadError(error, response);
    return null;
  }
  if (!request.file) {
    response.status(400).json({
      error: "請選擇一張發票照片。",
      code: "missing_image",
      retryable: false,
    });
    return null;
  }
  try {
    return validateInvoiceImage({
      buffer: request.file.buffer,
      declaredMimeType: request.file.mimetype,
      originalName: request.file.originalname,
      maxFileBytes,
    });
  } catch (error) {
    if (error instanceof InvoiceImageValidationError) {
      sendImageValidationError(error, response);
      return null;
    }
    response.status(400).json({
      error: "圖片內容無法驗證，請重新轉成 JPG、PNG 或 WebP。",
      code: "damaged_image",
      retryable: false,
    });
    return null;
  }
}

async function reviewForRun(runId: number): Promise<InvoiceOcrReview | null> {
  const [review] = await db
    .select()
    .from(invoiceOcrReviewsTable)
    .where(eq(invoiceOcrReviewsTable.runId, runId))
    .limit(1);
  return review ?? null;
}

async function sendExistingRun(response: any, run: InvoiceOcrRun) {
  response.json({
    run: serializeInvoiceOcrRun(run),
    review: serializeInvoiceOcrReview(await reviewForRun(run.id)),
    existing: true,
  });
}

async function markRunFailed(
  runId: number,
  values: {
    safeErrorCode: string;
    latencyMs: number;
    attemptCount: number;
    actualModel?: string | null;
    openaiResponseId?: string | null;
    openaiRequestId?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cachedInputTokens?: number | null;
    reasoningTokens?: number | null;
  },
): Promise<void> {
  await db
    .update(invoiceOcrRunsTable)
    .set({
      status: "failed",
      safeErrorCode: values.safeErrorCode,
      latencyMs: values.latencyMs,
      attemptCount: values.attemptCount,
      actualModel: values.actualModel,
      openaiResponseId: values.openaiResponseId,
      openaiRequestId: values.openaiRequestId,
      inputTokens: values.inputTokens,
      outputTokens: values.outputTokens,
      totalTokens: values.totalTokens,
      cachedInputTokens: values.cachedInputTokens,
      reasoningTokens: values.reasoningTokens,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(invoiceOcrRunsTable.id, runId),
        eq(invoiceOcrRunsTable.status, "processing"),
      ),
    );
}

router.post(
  "/stores/:storeId/invoice-ocr/test-cases",
  requireAuth,
  invoiceOcrMutationLimiter,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const image = await receiveValidatedImage(
      request,
      response,
      access.config.maxFileBytes,
    );
    if (!image) return;

    if (requiredBodyString(request.body, "privacyConfirmed") !== "true") {
      return response.status(400).json({
        error: "請先確認你有權將這張照片傳送到 OpenAI。",
        code: "privacy_confirmation_required",
        retryable: false,
      });
    }

    let groundTruth: InvoiceGroundTruth;
    try {
      groundTruth = parseGroundTruthInput({
        merchantName: requiredBodyString(request.body, "merchantName"),
        invoiceDate: requiredBodyString(request.body, "invoiceDate"),
        totalAmount: requiredBodyString(request.body, "totalAmount"),
        currency: requiredBodyString(request.body, "currency"),
      });
    } catch (error) {
      return response.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "人工正確答案格式不正確。",
        code: "invalid_ground_truth",
        retryable: false,
      });
    }

    const [duplicate] = await db
      .select()
      .from(invoiceOcrTestCasesTable)
      .where(
        and(
          eq(invoiceOcrTestCasesTable.storeId, access.storeId),
          eq(invoiceOcrTestCasesTable.imageSha256, image.sha256),
        ),
      )
      .limit(1);
    if (duplicate) {
      return response.json({
        testCase: serializeInvoiceOcrTestCase(duplicate),
        existing: true,
      });
    }

    const [caseCountRow] = await db
      .select({ value: count(invoiceOcrTestCasesTable.id) })
      .from(invoiceOcrTestCasesTable)
      .where(eq(invoiceOcrTestCasesTable.storeId, access.storeId));
    if (Number(caseCountRow?.value ?? 0) >= MAX_BENCHMARK_CASES) {
      return response.status(409).json({
        error: "第一階段最多建立 10 張測試發票。",
        code: "benchmark_case_limit_reached",
        retryable: false,
      });
    }

    const merchants = await db
      .select({
        merchantName: invoiceOcrTestCasesTable.groundTruthMerchantName,
      })
      .from(invoiceOcrTestCasesTable)
      .where(eq(invoiceOcrTestCasesTable.storeId, access.storeId));
    const normalizedMerchant = normalizeMerchantForComparison(
      groundTruth.merchantName,
    );
    if (
      merchants.some(
        (item) =>
          normalizeMerchantForComparison(item.merchantName) ===
          normalizedMerchant,
      )
    ) {
      return response.status(409).json({
        error: "第一輪需要 10 個不同商家，這個店名已經建立過測試。",
        code: "duplicate_benchmark_merchant",
        retryable: false,
      });
    }

    try {
      const [created] = await db
        .insert(invoiceOcrTestCasesTable)
        .values({
          storeId: access.storeId,
          createdByUserId: request.userId,
          originalFilename: image.safeFilename,
          imageSha256: image.sha256,
          groundTruthMerchantName: groundTruth.merchantName,
          groundTruthInvoiceDate: groundTruth.invoiceDate,
          groundTruthTotalAmount: groundTruth.totalAmount,
          groundTruthCurrency: groundTruth.currency,
        })
        .returning();
      return response.status(201).json({
        testCase: serializeInvoiceOcrTestCase(created),
        existing: false,
      });
    } catch (error) {
      const databaseCode = databaseErrorCode(error);
      const constraintName = databaseConstraintName(error);
      if (constraintName === "invoice_ocr_test_cases_max_ten") {
        return response.status(409).json({
          error: "第一階段最多只能建立 10 張發票測試。",
          code: "benchmark_case_limit_reached",
          retryable: false,
        });
      }
      if (
        constraintName ===
        "invoice_ocr_test_cases_store_merchant_unique"
      ) {
        return response.status(409).json({
          error: "第一輪需要 10 個不同商家，這個店名已經建立過測試。",
          code: "duplicate_benchmark_merchant",
          retryable: false,
        });
      }
      if (databaseCode === "23505") {
        const [existing] = await db
          .select()
          .from(invoiceOcrTestCasesTable)
          .where(
            and(
              eq(invoiceOcrTestCasesTable.storeId, access.storeId),
              eq(invoiceOcrTestCasesTable.imageSha256, image.sha256),
            ),
          )
          .limit(1);
        if (existing) {
          return response.json({
            testCase: serializeInvoiceOcrTestCase(existing),
            existing: true,
          });
        }
      }
      return response.status(500).json({
        error: "測試案例沒有儲存，請稍後再試。",
        code: "test_case_save_failed",
        retryable: true,
      });
    }
  },
);

router.post(
  "/stores/:storeId/invoice-ocr/test-cases/:testCaseId/analyze",
  requireAuth,
  invoiceOcrAnalyzeLimiter,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    try {
      void requireInvoiceApiKey(access.config);
    } catch {
      return response.status(503).json({
        error: "OpenAI API Key 尚未在伺服器安全設定中完成。",
        code: "openai_key_missing",
        retryable: false,
      });
    }

    const testCaseId = positiveId(request.params.testCaseId);
    if (testCaseId === null) {
      return response.status(400).json({
        error: "測試案例編號不正確。",
        code: "invalid_test_case_id",
        retryable: false,
      });
    }
    const image = await receiveValidatedImage(
      request,
      response,
      access.config.maxFileBytes,
    );
    if (!image) return;

    let model;
    try {
      model = parseRequestedInvoiceModel(
        requiredBodyString(request.body, "model"),
        access.config,
      );
    } catch {
      return response.status(400).json({
        error: "請選擇 Terra、Sol 或 Luna；不可輸入其他模型。",
        code: "model_not_allowed",
        retryable: false,
      });
    }

    const requestedClientId = request.get("x-client-request-id");
    const clientRequestId = requestedClientId || randomUUID();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        clientRequestId,
      )
    ) {
      return response.status(400).json({
        error: "請求識別碼格式不正確。",
        code: "invalid_client_request_id",
        retryable: false,
      });
    }

    const [testCaseIdentity] = await db
      .select({
        id: invoiceOcrTestCasesTable.id,
        storeId: invoiceOcrTestCasesTable.storeId,
        imageSha256: invoiceOcrTestCasesTable.imageSha256,
      })
      .from(invoiceOcrTestCasesTable)
      .where(
        and(
          eq(invoiceOcrTestCasesTable.id, testCaseId),
          eq(invoiceOcrTestCasesTable.storeId, access.storeId),
        ),
      )
      .limit(1);
    if (!testCaseIdentity) {
      return response.status(404).json({
        error: "找不到這筆測試案例。",
        code: "test_case_not_found",
        retryable: false,
      });
    }
    if (testCaseIdentity.imageSha256 !== image.sha256) {
      return response.status(400).json({
        error: "這張照片和已儲存的人工正確答案不是同一張。",
        code: "image_hash_mismatch",
        retryable: false,
      });
    }

    const [sameRequest] = await db
      .select()
      .from(invoiceOcrRunsTable)
      .where(eq(invoiceOcrRunsTable.clientRequestId, clientRequestId))
      .limit(1);
    if (sameRequest) {
      const belongsToThisRequest =
        sameRequest.storeId === access.storeId &&
        sameRequest.testCaseId === testCaseId &&
        sameRequest.createdByUserId === request.userId &&
        sameRequest.requestedModel === model &&
        sameRequest.promptVersion === INVOICE_PROMPT_VERSION &&
        sameRequest.imageDetail === access.config.imageDetail &&
        sameRequest.reasoningEffort === access.config.reasoningEffort;
      if (!belongsToThisRequest) {
        return response.status(409).json({
          error: "這個請求識別碼已經使用過。",
          code: "duplicate_client_request_id",
          retryable: false,
        });
      }
      const staleBefore = new Date(
        Date.now() - access.config.timeoutMs * 2 - 45_000,
      );
      if (
        sameRequest.status === "processing" &&
        sameRequest.createdAt < staleBefore
      ) {
        const [staleRun] = await db
          .update(invoiceOcrRunsTable)
          .set({
            status: "failed",
            safeErrorCode: "stale_processing_unknown",
            completedAt: new Date(),
          })
          .where(
            and(
              eq(invoiceOcrRunsTable.id, sameRequest.id),
              eq(invoiceOcrRunsTable.status, "processing"),
            ),
          )
          .returning();
        if (staleRun) return sendExistingRun(response, staleRun);
        const [currentRun] = await db
          .select()
          .from(invoiceOcrRunsTable)
          .where(eq(invoiceOcrRunsTable.id, sameRequest.id))
          .limit(1);
        if (currentRun) return sendExistingRun(response, currentRun);
      }
      return sendExistingRun(response, sameRequest);
    }

    const [previousCompleted] = await db
      .select()
      .from(invoiceOcrRunsTable)
      .where(
        and(
          eq(invoiceOcrRunsTable.testCaseId, testCaseId),
          eq(invoiceOcrRunsTable.storeId, access.storeId),
          eq(invoiceOcrRunsTable.requestedModel, model),
          eq(
            invoiceOcrRunsTable.promptVersion,
            INVOICE_PROMPT_VERSION,
          ),
          eq(
            invoiceOcrRunsTable.imageDetail,
            access.config.imageDetail,
          ),
          eq(
            invoiceOcrRunsTable.reasoningEffort,
            access.config.reasoningEffort,
          ),
          eq(invoiceOcrRunsTable.status, "completed"),
        ),
      )
      .orderBy(desc(invoiceOcrRunsTable.createdAt))
      .limit(1);
    const confirmRerun =
      requiredBodyString(request.body, "confirmRerun") === "true";
    if (previousCompleted && !confirmRerun) {
      return sendExistingRun(response, previousCompleted);
    }

    let run: InvoiceOcrRun;
    try {
      run = await db.transaction(async (transaction) => {
        const now = new Date();
        const staleBefore = new Date(
          now.getTime() - access.config.timeoutMs * 2 - 45_000,
        );
        await transaction
          .update(invoiceOcrRunsTable)
          .set({
            status: "failed",
            safeErrorCode: "stale_processing_request",
            completedAt: now,
          })
          .where(
            and(
              eq(invoiceOcrRunsTable.createdByUserId, request.userId),
              eq(invoiceOcrRunsTable.status, "processing"),
              lt(invoiceOcrRunsTable.createdAt, staleBefore),
            ),
          );
        await transaction
          .update(invoiceOcrTestCasesTable)
          .set({
            groundTruthLockedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(invoiceOcrTestCasesTable.id, testCaseId),
              eq(invoiceOcrTestCasesTable.storeId, access.storeId),
              isNull(invoiceOcrTestCasesTable.groundTruthLockedAt),
            ),
          );
        const [createdRun] = await transaction
          .insert(invoiceOcrRunsTable)
          .values({
            testCaseId,
            storeId: access.storeId,
            createdByUserId: request.userId,
            clientRequestId,
            requestedModel: model,
            promptVersion: INVOICE_PROMPT_VERSION,
            imageDetail: access.config.imageDetail,
            reasoningEffort: access.config.reasoningEffort,
            status: "processing",
            rerunOfRunId: previousCompleted?.id ?? null,
          })
          .returning();
        return createdRun;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        const [duplicateRequest] = await db
          .select()
          .from(invoiceOcrRunsTable)
          .where(eq(invoiceOcrRunsTable.clientRequestId, clientRequestId))
          .limit(1);
        if (duplicateRequest) {
          const belongsToThisRequest =
            duplicateRequest.storeId === access.storeId &&
            duplicateRequest.testCaseId === testCaseId &&
            duplicateRequest.createdByUserId === request.userId &&
            duplicateRequest.requestedModel === model &&
            duplicateRequest.promptVersion === INVOICE_PROMPT_VERSION &&
            duplicateRequest.imageDetail === access.config.imageDetail &&
            duplicateRequest.reasoningEffort ===
              access.config.reasoningEffort;
          if (belongsToThisRequest) {
            return sendExistingRun(response, duplicateRequest);
          }
          return response.status(409).json({
            error: "這個請求識別碼已經使用過。",
            code: "duplicate_client_request_id",
            retryable: false,
          });
        }
        return response.status(409).json({
          error: "目前已有一張發票正在辨識，請等待它完成。",
          code: "invoice_ocr_already_processing",
          retryable: false,
        });
      }
      return response.status(500).json({
        error: "無法建立辨識紀錄，照片尚未送到 OpenAI。",
        code: "run_create_failed",
        retryable: true,
      });
    }

    let successfulApiResult: Awaited<
      ReturnType<typeof extractInvoiceWithOpenAI>
    > | null = null;
    try {
      const result = await extractInvoiceWithOpenAI(
        {
          model,
          imageDataUrl: invoiceImageToDataUrl(image),
          imageDetail: access.config.imageDetail,
          reasoningEffort: access.config.reasoningEffort,
        },
        access.config,
      );
      successfulApiResult = result;

      // Ground Truth is intentionally loaded only after the OpenAI request has
      // finished. The extractor's input type has no Ground Truth field.
      const [groundTruthRow] = await db
        .select({
          merchantName:
            invoiceOcrTestCasesTable.groundTruthMerchantName,
          invoiceDate:
            invoiceOcrTestCasesTable.groundTruthInvoiceDate,
          totalAmount:
            invoiceOcrTestCasesTable.groundTruthTotalAmount,
          currency: invoiceOcrTestCasesTable.groundTruthCurrency,
        })
        .from(invoiceOcrTestCasesTable)
        .where(
          and(
            eq(invoiceOcrTestCasesTable.id, testCaseId),
            eq(invoiceOcrTestCasesTable.storeId, access.storeId),
          ),
        )
        .limit(1);
      if (!groundTruthRow) {
        throw new Error("Ground Truth missing after completed request");
      }
      const scores = scoreInvoicePrediction(
        result.prediction,
        groundTruthRow,
      );

      const completed = await db.transaction(async (transaction) => {
        const [completedRun] = await transaction
          .update(invoiceOcrRunsTable)
          .set({
            actualModel: result.actualModel,
            predictedJson: result.prediction,
            reviewRequired: result.prediction.review_required,
            reviewReasons: result.prediction.review_reasons,
            evidenceJson: result.prediction.evidence,
            openaiResponseId: result.responseId,
            openaiRequestId: result.requestId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            cachedInputTokens: result.cachedInputTokens,
            reasoningTokens: result.reasoningTokens,
            latencyMs: result.latencyMs,
            attemptCount: result.attemptCount,
            status: "completed",
            completedAt: new Date(),
          })
          .where(
            and(
              eq(invoiceOcrRunsTable.id, run.id),
              eq(invoiceOcrRunsTable.status, "processing"),
            ),
          )
          .returning();
        if (!completedRun) {
          throw new Error("Invoice OCR run was not processing");
        }
        const [review] = await transaction
          .insert(invoiceOcrReviewsTable)
          .values({
            runId: run.id,
            ...scores,
          })
          .returning();
        return { run: completedRun, review };
      });

      return response.status(201).json({
        run: serializeInvoiceOcrRun(completed.run),
        review: serializeInvoiceOcrReview(completed.review),
        existing: false,
      });
    } catch (error) {
      if (error instanceof InvoiceExtractionRequestError) {
        const metadata = error.apiMetadata;
        await markRunFailed(run.id, {
          safeErrorCode: error.failure.code,
          latencyMs: error.latencyMs,
          attemptCount: error.attemptCount,
          actualModel: metadata?.actualModel ?? null,
          openaiResponseId: metadata?.responseId ?? null,
          openaiRequestId: metadata?.requestId ?? null,
          inputTokens: metadata?.inputTokens ?? null,
          outputTokens: metadata?.outputTokens ?? null,
          totalTokens: metadata?.totalTokens ?? null,
          cachedInputTokens: metadata?.cachedInputTokens ?? null,
          reasoningTokens: metadata?.reasoningTokens ?? null,
        }).catch(() => {});
        return response.status(error.failure.httpStatus).json({
          error: error.failure.publicMessage,
          code: error.failure.code,
          retryable: error.failure.mayRetryManually,
        });
      }
      await markRunFailed(run.id, {
        safeErrorCode: "invoice_ocr_internal_error",
        latencyMs: successfulApiResult?.latencyMs ?? 0,
        attemptCount: successfulApiResult?.attemptCount ?? 1,
        actualModel: successfulApiResult?.actualModel ?? null,
        openaiResponseId: successfulApiResult?.responseId ?? null,
        openaiRequestId: successfulApiResult?.requestId ?? null,
        inputTokens: successfulApiResult?.inputTokens ?? null,
        outputTokens: successfulApiResult?.outputTokens ?? null,
        totalTokens: successfulApiResult?.totalTokens ?? null,
        cachedInputTokens:
          successfulApiResult?.cachedInputTokens ?? null,
        reasoningTokens: successfulApiResult?.reasoningTokens ?? null,
      }).catch(() => {});
      return response.status(500).json({
        error:
          "辨識結果沒有安全儲存，請勿立即重跑，以免重複使用 Token。",
        code: "invoice_ocr_result_save_failed",
        retryable: false,
      });
    }
  },
);

async function loadTestCaseBundle(storeId: number, testCaseId: number) {
  const [testCase] = await db
    .select()
    .from(invoiceOcrTestCasesTable)
    .where(
      and(
        eq(invoiceOcrTestCasesTable.id, testCaseId),
        eq(invoiceOcrTestCasesTable.storeId, storeId),
      ),
    )
    .limit(1);
  if (!testCase) return null;
  const rows = await db
    .select({
      run: invoiceOcrRunsTable,
      review: invoiceOcrReviewsTable,
    })
    .from(invoiceOcrRunsTable)
    .leftJoin(
      invoiceOcrReviewsTable,
      eq(invoiceOcrReviewsTable.runId, invoiceOcrRunsTable.id),
    )
    .where(
      and(
        eq(invoiceOcrRunsTable.storeId, storeId),
        eq(invoiceOcrRunsTable.testCaseId, testCaseId),
      ),
    )
    .orderBy(desc(invoiceOcrRunsTable.createdAt));
  return {
    ...serializeInvoiceOcrTestCase(testCase),
    runs: rows.map((row) => ({
      run: serializeInvoiceOcrRun(row.run),
      review: serializeInvoiceOcrReview(row.review),
    })),
  };
}

router.get(
  "/stores/:storeId/invoice-ocr/test-cases",
  requireAuth,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const testCases = await db
      .select()
      .from(invoiceOcrTestCasesTable)
      .where(eq(invoiceOcrTestCasesTable.storeId, access.storeId))
      .orderBy(desc(invoiceOcrTestCasesTable.createdAt))
      .limit(MAX_BENCHMARK_CASES);
    const bundles = await Promise.all(
      testCases.map((testCase) =>
        loadTestCaseBundle(access.storeId, testCase.id),
      ),
    );
    return response.json({
      testCases: bundles.filter((item) => item !== null),
      maximumTestCases: MAX_BENCHMARK_CASES,
    });
  },
);

router.get(
  "/stores/:storeId/invoice-ocr/test-cases/:testCaseId",
  requireAuth,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const testCaseId = positiveId(request.params.testCaseId);
    if (testCaseId === null) {
      return response.status(400).json({
        error: "測試案例編號不正確。",
        code: "invalid_test_case_id",
        retryable: false,
      });
    }
    const bundle = await loadTestCaseBundle(access.storeId, testCaseId);
    if (!bundle) {
      return response.status(404).json({
        error: "找不到這筆測試案例。",
        code: "test_case_not_found",
        retryable: false,
      });
    }
    return response.json({ testCase: bundle });
  },
);

router.patch(
  "/stores/:storeId/invoice-ocr/runs/:runId/review",
  requireAuth,
  invoiceOcrMutationLimiter,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const runId = positiveId(request.params.runId);
    if (runId === null) {
      return response.status(400).json({
        error: "辨識紀錄編號不正確。",
        code: "invalid_run_id",
        retryable: false,
      });
    }
    const [run] = await db
      .select()
      .from(invoiceOcrRunsTable)
      .where(
        and(
          eq(invoiceOcrRunsTable.id, runId),
          eq(invoiceOcrRunsTable.storeId, access.storeId),
          eq(invoiceOcrRunsTable.status, "completed"),
        ),
      )
      .limit(1);
    if (!run) {
      return response.status(404).json({
        error: "找不到可複查的已完成辨識紀錄。",
        code: "completed_run_not_found",
        retryable: false,
      });
    }
    if (
      typeof request.body !== "object" ||
      request.body === null ||
      !Object.prototype.hasOwnProperty.call(request.body, "corrected")
    ) {
      return response.status(400).json({
        error: "請提供人工複查結果；沒有修改時可送出 null。",
        code: "review_body_required",
        retryable: false,
      });
    }

    let corrected = null;
    if ((request.body as Record<string, unknown>).corrected !== null) {
      try {
        corrected = parseCorrectedInvoiceFields(
          (request.body as Record<string, unknown>).corrected,
        );
      } catch (error) {
        return response.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "人工修正資料格式不正確。",
          code: "invalid_corrected_values",
          retryable: false,
        });
      }
    }

    const reviewedAt = new Date();
    const [review] = await db
      .update(invoiceOcrReviewsTable)
      .set({
        correctedJson: corrected,
        reviewedBy: request.userId,
        reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(eq(invoiceOcrReviewsTable.runId, runId))
      .returning();
    if (!review) {
      return response.status(404).json({
        error: "找不到這筆辨識的評分資料。",
        code: "review_not_found",
        retryable: false,
      });
    }
    return response.json({
      review: serializeInvoiceOcrReview(review),
    });
  },
);

async function benchmarkRecordsForStore(
  storeId: number,
): Promise<InvoiceBenchmarkRecord[]> {
  const rows = await db
    .select({
      run: invoiceOcrRunsTable,
      review: invoiceOcrReviewsTable,
    })
    .from(invoiceOcrRunsTable)
    .leftJoin(
      invoiceOcrReviewsTable,
      eq(invoiceOcrReviewsTable.runId, invoiceOcrRunsTable.id),
    )
    .where(eq(invoiceOcrRunsTable.storeId, storeId))
    .orderBy(asc(invoiceOcrRunsTable.createdAt));
  return rows.map(({ run, review }) => ({
    testCaseId: run.testCaseId,
    runId: run.id,
    requestedModel: run.requestedModel,
    promptVersion: run.promptVersion,
    imageDetail: run.imageDetail,
    reasoningEffort: run.reasoningEffort,
    status: run.status,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    totalTokens: run.totalTokens,
    latencyMs: run.latencyMs,
    merchantNameCorrect: review?.merchantNameCorrect ?? null,
    invoiceDateCorrect: review?.invoiceDateCorrect ?? null,
    totalAmountCorrect: review?.totalAmountCorrect ?? null,
    currencyCorrect: review?.currencyCorrect ?? null,
    unsafeConfidentError: review?.unsafeConfidentError ?? null,
    createdAt: run.createdAt,
  }));
}

router.get(
  "/stores/:storeId/invoice-ocr/benchmark-summary",
  requireAuth,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const records = await benchmarkRecordsForStore(access.storeId);
    const [testCaseCount] = await db
      .select({ value: count(invoiceOcrTestCasesTable.id) })
      .from(invoiceOcrTestCasesTable)
      .where(eq(invoiceOcrTestCasesTable.storeId, access.storeId));
    return response.json({
      totalTestCases: Number(testCaseCount?.value ?? 0),
      totalRuns: records.length,
      models: summarizeInvoiceBenchmark(records),
      benchmarkRule:
        "同一張照片、模型、提示詞、圖片細節與推理設定，只採第一次執行計分。",
      billingNotice:
        "以下為 API 回報的 Token 用量。實際免費額度與計費結果，請以 OpenAI Usage 和 Costs Dashboard 為準。",
    });
  },
);

router.get(
  "/stores/:storeId/invoice-ocr/benchmark.csv",
  requireAuth,
  async (request: AuthenticatedInvoiceRequest, response) => {
    const access = await loadInvoiceOcrAccess(request, response);
    if (!access) return;
    const rows = await db
      .select({
        testCase: invoiceOcrTestCasesTable,
        run: invoiceOcrRunsTable,
        review: invoiceOcrReviewsTable,
      })
      .from(invoiceOcrRunsTable)
      .innerJoin(
        invoiceOcrTestCasesTable,
        eq(invoiceOcrTestCasesTable.id, invoiceOcrRunsTable.testCaseId),
      )
      .leftJoin(
        invoiceOcrReviewsTable,
        eq(invoiceOcrReviewsTable.runId, invoiceOcrRunsTable.id),
      )
      .where(eq(invoiceOcrRunsTable.storeId, access.storeId))
      .orderBy(
        asc(invoiceOcrRunsTable.createdAt),
        asc(invoiceOcrRunsTable.id),
      );

    const csvRows: InvoiceBenchmarkCsvRow[] = rows.map(
      ({ testCase, run, review }) => {
        const prediction = run.predictedJson;
        const corrected = review?.correctedJson ?? null;
        return {
          testCaseId: testCase.id,
          runId: run.id,
          originalFilename: testCase.originalFilename,
          imageSha256: testCase.imageSha256,
          requestedModel: run.requestedModel,
          actualModel: run.actualModel,
          promptVersion: run.promptVersion,
          imageDetail: run.imageDetail,
          reasoningEffort: run.reasoningEffort,
          status: run.status,
          safeErrorCode: run.safeErrorCode,
          groundTruthMerchantName: testCase.groundTruthMerchantName,
          groundTruthInvoiceDate: testCase.groundTruthInvoiceDate,
          groundTruthTotalAmount: testCase.groundTruthTotalAmount,
          groundTruthCurrency: testCase.groundTruthCurrency,
          merchantName: prediction?.merchant_name ?? null,
          invoiceDate: prediction?.invoice_date ?? null,
          totalAmount: prediction?.total_amount ?? null,
          currency: prediction?.currency ?? null,
          reviewRequired: run.reviewRequired,
          merchantNameCorrect: review?.merchantNameCorrect ?? null,
          invoiceDateCorrect: review?.invoiceDateCorrect ?? null,
          totalAmountCorrect: review?.totalAmountCorrect ?? null,
          currencyCorrect: review?.currencyCorrect ?? null,
          unsafeConfidentError:
            review?.unsafeConfidentError ?? null,
          correctedMerchantName: corrected?.merchantName ?? null,
          correctedInvoiceDate: corrected?.invoiceDate ?? null,
          correctedTotalAmount: corrected?.totalAmount ?? null,
          correctedCurrency: corrected?.currency ?? null,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          totalTokens: run.totalTokens,
          cachedInputTokens: run.cachedInputTokens,
          reasoningTokens: run.reasoningTokens,
          latencyMs: run.latencyMs,
          createdAt: run.createdAt.toISOString(),
        };
      },
    );

    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="invoice-ocr-benchmark.csv"',
    );
    response.type("text/csv; charset=utf-8");
    return response.send(buildInvoiceBenchmarkCsv(csvRows));
  },
);

export default router;
