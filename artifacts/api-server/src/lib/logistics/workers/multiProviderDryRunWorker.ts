/**
 * Multi-provider dry-run worker（Step 7N-B）— 不寫 DB、不查 DB、不接 route。
 *
 * 目的：以 worker-like flow 驗證 postoffice / tcat adapter 可走完
 * gate → adapter → validation → idempotency key preview → snapshot preview → run summary
 * 的完整邏輯管線，作為未來 controlled worker（7N-C/7N-D）的施工基礎。
 *
 * 7-11：本階段 gate-only（requiresManualFallback），不打外部查詢。
 * familymart：正式 worker 已存在（familyMartTrackingWorker.ts），本檔不重複實跑。
 *
 * 個資規則沿用既有 worker：summary / key 只含 trackingCode、狀態文字、時間，
 * 不含姓名 / 電話 / 地址。
 */

import { queryPostOfficeTracking } from "../adapters/postOfficeAdapter.ts";
import { queryTcatTracking } from "../adapters/tcatAdapter.ts";
import type {
  TrackingAdapterResult,
  TrackingEvent,
} from "../adapters/types.ts";

export type DryRunProvider = "familymart" | "postoffice" | "tcat" | "711";

export interface DryRunProviderGate {
  manualSyncEnabled: boolean;
  controlledWorkerEnabled: boolean;
  scheduledSyncEnabled: boolean;
  /** 7-11 半自動：CAPTCHA_REQUIRED / OCR_FAILED 必走 exception queue / 人工 fallback */
  requiresManualFallback?: boolean;
}

/**
 * 乾跑用 gate config（Step 7N-B）。
 * 注意：這不是正式 provider registry（providers.ts supportsAutoSync），
 * 正式 UI 文案仍由 registry 控制，本 config 只作用於 dry-run / 未來 controlled worker。
 */
export const DRY_RUN_PROVIDER_GATE: Record<DryRunProvider, DryRunProviderGate> =
  {
    familymart: {
      manualSyncEnabled: true,
      controlledWorkerEnabled: true,
      scheduledSyncEnabled: true,
    },
    postoffice: {
      manualSyncEnabled: true,
      controlledWorkerEnabled: true,
      scheduledSyncEnabled: false,
    },
    tcat: {
      manualSyncEnabled: true,
      controlledWorkerEnabled: true,
      scheduledSyncEnabled: false,
    },
    "711": {
      manualSyncEnabled: true,
      controlledWorkerEnabled: false,
      scheduledSyncEnabled: false,
      requiresManualFallback: true,
    },
  };

export interface DryRunTrackingInput {
  provider: DryRunProvider | string;
  trackingCode: string;
  trackingId?: number | string;
  orderId?: number | string;
  storeId?: number | string;
}

export interface DryRunTrackingResult {
  provider: string;
  trackingCode: string;
  ok: boolean;
  adapterOk: boolean;
  wouldWriteEvents: number;
  wouldUpdateSnapshot: boolean;
  latestStatus: string | null;
  latestStatusText: string | null;
  latestEventAt: string | null;
  idempotencyKeysPreview: string[];
  validationWarnings: string[];
  gate?: DryRunProviderGate;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  skippedReason?: string;
}

export interface DryRunSummary {
  dryRun: true;
  totalJobs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errorCodeSummary: string | null;
  results: DryRunTrackingResult[];
}

type AdapterFn = (input: {
  trackingCode: string;
  timeoutMs?: number;
}) => Promise<TrackingAdapterResult<string>>;

export interface DryRunDeps {
  /** 測試用 adapter override；預設 live postoffice / tcat adapter */
  adapters?: Partial<Record<DryRunProvider, AdapterFn>>;
  timeoutMs?: number;
}

/**
 * Preview-only idempotency key（不寫 DB、不查 DB、deterministic）。
 * 基本格式對齊 familyMart worker：`${provider}:${trackingCode}:${occurredAt || "no-date"}:${description}`。
 *
 * tcat 例外（Step 7N-C）：黑貓會出現同時間、同狀態、不同地點的事件
 * （例：兩筆「超商代收」皆 2026/05/28 15:02），故 tcat key 追加
 * `:${location || "no-location"}` 避免誤去重。familyMart 正式 worker 的
 * buildEventIdempotencyKey 不受影響。
 */
export function buildDryRunIdempotencyKey(
  provider: string,
  trackingCode: string,
  event: TrackingEvent,
): string {
  const description = event.eventDescription || event.eventStatus || "unknown";
  const base = `${provider}:${trackingCode}:${event.occurredAt ?? "no-date"}:${description}`;
  if (provider === "tcat") {
    return `${base}:${event.eventLocation || "no-location"}`;
  }
  return base;
}

function validateAdapterSuccess(
  result: Extract<TrackingAdapterResult<string>, { ok: true }>,
): string[] {
  const warnings: string[] = [];
  if (!Array.isArray(result.events)) warnings.push("events is not an array");
  if (!result.latestStatusText) warnings.push("latestStatusText is empty");
  if (!result.latestEventAt)
    warnings.push("latestEventAt is null（接受，但 snapshot 會缺時間）");
  for (const [i, e] of (result.events ?? []).entries()) {
    if (!e.occurredAt)
      warnings.push(`event[${i}] occurredAt missing（key 以 no-date 標示）`);
    if (!e.eventDescription && !e.eventStatus)
      warnings.push(`event[${i}] has no description/status`);
  }
  return warnings;
}

const DEFAULT_ADAPTERS: Partial<Record<DryRunProvider, AdapterFn>> = {
  postoffice: (input) => queryPostOfficeTracking(input),
  tcat: (input) => queryTcatTracking(input),
};

export async function runMultiProviderDryRun(
  inputs: DryRunTrackingInput[],
  deps: DryRunDeps = {},
): Promise<DryRunSummary> {
  const results: DryRunTrackingResult[] = [];
  const errorCodeCounts = new Map<string, number>();
  const adapters = { ...DEFAULT_ADAPTERS, ...deps.adapters };

  for (const input of inputs) {
    const provider = String(input.provider ?? "").trim();
    const trackingCode = String(input.trackingCode ?? "").trim();
    const base: DryRunTrackingResult = {
      provider,
      trackingCode,
      ok: false,
      adapterOk: false,
      wouldWriteEvents: 0,
      wouldUpdateSnapshot: false,
      latestStatus: null,
      latestStatusText: null,
      latestEventAt: null,
      idempotencyKeysPreview: [],
      validationWarnings: [],
    };

    // 1. provider gate
    const gate = (DRY_RUN_PROVIDER_GATE as Record<string, DryRunProviderGate>)[
      provider
    ];
    if (!gate) {
      results.push({
        ...base,
        skippedReason: `UNSUPPORTED_PROVIDER: ${provider || "(empty)"}`,
      });
      continue;
    }
    base.gate = gate;
    if (!gate.manualSyncEnabled) {
      results.push({ ...base, skippedReason: "MANUAL_SYNC_DISABLED" });
      continue;
    }
    if (!trackingCode) {
      results.push({ ...base, skippedReason: "EMPTY_TRACKING_CODE" });
      continue;
    }

    // 2. 7-11 gate-only：半自動 provider，dry-run 階段不打外部查詢
    if (provider === "711") {
      results.push({
        ...base,
        skippedReason:
          "GATE_ONLY: 7-11 為半自動（OCR/captcha），本階段不外部查詢；CAPTCHA_REQUIRED / OCR_FAILED 應進 exception queue / 人工 fallback",
      });
      continue;
    }

    // 3. adapter call（dry-run 階段只實跑 postoffice / tcat）
    const adapterFn = adapters[provider as DryRunProvider];
    if (!adapterFn) {
      results.push({
        ...base,
        skippedReason: `NO_DRY_RUN_ADAPTER: ${provider}`,
      });
      continue;
    }

    let adapterResult: TrackingAdapterResult<string>;
    try {
      adapterResult = await adapterFn({
        trackingCode,
        timeoutMs: deps.timeoutMs,
      });
    } catch (err) {
      // adapter 設計上不 throw；萬一 throw 轉標準失敗，不中斷整輪（沿用既有 worker 慣例）
      adapterResult = {
        ok: false,
        provider,
        trackingCode,
        errorCode: "UNKNOWN_ERROR",
        message:
          err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        retryable: true,
      };
    }

    if (!adapterResult.ok) {
      errorCodeCounts.set(
        adapterResult.errorCode,
        (errorCodeCounts.get(adapterResult.errorCode) ?? 0) + 1,
      );
      results.push({
        ...base,
        errorCode: adapterResult.errorCode,
        errorMessage: adapterResult.message,
        retryable: adapterResult.retryable,
      });
      continue;
    }

    // 4. validation + 5. idempotency key preview + 6. snapshot preview
    const warnings = validateAdapterSuccess(adapterResult);
    const keys = adapterResult.events.map((e) =>
      buildDryRunIdempotencyKey(provider, trackingCode, e),
    );

    results.push({
      ...base,
      ok: true,
      adapterOk: true,
      wouldWriteEvents: adapterResult.events.length,
      wouldUpdateSnapshot: true,
      latestStatus: adapterResult.normalizedStatus,
      latestStatusText: adapterResult.latestStatusText,
      latestEventAt: adapterResult.latestEventAt,
      idempotencyKeysPreview: keys,
      validationWarnings: warnings,
    });
  }

  const successCount = results.filter((r) => r.ok).length;
  const skippedCount = results.filter((r) => r.skippedReason).length;
  const failedCount = results.length - successCount - skippedCount;
  const errorCodeSummary =
    errorCodeCounts.size > 0
      ? [...errorCodeCounts.entries()].map(([c, n]) => `${c}x${n}`).join(", ")
      : null;

  return {
    dryRun: true,
    totalJobs: results.length,
    successCount,
    failedCount,
    skippedCount,
    errorCodeSummary,
    results,
  };
}

// ---------------------------------------------------------------------------
// Controlled worker（Step 7N-C）— single-order / small batch、no-write
// ---------------------------------------------------------------------------

export interface ControlledWorkerJobResult {
  provider: string;
  trackingCode: string;
  trackingId?: string | number;
  orderId?: string | number;
  storeId?: string | number;
  ok: boolean;
  skipped: boolean;
  skippedReason?: string;
  adapterOk: boolean;
  wouldWriteEvents: number;
  wouldUpdateSnapshot: boolean;
  latestStatus: string | null;
  latestStatusText: string | null;
  latestEventAt: string | null;
  idempotencyKeysPreview: string[];
  validationWarnings: string[];
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  circuitBreakerSkipped?: boolean;
}

export interface ControlledWorkerProviderSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  circuitBreakerTriggered: boolean;
}

export interface ControlledWorkerSummary {
  dryRun: true;
  noWrite: true;
  totalJobs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  providerSummary: Record<string, ControlledWorkerProviderSummary>;
  jobs: ControlledWorkerJobResult[];
  rateLimitApplied: boolean;
  appliedDelayMs: number;
}

export interface ControlledWorkerDeps extends DryRunDeps {
  /** job 間 delay（rate limit）；預設 500ms */
  delayMs?: number;
  /** 測試用 fake sleep；預設 setTimeout */
  sleep?: (ms: number) => Promise<void>;
  /** 同 provider 連續 non-retryable 失敗達此值 → 熔斷該 provider 剩餘 jobs；預設 2 */
  circuitBreakerThreshold?: number;
  /** 批次上限；預設 5，超過直接 throw（拒絕，不截斷） */
  maxBatchSize?: number;
}

const DEFAULT_DELAY_MS = 500;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 2;
const DEFAULT_MAX_BATCH_SIZE = 5;

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Controlled worker（no-write）：在 dry-run pipeline 上加批次上限、
 * rate limit（job 間 delay）、circuit breaker（連續 non-retryable 熔斷）。
 * 不 import / 不查 / 不寫 DB；711 維持 gate-only（controlledWorkerEnabled=false）。
 */
export async function runControlledWorkerBatch(
  inputs: DryRunTrackingInput[],
  deps: ControlledWorkerDeps = {},
): Promise<ControlledWorkerSummary> {
  const maxBatchSize = deps.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  if (inputs.length > maxBatchSize) {
    throw new Error(
      `BATCH_SIZE_EXCEEDED: got ${inputs.length} jobs, max ${maxBatchSize}. 請分批執行。`,
    );
  }

  const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
  const sleep = deps.sleep ?? defaultSleep;
  const threshold =
    deps.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
  const adapters = { ...deps.adapters };

  const jobs: ControlledWorkerJobResult[] = [];
  // per-provider 連續 non-retryable 失敗計數與熔斷狀態
  const consecutiveNonRetryable = new Map<string, number>();
  const circuitOpen = new Set<string>();
  let rateLimitApplied = false;
  let executedExternalCall = false;

  for (const input of inputs) {
    const provider = String(input.provider ?? "").trim();
    const trackingCode = String(input.trackingCode ?? "").trim();
    const base: ControlledWorkerJobResult = {
      provider,
      trackingCode,
      trackingId: input.trackingId,
      orderId: input.orderId,
      storeId: input.storeId,
      ok: false,
      skipped: false,
      adapterOk: false,
      wouldWriteEvents: 0,
      wouldUpdateSnapshot: false,
      latestStatus: null,
      latestStatusText: null,
      latestEventAt: null,
      idempotencyKeysPreview: [],
      validationWarnings: [],
    };

    // circuit breaker：該 provider 已熔斷 → 跳過剩餘 jobs
    if (circuitOpen.has(provider)) {
      jobs.push({
        ...base,
        skipped: true,
        circuitBreakerSkipped: true,
        skippedReason: `CIRCUIT_BREAKER_OPEN: ${provider} 連續 non-retryable 失敗達 ${threshold} 次`,
      });
      continue;
    }

    // gate：沿用 dry-run gate，外加 controlledWorkerEnabled 檢查
    const gate = (DRY_RUN_PROVIDER_GATE as Record<string, DryRunProviderGate>)[
      provider
    ];
    if (!gate) {
      jobs.push({
        ...base,
        skipped: true,
        skippedReason: `UNSUPPORTED_PROVIDER: ${provider || "(empty)"}`,
      });
      continue;
    }
    if (!gate.controlledWorkerEnabled) {
      jobs.push({
        ...base,
        skipped: true,
        skippedReason:
          provider === "711"
            ? "CONTROLLED_WORKER_DISABLED: 7-11 半自動（OCR/captcha），維持 gate-only / 人工 fallback"
            : "CONTROLLED_WORKER_DISABLED",
      });
      continue;
    }
    if (provider === "familymart") {
      jobs.push({
        ...base,
        skipped: true,
        skippedReason:
          "USE_EXISTING_WORKER: familymart 由正式 familyMartTrackingWorker 負責，本 executor 不重跑",
      });
      continue;
    }
    if (!trackingCode) {
      jobs.push({
        ...base,
        skipped: true,
        skippedReason: "EMPTY_TRACKING_CODE",
      });
      continue;
    }

    const adapterFn =
      adapters[provider as DryRunProvider] ??
      DEFAULT_ADAPTERS[provider as DryRunProvider];
    if (!adapterFn) {
      jobs.push({
        ...base,
        skipped: true,
        skippedReason: `NO_ADAPTER: ${provider}`,
      });
      continue;
    }

    // rate limit：第二個實際外部呼叫起，job 間 delay
    if (executedExternalCall && delayMs > 0) {
      await sleep(delayMs);
      rateLimitApplied = true;
    }
    executedExternalCall = true;

    let adapterResult: TrackingAdapterResult<string>;
    try {
      adapterResult = await adapterFn({
        trackingCode,
        timeoutMs: deps.timeoutMs,
      });
    } catch (err) {
      adapterResult = {
        ok: false,
        provider,
        trackingCode,
        errorCode: "UNKNOWN_ERROR",
        message:
          err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        retryable: true,
      };
    }

    if (!adapterResult.ok) {
      // circuit breaker 計數：只算 non-retryable（REMOTE_CHANGED / HTML_PARSE_FAILED / VERIFY_FAILED 等）；
      // retryable（NETWORK_FAILED / TIMEOUT）不熔斷、且中斷連續計數
      if (!adapterResult.retryable) {
        const n = (consecutiveNonRetryable.get(provider) ?? 0) + 1;
        consecutiveNonRetryable.set(provider, n);
        if (n >= threshold) circuitOpen.add(provider);
      } else {
        consecutiveNonRetryable.set(provider, 0);
      }
      jobs.push({
        ...base,
        errorCode: adapterResult.errorCode,
        errorMessage: adapterResult.message,
        retryable: adapterResult.retryable,
      });
      continue;
    }

    consecutiveNonRetryable.set(provider, 0);
    const warnings = validateAdapterSuccess(adapterResult);
    const keys = adapterResult.events.map((e) =>
      buildDryRunIdempotencyKey(provider, trackingCode, e),
    );

    jobs.push({
      ...base,
      ok: true,
      adapterOk: true,
      wouldWriteEvents: adapterResult.events.length,
      wouldUpdateSnapshot: true,
      latestStatus: adapterResult.normalizedStatus,
      latestStatusText: adapterResult.latestStatusText,
      latestEventAt: adapterResult.latestEventAt,
      idempotencyKeysPreview: keys,
      validationWarnings: warnings,
    });
  }

  const providerSummary: Record<string, ControlledWorkerProviderSummary> = {};
  for (const j of jobs) {
    const p = (providerSummary[j.provider] ??= {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      circuitBreakerTriggered: false,
    });
    p.total++;
    if (j.ok) p.success++;
    else if (j.skipped) p.skipped++;
    else p.failed++;
  }
  for (const p of circuitOpen) {
    if (providerSummary[p]) providerSummary[p].circuitBreakerTriggered = true;
  }

  const successCount = jobs.filter((j) => j.ok).length;
  const skippedCount = jobs.filter((j) => j.skipped).length;

  return {
    dryRun: true,
    noWrite: true,
    totalJobs: jobs.length,
    successCount,
    failedCount: jobs.length - successCount - skippedCount,
    skippedCount,
    providerSummary,
    jobs,
    rateLimitApplied,
    appliedDelayMs: rateLimitApplied ? delayMs : 0,
  };
}
