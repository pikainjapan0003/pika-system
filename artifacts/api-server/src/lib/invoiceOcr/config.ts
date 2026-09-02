export const INVOICE_OCR_MODELS = [
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.6-luna",
] as const;

export type InvoiceOcrModel = (typeof INVOICE_OCR_MODELS)[number];

export const INVOICE_IMAGE_DETAILS = [
  "original",
  "high",
  "low",
  "auto",
] as const;
export type InvoiceImageDetail = (typeof INVOICE_IMAGE_DETAILS)[number];

export const INVOICE_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type InvoiceReasoningEffort =
  (typeof INVOICE_REASONING_EFFORTS)[number];

const DEFAULT_MODEL: InvoiceOcrModel = "gpt-5.6-terra";
const DEFAULT_COMPARE_MODELS: readonly InvoiceOcrModel[] = [
  "gpt-5.6-sol",
  "gpt-5.6-luna",
];
const DEFAULT_MAX_FILE_MB = 12;
const DEFAULT_TIMEOUT_MS = 90_000;

export class InvoiceOcrConfigError extends Error {
  readonly code = "invoice_ocr_config_error";

  constructor(message: string) {
    super(message);
    this.name = "InvoiceOcrConfigError";
  }
}

export interface InvoiceOcrConfig {
  enabled: boolean;
  testMode: boolean;
  apiKey: string | null;
  defaultModel: InvoiceOcrModel;
  allowedModels: readonly InvoiceOcrModel[];
  imageDetail: InvoiceImageDetail;
  reasoningEffort: InvoiceReasoningEffort;
  maxFileBytes: number;
  timeoutMs: number;
  allowedClerkUserIds: ReadonlySet<string>;
}

function booleanFrom(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvoiceOcrConfigError(`${name} 必須是 true 或 false`);
}

function integerFrom(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value)) {
    throw new InvoiceOcrConfigError(`${name} 必須是整數`);
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new InvoiceOcrConfigError(
      `${name} 必須介於 ${minimum} 與 ${maximum} 之間`,
    );
  }
  return parsed;
}

function modelFrom(value: string, name: string): InvoiceOcrModel {
  if ((INVOICE_OCR_MODELS as readonly string[]).includes(value)) {
    return value as InvoiceOcrModel;
  }
  throw new InvoiceOcrConfigError(`${name} 不是允許的發票模型`);
}

function detailFrom(value: string): InvoiceImageDetail {
  if ((INVOICE_IMAGE_DETAILS as readonly string[]).includes(value)) {
    return value as InvoiceImageDetail;
  }
  throw new InvoiceOcrConfigError(
    "OPENAI_INVOICE_IMAGE_DETAIL 不是允許的圖片細節設定",
  );
}

function effortFrom(value: string): InvoiceReasoningEffort {
  if ((INVOICE_REASONING_EFFORTS as readonly string[]).includes(value)) {
    return value as InvoiceReasoningEffort;
  }
  throw new InvoiceOcrConfigError(
    "OPENAI_INVOICE_REASONING_EFFORT 不是允許的推理設定",
  );
}

function compareModelsFrom(value: string | undefined): InvoiceOcrModel[] {
  const raw =
    value === undefined
      ? DEFAULT_COMPARE_MODELS
      : value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
  return raw.map((item) =>
    modelFrom(item, "OPENAI_INVOICE_COMPARE_MODELS"),
  );
}

function userAllowlistFrom(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function readInvoiceOcrConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceOcrConfig {
  const defaultModel = modelFrom(
    env.OPENAI_INVOICE_MODEL?.trim() || DEFAULT_MODEL,
    "OPENAI_INVOICE_MODEL",
  );
  const compareModels = compareModelsFrom(
    env.OPENAI_INVOICE_COMPARE_MODELS,
  );
  const allowedModels = Array.from(
    new Set<InvoiceOcrModel>([defaultModel, ...compareModels]),
  );
  const maxFileMb = integerFrom(
    env.INVOICE_OCR_MAX_FILE_MB,
    DEFAULT_MAX_FILE_MB,
    "INVOICE_OCR_MAX_FILE_MB",
    1,
    50,
  );

  return {
    enabled: booleanFrom(
      env.INVOICE_OCR_ENABLED,
      false,
      "INVOICE_OCR_ENABLED",
    ),
    testMode: booleanFrom(
      env.INVOICE_OCR_TEST_MODE,
      false,
      "INVOICE_OCR_TEST_MODE",
    ),
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    defaultModel,
    allowedModels,
    imageDetail: detailFrom(
      env.OPENAI_INVOICE_IMAGE_DETAIL?.trim() || "original",
    ),
    reasoningEffort: effortFrom(
      env.OPENAI_INVOICE_REASONING_EFFORT?.trim() || "low",
    ),
    maxFileBytes: maxFileMb * 1024 * 1024,
    timeoutMs: integerFrom(
      env.INVOICE_OCR_REQUEST_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      "INVOICE_OCR_REQUEST_TIMEOUT_MS",
      10_000,
      180_000,
    ),
    allowedClerkUserIds: userAllowlistFrom(
      env.INVOICE_OCR_ALLOWED_CLERK_USER_IDS,
    ),
  };
}

export function assertInvoiceOcrEnabled(config: InvoiceOcrConfig): void {
  if (!config.enabled || !config.testMode) {
    throw new InvoiceOcrConfigError("發票辨識測試功能目前尚未開啟");
  }
}

export function assertInvoiceOcrUserAllowed(
  userId: string,
  config: InvoiceOcrConfig,
): void {
  if (!config.allowedClerkUserIds.has(userId)) {
    throw new InvoiceOcrConfigError("這個帳號沒有發票辨識測試權限");
  }
}

export function requireInvoiceApiKey(config: InvoiceOcrConfig): string {
  if (!config.apiKey) {
    throw new InvoiceOcrConfigError(
      "OpenAI API Key 尚未在伺服器安全設定中完成",
    );
  }
  return config.apiKey;
}

export function parseRequestedInvoiceModel(
  value: unknown,
  config: InvoiceOcrConfig,
): InvoiceOcrModel {
  if (typeof value !== "string") {
    throw new InvoiceOcrConfigError("請選擇一個允許的發票模型");
  }
  const model = modelFrom(value, "model");
  if (!config.allowedModels.includes(model)) {
    throw new InvoiceOcrConfigError("這個發票模型目前尚未開放測試");
  }
  return model;
}
