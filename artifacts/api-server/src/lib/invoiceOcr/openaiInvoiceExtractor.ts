import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  InvoiceImageDetail,
  InvoiceOcrConfig,
  InvoiceOcrModel,
  InvoiceReasoningEffort,
} from "./config.ts";
import { requireInvoiceApiKey } from "./config.ts";
import {
  INVOICE_EXTRACTION_PROMPT,
  INVOICE_PROMPT_VERSION,
} from "./prompt.ts";
import {
  invoiceExtractionSchema,
  type InvoiceExtraction,
} from "./schema.ts";

export interface BuildInvoiceRequestInput {
  model: InvoiceOcrModel;
  imageDataUrl: string;
  imageDetail: InvoiceImageDetail;
  reasoningEffort: InvoiceReasoningEffort;
}

export function buildInvoiceOpenAIRequest(input: BuildInvoiceRequestInput) {
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(input.imageDataUrl)) {
    throw new TypeError("發票圖片必須是安全的 Data URL");
  }
  return {
    model: input.model,
    instructions: INVOICE_EXTRACTION_PROMPT,
    input: [
      {
        role: "user" as const,
        content: [
          {
            type: "input_text" as const,
            text: "請只根據這一張發票照片擷取指定欄位。",
          },
          {
            type: "input_image" as const,
            image_url: input.imageDataUrl,
            detail: input.imageDetail,
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(
        invoiceExtractionSchema,
        "invoice_extraction",
        {
          description: "單張發票的四個主要欄位與簡短證據",
        },
      ),
    },
    reasoning: { effort: input.reasoningEffort },
    max_output_tokens: 1_200,
    store: false,
  };
}

export type InvoiceOpenAIRequest = ReturnType<
  typeof buildInvoiceOpenAIRequest
>;

export interface InvoiceApiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
}

export interface InvoiceApiEnvelope {
  responseId: string;
  requestId: string | null;
  actualModel: string;
  status: string | null;
  outputParsed: unknown;
  output: unknown;
  incompleteReason: string | null;
  usage: InvoiceApiUsage;
}

export interface InvoiceApiFailureMetadata extends InvoiceApiUsage {
  responseId: string;
  requestId: string | null;
  actualModel: string;
}

export type InvoiceRequestExecutor = (
  request: InvoiceOpenAIRequest,
) => Promise<InvoiceApiEnvelope>;

export interface InvoiceExtractionResult {
  prediction: InvoiceExtraction;
  requestedModel: InvoiceOcrModel;
  actualModel: string;
  promptVersion: typeof INVOICE_PROMPT_VERSION;
  imageDetail: InvoiceImageDetail;
  reasoningEffort: InvoiceReasoningEffort;
  responseId: string;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number;
  attemptCount: number;
}

export interface InvoiceApiFailure {
  code:
    | "openai_key_invalid"
    | "openai_quota_unavailable"
    | "openai_model_forbidden"
    | "openai_model_not_found"
    | "openai_rate_limited"
    | "openai_server_error"
    | "openai_network_error"
    | "openai_timeout_unknown"
    | "openai_bad_request"
    | "openai_refused"
    | "openai_incomplete"
    | "openai_invalid_structured_output"
    | "openai_unknown_error";
  publicMessage: string;
  httpStatus: number;
  mayRetryManually: boolean;
  automaticRetry: boolean;
  retryAfterMs: number;
}

export class InvoiceExtractionRequestError extends Error {
  constructor(
    readonly failure: InvoiceApiFailure,
    readonly attemptCount: number,
    readonly latencyMs: number,
    readonly apiMetadata: InvoiceApiFailureMetadata | null = null,
  ) {
    super(failure.publicMessage);
    this.name = "InvoiceExtractionRequestError";
  }
}

function failureMetadata(
  envelope: InvoiceApiEnvelope,
): InvoiceApiFailureMetadata {
  return {
    responseId: envelope.responseId,
    requestId: envelope.requestId,
    actualModel: envelope.actualModel,
    ...envelope.usage,
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringProperty(
  value: unknown,
  property: string,
): string | undefined {
  const candidate = objectValue(value)?.[property];
  return typeof candidate === "string" ? candidate : undefined;
}

function numberProperty(
  value: unknown,
  property: string,
): number | undefined {
  const candidate = objectValue(value)?.[property];
  return typeof candidate === "number" ? candidate : undefined;
}

function errorCode(error: unknown): string {
  const direct = stringProperty(error, "code");
  if (direct) return direct;
  const nested = objectValue(error)?.error;
  const nestedCode = stringProperty(nested, "code");
  if (nestedCode) return nestedCode;
  const cause = objectValue(error)?.cause;
  return stringProperty(cause, "code") ?? "";
}

function headerValue(error: unknown, name: string): string | null {
  const headers = objectValue(error)?.headers;
  if (!headers) return null;
  if (
    typeof (headers as { get?: unknown }).get === "function"
  ) {
    const value = (
      headers as { get: (headerName: string) => string | null }
    ).get(name);
    return value;
  }
  const record = objectValue(headers);
  const value = record?.[name] ?? record?.[name.toLowerCase()];
  return typeof value === "string" ? value : null;
}

function retryAfterMs(error: unknown): number {
  const milliseconds = headerValue(error, "retry-after-ms");
  if (milliseconds && /^\d+$/.test(milliseconds)) {
    return Math.min(10_000, Math.max(250, Number(milliseconds)));
  }
  const raw = headerValue(error, "retry-after");
  if (!raw) return 1_000;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return Math.min(10_000, Math.max(250, Number(raw) * 1_000));
  }
  const timestamp = Date.parse(raw);
  if (Number.isFinite(timestamp)) {
    return Math.min(10_000, Math.max(250, timestamp - Date.now()));
  }
  return 1_000;
}

export function classifyInvoiceApiError(error: unknown): InvoiceApiFailure {
  const status =
    numberProperty(error, "status") ??
    numberProperty(error, "statusCode") ??
    0;
  const code = errorCode(error).toLowerCase();
  const name = stringProperty(error, "name")?.toLowerCase() ?? "";

  if (name.includes("timeout") || code.includes("timeout")) {
    return {
      code: "openai_timeout_unknown",
      publicMessage:
        "OpenAI 等候逾時。這次是否已使用 Token 無法確定，請先查看紀錄再決定是否重跑。",
      httpStatus: 504,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (status === 401) {
    return {
      code: "openai_key_invalid",
      publicMessage: "OpenAI API Key 無效，請檢查伺服器安全設定。",
      httpStatus: 503,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (
    code.includes("insufficient_quota") ||
    code.includes("billing") ||
    code.includes("quota_exceeded")
  ) {
    return {
      code: "openai_quota_unavailable",
      publicMessage:
        "OpenAI 帳戶目前沒有可用額度，請到 OpenAI Usage 與 Billing 查看。",
      httpStatus: 503,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (status === 403) {
    return {
      code: "openai_model_forbidden",
      publicMessage: "這個 OpenAI Project 沒有使用所選模型的權限。",
      httpStatus: 503,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (status === 404 || code === "model_not_found") {
    return {
      code: "openai_model_not_found",
      publicMessage: "所選 OpenAI 模型不存在或目前無法使用。",
      httpStatus: 503,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (status === 429) {
    return {
      code: "openai_rate_limited",
      publicMessage: "OpenAI 請求過於頻繁，系統已停止繼續送出。",
      httpStatus: 429,
      mayRetryManually: true,
      automaticRetry: true,
      retryAfterMs: retryAfterMs(error),
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      code: "openai_server_error",
      publicMessage: "OpenAI 暫時沒有正常回應，系統已停止繼續送出。",
      httpStatus: 503,
      mayRetryManually: true,
      automaticRetry: true,
      retryAfterMs: 500,
    };
  }
  if (["econnrefused", "enotfound", "eai_again"].includes(code)) {
    return {
      code: "openai_network_error",
      publicMessage: "連往 OpenAI 的網路暫時中斷。",
      httpStatus: 503,
      mayRetryManually: true,
      automaticRetry: true,
      retryAfterMs: 500,
    };
  }
  if (
    name.includes("connection") ||
    ["econnreset", "etimedout", "epipe"].includes(code)
  ) {
    return {
      code: "openai_timeout_unknown",
      publicMessage:
        "連線中斷，無法確定 OpenAI 是否已收到請求。請先查看紀錄，不會自動重送。",
      httpStatus: 504,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "openai_bad_request",
      publicMessage:
        "OpenAI 無法接受這張圖片或目前的模型設定，系統沒有改用其他模型。",
      httpStatus: 422,
      mayRetryManually: false,
      automaticRetry: false,
      retryAfterMs: 0,
    };
  }
  return {
    code: "openai_unknown_error",
    publicMessage: "發票辨識失敗，系統沒有再次送出照片。",
    httpStatus: 503,
    mayRetryManually: false,
    automaticRetry: false,
    retryAfterMs: 0,
  };
}

function containsRefusal(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRefusal);
  const object = objectValue(value);
  if (!object) return false;
  if (object.type === "refusal") return true;
  return Object.values(object).some(containsRefusal);
}

function localFailure(
  code:
    | "openai_refused"
    | "openai_incomplete"
    | "openai_invalid_structured_output",
  message: string,
): InvoiceApiFailure {
  return {
    code,
    publicMessage: message,
    httpStatus: 422,
    mayRetryManually: false,
    automaticRetry: false,
    retryAfterMs: 0,
  };
}

async function officialExecutor(
  apiKey: string,
  timeoutMs: number,
  request: InvoiceOpenAIRequest,
): Promise<InvoiceApiEnvelope> {
  const client = new OpenAI({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
  });
  const result = await client.responses.parse(request).withResponse();
  const response = result.data;
  return {
    responseId: response.id,
    requestId: result.request_id,
    actualModel: response.model,
    status: response.status ?? null,
    outputParsed: response.output_parsed,
    output: response.output,
    incompleteReason: response.incomplete_details?.reason ?? null,
    usage: {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? null,
      reasoningTokens:
        response.usage?.output_tokens_details?.reasoning_tokens ?? null,
    },
  };
}

export async function extractInvoiceWithOpenAI(
  input: BuildInvoiceRequestInput,
  config: InvoiceOcrConfig,
  dependencies: {
    executeRequest?: InvoiceRequestExecutor;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<InvoiceExtractionResult> {
  const apiKey = dependencies.executeRequest
    ? null
    : requireInvoiceApiKey(config);
  const executeRequest =
    dependencies.executeRequest ??
    ((request: InvoiceOpenAIRequest) =>
      officialExecutor(apiKey!, config.timeoutMs, request));
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? Date.now;
  const request = buildInvoiceOpenAIRequest(input);
  const startedAt = now();
  let attemptCount = 0;

  while (attemptCount < 2) {
    attemptCount++;
    try {
      const envelope = await executeRequest(request);
      const latencyMs = Math.max(0, now() - startedAt);
      if (containsRefusal(envelope.output)) {
        throw new InvoiceExtractionRequestError(
          localFailure(
            "openai_refused",
            "OpenAI 拒絕處理這張圖片，沒有產生可用草稿。",
          ),
          attemptCount,
          latencyMs,
          failureMetadata(envelope),
        );
      }
      if (envelope.status !== "completed") {
        throw new InvoiceExtractionRequestError(
          localFailure(
            "openai_incomplete",
            envelope.incompleteReason
              ? "OpenAI 沒有完成這次辨識，請檢查圖片或模型設定。"
              : "OpenAI 沒有完成這次辨識。",
          ),
          attemptCount,
          latencyMs,
          failureMetadata(envelope),
        );
      }
      const parsed = invoiceExtractionSchema.safeParse(
        envelope.outputParsed,
      );
      if (!parsed.success) {
        throw new InvoiceExtractionRequestError(
          localFailure(
            "openai_invalid_structured_output",
            "OpenAI 回傳格式未通過伺服器驗證，沒有建立可用草稿。",
          ),
          attemptCount,
          latencyMs,
          failureMetadata(envelope),
        );
      }
      return {
        prediction: parsed.data,
        requestedModel: input.model,
        actualModel: envelope.actualModel,
        promptVersion: INVOICE_PROMPT_VERSION,
        imageDetail: input.imageDetail,
        reasoningEffort: input.reasoningEffort,
        responseId: envelope.responseId,
        requestId: envelope.requestId,
        ...envelope.usage,
        latencyMs,
        attemptCount,
      };
    } catch (error) {
      if (error instanceof InvoiceExtractionRequestError) throw error;
      const failure = classifyInvoiceApiError(error);
      if (attemptCount < 2 && failure.automaticRetry) {
        await sleep(failure.retryAfterMs);
        continue;
      }
      throw new InvoiceExtractionRequestError(
        failure,
        attemptCount,
        Math.max(0, now() - startedAt),
      );
    }
  }

  throw new InvoiceExtractionRequestError(
    classifyInvoiceApiError(new Error("unreachable")),
    attemptCount,
    Math.max(0, now() - startedAt),
  );
}
