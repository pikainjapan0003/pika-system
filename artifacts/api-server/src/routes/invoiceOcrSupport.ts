import type { Request, Response } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import type {
  InvoiceOcrReview,
  InvoiceOcrRun,
  InvoiceOcrTestCase,
} from "@workspace/db";
import { verifyStoreOwner } from "../middlewares/auth.ts";
import {
  readInvoiceOcrConfig,
  type InvoiceOcrConfig,
} from "../lib/invoiceOcr/config.ts";

const uploadLimitMb = (() => {
  const raw = process.env.INVOICE_OCR_MAX_FILE_MB;
  if (!raw || !/^\d+$/.test(raw)) return 12;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50
    ? parsed
    : 12;
})();

const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadLimitMb * 1024 * 1024,
    files: 1,
    fields: 12,
    parts: 13,
  },
  fileFilter: (_request, file, callback) => {
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/webp"
    ) {
      callback(null, true);
      return;
    }
    callback(new Error("INVOICE_UNSUPPORTED_IMAGE_TYPE"));
  },
});

export type AuthenticatedInvoiceRequest = Request & {
  userId: string;
  file?: Express.Multer.File;
};

export const invoiceOcrMutationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (request) =>
    String((request as AuthenticatedInvoiceRequest).userId),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: "操作太頻繁，請稍後再試。",
      code: "invoice_ocr_rate_limited",
      retryable: true,
    });
  },
});

export const invoiceOcrAnalyzeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  keyGenerator: (request) =>
    String((request as AuthenticatedInvoiceRequest).userId),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: "辨識要求太頻繁，請稍後再試。",
      code: "invoice_ocr_analyze_rate_limited",
      retryable: true,
    });
  },
});

export function parseInvoiceUpload(
  request: Request,
  response: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    invoiceUpload.single("image")(request, response, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function sendInvoiceUploadError(
  error: unknown,
  response: Response,
): void {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(400).json({
        error: `圖片不可超過 ${uploadLimitMb} MB。`,
        code: "image_too_large",
        retryable: false,
      });
      return;
    }
    response.status(400).json({
      error: "一次只能上傳一張發票照片。",
      code: "invalid_upload",
      retryable: false,
    });
    return;
  }
  if (
    error instanceof Error &&
    error.message === "INVOICE_UNSUPPORTED_IMAGE_TYPE"
  ) {
    response.status(400).json({
      error: "僅支援 JPG、PNG、WebP；HEIC 請先轉成 JPG。",
      code: "unsupported_image_type",
      retryable: false,
    });
    return;
  }
  response.status(400).json({
    error: "照片上傳失敗，請重新選擇檔案。",
    code: "invalid_upload",
    retryable: false,
  });
}

export function positiveId(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function requiredBodyString(
  body: unknown,
  key: string,
): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function isInvoiceOcrProcessingStatusUnknown(
  createdAt: Date,
  timeoutMs: number,
  now = Date.now(),
): boolean {
  return createdAt.getTime() < now - timeoutMs * 2 - 45_000;
}

export interface InvoiceOcrAccess {
  storeId: number;
  config: InvoiceOcrConfig;
}

export async function loadInvoiceOcrAccess(
  request: AuthenticatedInvoiceRequest,
  response: Response,
): Promise<InvoiceOcrAccess | null> {
  const storeId = positiveId(request.params.storeId);
  if (storeId === null) {
    response.status(400).json({
      error: "店家編號不正確。",
      code: "invalid_store_id",
      retryable: false,
    });
    return null;
  }
  if (!(await verifyStoreOwner(request, response, storeId))) return null;

  let config: InvoiceOcrConfig;
  try {
    config = readInvoiceOcrConfig();
  } catch {
    response.status(503).json({
      error: "發票辨識的伺服器設定有誤，請由管理者檢查。",
      code: "invoice_ocr_config_error",
      retryable: false,
    });
    return null;
  }
  if (!config.enabled || !config.testMode) {
    response.status(503).json({
      error: "發票辨識測試功能目前尚未開啟。",
      code: "invoice_ocr_disabled",
      retryable: false,
    });
    return null;
  }
  if (!config.allowedClerkUserIds.has(request.userId)) {
    response.status(403).json({
      error: "這個帳號沒有發票辨識測試權限。",
      code: "invoice_ocr_forbidden",
      retryable: false,
    });
    return null;
  }
  return { storeId, config };
}

export function databaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
  };
  const code = candidate.cause?.code ?? candidate.code;
  return typeof code === "string" ? code : null;
}

export function databaseConstraintName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    constraint?: unknown;
    cause?: { constraint?: unknown };
  };
  const constraint = candidate.cause?.constraint ?? candidate.constraint;
  return typeof constraint === "string" ? constraint : null;
}

function predictionForClient(run: InvoiceOcrRun) {
  const value = run.predictedJson;
  if (!value) return null;
  return {
    merchantName: value.merchant_name,
    invoiceDate: value.invoice_date,
    totalAmount: value.total_amount,
    currency: value.currency,
    reviewRequired: value.review_required,
    reviewReasons: value.review_reasons,
    evidence: {
      merchantName: value.evidence.merchant_name,
      invoiceDate: value.evidence.invoice_date,
      totalAmount: value.evidence.total_amount,
      currency: value.evidence.currency,
    },
  };
}

export function serializeInvoiceOcrTestCase(testCase: InvoiceOcrTestCase) {
  return {
    id: testCase.id,
    originalFilename: testCase.originalFilename,
    imageSha256: testCase.imageSha256,
    groundTruth: {
      merchantName: testCase.groundTruthMerchantName,
      invoiceDate: testCase.groundTruthInvoiceDate,
      totalAmount: testCase.groundTruthTotalAmount,
      currency: testCase.groundTruthCurrency,
    },
    groundTruthLockedAt:
      testCase.groundTruthLockedAt?.toISOString() ?? null,
    createdAt: testCase.createdAt.toISOString(),
    updatedAt: testCase.updatedAt.toISOString(),
  };
}

const RETRYABLE_ERROR_CODES = new Set([
  "openai_rate_limited",
  "openai_server_error",
  "openai_network_error",
]);

export function serializeInvoiceOcrRun(run: InvoiceOcrRun) {
  return {
    id: run.id,
    testCaseId: run.testCaseId,
    requestedModel: run.requestedModel,
    actualModel: run.actualModel,
    promptVersion: run.promptVersion,
    imageDetail: run.imageDetail,
    reasoningEffort: run.reasoningEffort,
    predicted: predictionForClient(run),
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    totalTokens: run.totalTokens,
    cachedInputTokens: run.cachedInputTokens,
    reasoningTokens: run.reasoningTokens,
    latencyMs: run.latencyMs,
    status: run.status,
    errorCode: run.safeErrorCode,
    retryable:
      run.safeErrorCode !== null &&
      RETRYABLE_ERROR_CODES.has(run.safeErrorCode),
    attemptCount: run.attemptCount,
    rerunOfRunId: run.rerunOfRunId,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export function serializeInvoiceOcrReview(review: InvoiceOcrReview | null) {
  if (!review) return null;
  return {
    id: review.id,
    runId: review.runId,
    merchantNameCorrect: review.merchantNameCorrect,
    invoiceDateCorrect: review.invoiceDateCorrect,
    totalAmountCorrect: review.totalAmountCorrect,
    currencyCorrect: review.currencyCorrect,
    unsafeConfidentError: review.unsafeConfidentError,
    corrected: review.correctedJson ?? null,
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt?.toISOString() ?? null,
  };
}
