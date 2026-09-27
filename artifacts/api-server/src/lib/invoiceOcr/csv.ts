export interface InvoiceBenchmarkCsvRow {
  testCaseId: number;
  runId: number;
  originalFilename: string;
  imageSha256: string;
  requestedModel: string;
  actualModel: string | null;
  promptVersion: string;
  imageDetail: string;
  reasoningEffort: string;
  status: string;
  safeErrorCode: string | null;
  groundTruthMerchantName: string;
  groundTruthInvoiceDate: string;
  groundTruthTotalAmount: string;
  groundTruthCurrency: string;
  merchantName: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  currency: string | null;
  reviewRequired: boolean | null;
  merchantNameCorrect: boolean | null;
  invoiceDateCorrect: boolean | null;
  totalAmountCorrect: boolean | null;
  currencyCorrect: boolean | null;
  unsafeConfidentError: boolean | null;
  correctedMerchantName: string | null;
  correctedInvoiceDate: string | null;
  correctedTotalAmount: string | null;
  correctedCurrency: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}

const HEADERS = [
  "test_case_id",
  "run_id",
  "original_filename",
  "image_sha256",
  "requested_model",
  "actual_model",
  "prompt_version",
  "image_detail",
  "reasoning_effort",
  "status",
  "safe_error_code",
  "ground_truth_merchant_name",
  "ground_truth_invoice_date",
  "ground_truth_total_amount",
  "ground_truth_currency",
  "merchant_name",
  "invoice_date",
  "total_amount",
  "currency",
  "review_required",
  "merchant_name_correct",
  "invoice_date_correct",
  "total_amount_correct",
  "currency_correct",
  "unsafe_confident_error",
  "corrected_merchant_name",
  "corrected_invoice_date",
  "corrected_total_amount",
  "corrected_currency",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cached_input_tokens",
  "reasoning_tokens",
  "latency_ms",
  "created_at",
] as const;

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function rowValues(row: InvoiceBenchmarkCsvRow): unknown[] {
  return [
    row.testCaseId,
    row.runId,
    row.originalFilename,
    row.imageSha256,
    row.requestedModel,
    row.actualModel,
    row.promptVersion,
    row.imageDetail,
    row.reasoningEffort,
    row.status,
    row.safeErrorCode,
    row.groundTruthMerchantName,
    row.groundTruthInvoiceDate,
    row.groundTruthTotalAmount,
    row.groundTruthCurrency,
    row.merchantName,
    row.invoiceDate,
    row.totalAmount,
    row.currency,
    row.reviewRequired,
    row.merchantNameCorrect,
    row.invoiceDateCorrect,
    row.totalAmountCorrect,
    row.currencyCorrect,
    row.unsafeConfidentError,
    row.correctedMerchantName,
    row.correctedInvoiceDate,
    row.correctedTotalAmount,
    row.correctedCurrency,
    row.inputTokens,
    row.outputTokens,
    row.totalTokens,
    row.cachedInputTokens,
    row.reasoningTokens,
    row.latencyMs,
    row.createdAt,
  ];
}

export function buildInvoiceBenchmarkCsv(
  rows: readonly InvoiceBenchmarkCsvRow[],
): string {
  const lines = [
    HEADERS.map(escapeCsvCell).join(","),
    ...rows.map((row) => rowValues(row).map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
