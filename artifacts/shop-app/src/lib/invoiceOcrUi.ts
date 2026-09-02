export const INVOICE_OCR_MODELS = [
  { id: "gpt-5.6-terra", label: "Terra（預設）" },
  { id: "gpt-5.6-sol", label: "Sol（較高準確度比較）" },
  { id: "gpt-5.6-luna", label: "Luna（較低成本比較）" },
] as const;

export type InvoiceOcrModel = (typeof INVOICE_OCR_MODELS)[number]["id"];

export interface InvoiceFields {
  merchantName: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  currency: string | null;
}

export interface InvoicePrediction extends InvoiceFields {
  reviewRequired: boolean;
  reviewReasons: string[];
  evidence: InvoiceFields;
}

export interface InvoiceOcrRun {
  id: number;
  testCaseId: number;
  requestedModel: InvoiceOcrModel;
  actualModel: string | null;
  promptVersion: string;
  imageDetail: string;
  reasoningEffort: string;
  predicted: InvoicePrediction | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number | null;
  status: "processing" | "completed" | "failed";
  errorCode: string | null;
  retryable: boolean;
  attemptCount: number;
  rerunOfRunId: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface InvoiceOcrReview {
  id: number;
  runId: number;
  merchantNameCorrect: boolean;
  invoiceDateCorrect: boolean;
  totalAmountCorrect: boolean;
  currencyCorrect: boolean;
  unsafeConfidentError: boolean;
  corrected: InvoiceFields | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface InvoiceOcrTestCase {
  id: number;
  originalFilename: string;
  imageSha256: string;
  groundTruth: {
    merchantName: string;
    invoiceDate: string;
    totalAmount: string;
    currency: string;
  };
  groundTruthLockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runs?: Array<{
    run: InvoiceOcrRun;
    review: InvoiceOcrReview | null;
  }>;
}

export interface InvoiceOcrModelSummary {
  requestedModel: string;
  promptVersion: string;
  imageDetail: string;
  reasoningEffort: string;
  caseCount: number;
  structuredFormatCount: number;
  merchantNameCorrect: number;
  invoiceDateCorrect: number;
  totalAmountCorrect: number;
  currencyCorrect: number;
  unsafeConfidentErrorCount: number;
  totalTokens: number;
  averageTokens: number | null;
  medianTokens: number | null;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  passed: boolean;
}

export interface InvoiceOcrSummary {
  totalTestCases: number;
  totalRuns: number;
  models: InvoiceOcrModelSummary[];
  benchmarkRule: string;
  billingNotice: string;
}

export class InvoiceOcrApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "InvoiceOcrApiError";
  }
}

async function authHeaders(
  getToken: () => Promise<string | null>,
): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(response: Response): Promise<InvoiceOcrApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    retryable?: boolean;
  };
  return new InvoiceOcrApiError(
    body.error ?? "系統暫時沒有正常回應。",
    response.status,
    body.code ?? "request_failed",
    body.retryable === true,
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 100_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new InvoiceOcrApiError(
        "等待時間已結束。請先重新整理最近紀錄，不要立刻建立新請求。",
        504,
        "browser_timeout_unknown",
        false,
      );
    }
    throw new InvoiceOcrApiError(
      "網路中斷，請保留畫面並稍後查看最近紀錄。",
      0,
      "browser_network_error",
      true,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function validateInvoiceFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) {
    return "目前請先將 HEIC 轉成 JPG 後上傳。";
  }
  if (
    file.type !== "image/jpeg" &&
    file.type !== "image/png" &&
    file.type !== "image/webp"
  ) {
    return "僅支援 JPG、PNG、WebP 圖片。";
  }
  if (file.size > 12 * 1024 * 1024) {
    return "圖片不可超過 12 MB。";
  }
  if (file.size === 0) return "這個圖片檔案是空的。";
  return null;
}

export async function createInvoiceOcrTestCase(input: {
  storeId: number;
  file: File;
  privacyConfirmed: boolean;
  groundTruth: {
    merchantName: string;
    invoiceDate: string;
    totalAmount: string;
    currency: string;
  };
  getToken: () => Promise<string | null>;
}): Promise<{ testCase: InvoiceOcrTestCase; existing: boolean }> {
  const form = new FormData();
  form.append("image", input.file);
  form.append("merchantName", input.groundTruth.merchantName);
  form.append("invoiceDate", input.groundTruth.invoiceDate);
  form.append("totalAmount", input.groundTruth.totalAmount);
  form.append("currency", input.groundTruth.currency);
  form.append("privacyConfirmed", input.privacyConfirmed ? "true" : "false");
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/test-cases`,
    {
      method: "POST",
      credentials: "include",
      headers: await authHeaders(input.getToken),
      body: form,
    },
    30_000,
  );
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function analyzeInvoiceOcrTestCase(input: {
  storeId: number;
  testCaseId: number;
  file: File;
  model: InvoiceOcrModel;
  confirmRerun: boolean;
  confirmUnknownRerun: boolean;
  clientRequestId: string;
  getToken: () => Promise<string | null>;
}): Promise<{
  run: InvoiceOcrRun;
  review: InvoiceOcrReview | null;
  existing: boolean;
  requiresUnknownRerunConfirmation?: boolean;
  warning?: string;
}> {
  const form = new FormData();
  form.append("image", input.file);
  form.append("model", input.model);
  form.append("confirmRerun", input.confirmRerun ? "true" : "false");
  form.append(
    "confirmUnknownRerun",
    input.confirmUnknownRerun ? "true" : "false",
  );
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/test-cases/${input.testCaseId}/analyze`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        ...(await authHeaders(input.getToken)),
        "x-client-request-id": input.clientRequestId,
      },
      body: form,
    },
  );
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function listInvoiceOcrTestCases(input: {
  storeId: number;
  getToken: () => Promise<string | null>;
}): Promise<{
  testCases: InvoiceOcrTestCase[];
  maximumTestCases: number;
}> {
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/test-cases`,
    {
      credentials: "include",
      headers: await authHeaders(input.getToken),
    },
    30_000,
  );
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function getInvoiceOcrSummary(input: {
  storeId: number;
  getToken: () => Promise<string | null>;
}): Promise<InvoiceOcrSummary> {
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/benchmark-summary`,
    {
      credentials: "include",
      headers: await authHeaders(input.getToken),
    },
    30_000,
  );
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function reviewInvoiceOcrRun(input: {
  storeId: number;
  runId: number;
  corrected: InvoiceFields | null;
  getToken: () => Promise<string | null>;
}): Promise<{ review: InvoiceOcrReview }> {
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/runs/${input.runId}/review`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        ...(await authHeaders(input.getToken)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ corrected: input.corrected }),
    },
    30_000,
  );
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function downloadInvoiceOcrCsv(input: {
  storeId: number;
  getToken: () => Promise<string | null>;
}): Promise<void> {
  const response = await fetchWithTimeout(
    `/api/stores/${input.storeId}/invoice-ocr/benchmark.csv`,
    {
      credentials: "include",
      headers: await authHeaders(input.getToken),
    },
    30_000,
  );
  if (!response.ok) throw await readError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "invoice-ocr-benchmark.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
