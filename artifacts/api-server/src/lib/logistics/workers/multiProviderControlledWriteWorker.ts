/**
 * Multi-provider controlled DB write worker（Step 7N-D）。
 *
 * 定位：第一個 postoffice / tcat 的 DB write 路徑，極度保守：
 * - 只處理明確指定的 trackingId（explicit list），不掃 active trackings、無排程。
 * - 只允許 provider postoffice / tcat；711 / familymart 一律 skipped
 *   （711 controlled write disabled；familymart 由正式 familyMartTrackingWorker 負責）。
 * - batch size 上限 5，超過直接拒絕。
 * - 每筆 job 先比對 DB row 的 trackingProvider / trackingCode 與輸入一致才執行（防呆）。
 * - 只寫 shipment_tracking_events / shipment_trackings 快照與查詢控制欄位 /
 *   shipment_tracking_exceptions（失敗）/ shipment_tracking_run_logs；
 *   不碰 orders / trackingCode / trackingProvider / sourceType。
 * - writeMode="dryRun" 時不寫任何表、不寫 run log。
 *
 * DB write pattern 沿用 familyMartTrackingWorker（idempotencyKey + onConflictDoNothing、
 * 快照更新、retryable backoff、exception、run log）。
 * 個資規則沿用：checkError / exception.message / errorSummary 只存 errorCode 與摘要。
 */

import { eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingEventsTable,
  shipmentTrackingExceptionsTable,
  shipmentTrackingRunLogsTable,
} from "@workspace/db";
import { queryPostOfficeTracking } from "../adapters/postOfficeAdapter.ts";
import { queryTcatTracking } from "../adapters/tcatAdapter.ts";
import type { NormalizedTrackingStatus, TrackingAdapterResult } from "../adapters/types.ts";
import { toTrackingStatus } from "./familyMartTrackingWorker.ts";
import { buildDryRunIdempotencyKey } from "./multiProviderDryRunWorker.ts";

export type ControlledWriteProvider = "postoffice" | "tcat";

const ALLOWED_PROVIDERS: ControlledWriteProvider[] = ["postoffice", "tcat"];
const MAX_BATCH_SIZE = 5;
/** 沿用 familyMart worker：成功未終態 6h 後重查；retryable backoff min(6h, 30min * failureCount) */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_BASE_MS = 30 * 60 * 1000;

export interface ControlledWriteInput {
  provider: ControlledWriteProvider | string;
  trackingId: number;
  trackingCode: string;
  orderId?: number | string;
  storeId?: number | string;
  writeMode: "dryRun" | "write";
}

export interface ControlledWriteJobResult {
  provider: string;
  trackingId: number;
  trackingCode: string;
  writeMode: "dryRun" | "write";
  status: "success" | "failed" | "skipped" | "empty";
  skippedReason?: string;
  normalizedStatus?: NormalizedTrackingStatus;
  latestStatusText?: string | null;
  latestEventAt?: string | null;
  /** dryRun：預計寫入數；write：實際 insert 數（去重後） */
  wouldWriteEvents?: number;
  insertedEventCount?: number;
  snapshotUpdated?: boolean;
  idempotencyKeysPreview?: string[];
  unparseableEventCount?: number;
  errorCode?: string;
  retryable?: boolean;
  exceptionWritten?: boolean;
}

export interface ControlledWriteSummary {
  ok: true;
  controlled: true;
  runLogId: number | null;
  totalJobs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  emptyCount: number;
  errorSummary: string | null;
  jobs: ControlledWriteJobResult[];
}

type AdapterFn = (input: {
  trackingCode: string;
  timeoutMs?: number;
}) => Promise<TrackingAdapterResult<string>>;

export interface ControlledWriteDeps {
  /** 測試用 adapter override（failure path mock）；預設 live adapter */
  adapters?: Partial<Record<ControlledWriteProvider, AdapterFn>>;
  timeoutMs?: number;
  now?: Date;
  /** job 間 delay（外部禮貌頻率）；測試可注入 fake sleep */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  createdBy?: string;
}

/** postoffice 事件時間（台灣時區 YYYY/MM/DD HH:mm:ss）→ +08:00 Date；parse 失敗回 null */
export function parsePostOfficeEventDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** tcat 事件時間（台灣時區 YYYY/MM/DD HH:mm）→ +08:00 Date；parse 失敗回 null */
export function parseTcatEventDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const EVENT_DATE_PARSERS: Record<ControlledWriteProvider, (raw: string | null) => Date | null> = {
  postoffice: parsePostOfficeEventDate,
  tcat: parseTcatEventDate,
};

const DEFAULT_ADAPTERS: Record<ControlledWriteProvider, AdapterFn> = {
  postoffice: (input) => queryPostOfficeTracking(input),
  tcat: (input) => queryTcatTracking(input),
};

/** 查無資料類錯誤：不寫 events / 不覆蓋快照 / 不寫 exception，只更新 lastCheckedAt + 正常重查 */
const EMPTY_ERROR_CODES = new Set(["EMPTY_LIST", "NO_RESULT"]);

function isTerminalStatus(normalized: NormalizedTrackingStatus): boolean {
  return normalized === "picked_up" || normalized === "delivered" || normalized === "returned";
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runControlledDbWrite(
  inputs: ControlledWriteInput[],
  deps: ControlledWriteDeps = {},
): Promise<ControlledWriteSummary> {
  if (inputs.length > MAX_BATCH_SIZE) {
    throw new Error(`BATCH_SIZE_EXCEEDED: got ${inputs.length} jobs, max ${MAX_BATCH_SIZE}`);
  }
  const now = deps.now ?? new Date();
  const adapters = { ...DEFAULT_ADAPTERS, ...deps.adapters };
  const delayMs = deps.delayMs ?? 500;
  const sleep = deps.sleep ?? defaultSleep;

  // 1. 只撈明確指定的 trackingIds（不掃 active trackings）
  const ids = inputs.map((i) => Number(i.trackingId)).filter((n) => Number.isInteger(n) && n > 0);
  const rows = ids.length
    ? await db
        .select({
          id: shipmentTrackingsTable.id,
          orderId: shipmentTrackingsTable.orderId,
          trackingCode: shipmentTrackingsTable.trackingCode,
          trackingProvider: shipmentTrackingsTable.trackingProvider,
          failureCount: shipmentTrackingsTable.failureCount,
          // 只讀 orders 取 storeId（exception NOT NULL 需要），不寫 orders
          storeId: ordersTable.storeId,
        })
        .from(shipmentTrackingsTable)
        .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
        .where(inArray(shipmentTrackingsTable.id, ids))
    : [];
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const hasWriteJob = inputs.some((i) => i.writeMode === "write");

  // 2. run log（只有實寫時才寫；dryRun-only batch 不留 run log）
  let runLogId: number | null = null;
  if (hasWriteJob) {
    const providers = [...new Set(inputs.map((i) => i.provider))];
    const [runLog] = await db
      .insert(shipmentTrackingRunLogsTable)
      .values({
        storeId: null,
        runType: "manual_worker",
        provider: providers.length === 1 ? (providers[0] as string) : "all",
        startedAt: now,
        status: "running",
        totalJobs: inputs.length,
        createdBy: deps.createdBy ?? "step7n-d-controlled-test",
      })
      .returning({ id: shipmentTrackingRunLogsTable.id });
    runLogId = runLog.id;
  }

  const jobs: ControlledWriteJobResult[] = [];
  const errorCodeCounts = new Map<string, number>();
  let executedExternalCall = false;

  for (const input of inputs) {
    const provider = String(input.provider ?? "").trim();
    const trackingId = Number(input.trackingId);
    const trackingCode = String(input.trackingCode ?? "").trim();
    const writeMode = input.writeMode === "write" ? "write" : "dryRun";
    const base: ControlledWriteJobResult = { provider, trackingId, trackingCode, writeMode, status: "skipped" };

    // gate：只允許 postoffice / tcat
    if (!ALLOWED_PROVIDERS.includes(provider as ControlledWriteProvider)) {
      jobs.push({
        ...base,
        skippedReason:
          provider === "711"
            ? "CONTROLLED_WRITE_DISABLED: 7-11 半自動，DB write 本階段 disabled"
            : provider === "familymart"
              ? "USE_EXISTING_WORKER: familymart 由正式 worker 負責"
              : `UNSUPPORTED_PROVIDER: ${provider || "(empty)"}`,
      });
      continue;
    }

    // 安全比對：DB row 必須存在且 provider / trackingCode 與輸入一致
    const row = rowById.get(trackingId);
    if (!row) {
      jobs.push({ ...base, skippedReason: `TRACKING_NOT_FOUND: id=${trackingId}` });
      continue;
    }
    if (row.trackingProvider !== provider || row.trackingCode !== trackingCode) {
      jobs.push({
        ...base,
        skippedReason: `SAFETY_MISMATCH: DB row provider/code 與輸入不一致（db=${row.trackingProvider}）`,
      });
      continue;
    }

    // 外部禮貌頻率：第二次外部呼叫起 job 間 delay
    if (executedExternalCall && delayMs > 0) await sleep(delayMs);
    executedExternalCall = true;

    let adapterResult: TrackingAdapterResult<string>;
    try {
      adapterResult = await adapters[provider as ControlledWriteProvider]({
        trackingCode,
        timeoutMs: deps.timeoutMs,
      });
    } catch (err) {
      adapterResult = {
        ok: false,
        provider,
        trackingCode,
        errorCode: "UNKNOWN_ERROR",
        message: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        retryable: true,
      };
    }

    if (adapterResult.ok) {
      const normalized = adapterResult.normalizedStatus;
      const parseDate = EVENT_DATE_PARSERS[provider as ControlledWriteProvider];
      const latestEventAt = parseDate(adapterResult.latestEventAt);
      const insertable = adapterResult.events
        .map((e) => ({ event: e, occurredAt: parseDate(e.occurredAt) }))
        .filter((x): x is { event: (typeof adapterResult.events)[number]; occurredAt: Date } => x.occurredAt !== null);
      const keys = insertable.map(({ event }) =>
        buildDryRunIdempotencyKey(provider, trackingCode, event),
      );

      let insertedEventCount = 0;
      let snapshotUpdated = false;

      if (writeMode === "write") {
        await db
          .update(shipmentTrackingsTable)
          .set({
            trackingStatus: toTrackingStatus(normalized),
            latestEventStatus: normalized,
            latestEventDescription: adapterResult.latestStatusText,
            latestEventAt,
            lastCheckedAt: now,
            nextCheckAt: isTerminalStatus(normalized) ? null : new Date(now.getTime() + RECHECK_INTERVAL_MS),
            failureCount: 0,
            checkError: null,
          })
          .where(eq(shipmentTrackingsTable.id, trackingId));
        snapshotUpdated = true;

        if (insertable.length > 0) {
          const inserted = await db
            .insert(shipmentTrackingEventsTable)
            .values(
              insertable.map(({ event, occurredAt }) => ({
                shipmentTrackingId: trackingId,
                eventStatus: event.eventStatus,
                eventDescription: event.eventDescription,
                eventLocation: event.eventLocation,
                occurredAt,
                rawData: event.rawData,
                idempotencyKey: buildDryRunIdempotencyKey(provider, trackingCode, event),
              })),
            )
            .onConflictDoNothing({
              target: [
                shipmentTrackingEventsTable.shipmentTrackingId,
                shipmentTrackingEventsTable.idempotencyKey,
              ],
            })
            .returning({ id: shipmentTrackingEventsTable.id });
          insertedEventCount = inserted.length;
        }
      }

      jobs.push({
        ...base,
        status: "success",
        normalizedStatus: normalized,
        latestStatusText: adapterResult.latestStatusText,
        latestEventAt: adapterResult.latestEventAt,
        wouldWriteEvents: insertable.length,
        insertedEventCount: writeMode === "write" ? insertedEventCount : undefined,
        snapshotUpdated,
        idempotencyKeysPreview: keys,
        unparseableEventCount: adapterResult.events.length - insertable.length,
      });
      continue;
    }

    // 失敗路徑
    const { errorCode, message, retryable } = adapterResult;

    // EMPTY_LIST / NO_RESULT：查無資料，不寫 events / 不覆蓋快照 / 不寫 exception
    if (EMPTY_ERROR_CODES.has(errorCode)) {
      if (writeMode === "write") {
        await db
          .update(shipmentTrackingsTable)
          .set({
            lastCheckedAt: now,
            nextCheckAt: new Date(now.getTime() + RECHECK_INTERVAL_MS),
          })
          .where(eq(shipmentTrackingsTable.id, trackingId));
      }
      jobs.push({ ...base, status: "empty", errorCode, retryable });
      continue;
    }

    errorCodeCounts.set(errorCode, (errorCodeCounts.get(errorCode) ?? 0) + 1);
    const newFailureCount = row.failureCount + 1;
    let exceptionWritten = false;

    if (writeMode === "write") {
      await db
        .update(shipmentTrackingsTable)
        .set({
          ...(retryable ? {} : { trackingStatus: "failed" }),
          lastCheckedAt: now,
          failureCount: newFailureCount,
          checkError: `${errorCode}: ${message}`.slice(0, 300),
          nextCheckAt: retryable
            ? new Date(now.getTime() + Math.min(RECHECK_INTERVAL_MS, RETRY_BASE_MS * newFailureCount))
            : null,
        })
        .where(eq(shipmentTrackingsTable.id, trackingId));

      await db.insert(shipmentTrackingExceptionsTable).values({
        storeId: row.storeId,
        orderId: row.orderId,
        shipmentTrackingId: trackingId,
        provider,
        trackingCode,
        sourceType: "worker",
        errorCode,
        message: message.slice(0, 300),
        status: "open",
        severity: retryable ? "warning" : "error",
        retryable,
        failureCount: newFailureCount,
        lastOccurredAt: now,
      });
      exceptionWritten = true;
    }

    jobs.push({ ...base, status: "failed", errorCode, retryable, exceptionWritten });
  }

  const successCount = jobs.filter((j) => j.status === "success").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;
  const skippedCount = jobs.filter((j) => j.status === "skipped").length;
  const emptyCount = jobs.filter((j) => j.status === "empty").length;
  const errorSummary =
    errorCodeCounts.size > 0
      ? [...errorCodeCounts.entries()].map(([c, n]) => `${c}x${n}`).join(", ")
      : null;
  const runStatus = failedCount === 0 ? "success" : successCount > 0 ? "partial" : "failed";

  if (runLogId !== null) {
    await db
      .update(shipmentTrackingRunLogsTable)
      .set({
        finishedAt: new Date(),
        status: runStatus,
        totalJobs: jobs.length,
        successCount,
        failedCount,
        // run log 表無 empty 欄位：empty（查無資料）併入 skipped 計數
        skippedCount: skippedCount + emptyCount,
        errorSummary,
      })
      .where(eq(shipmentTrackingRunLogsTable.id, runLogId));
  }

  return {
    ok: true,
    controlled: true,
    runLogId,
    totalJobs: jobs.length,
    successCount,
    failedCount,
    skippedCount,
    emptyCount,
    errorSummary,
    jobs,
  };
}
