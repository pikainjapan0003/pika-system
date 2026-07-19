/**
 * 全家貨態巡查 worker（Step 7F）— 手動執行，不含排程。
 *
 * 流程：撈 active familymart shipment_trackings → queryFamilyMartTracking →
 * 更新 shipment_trackings 快照欄位 → 寫 shipment_tracking_events（idempotency_key 防重）→
 * 失敗時寫 shipment_tracking_exceptions → 整輪寫 shipment_tracking_run_logs。
 *
 * 個資規則：check_error / exception.message / run_log.error_summary 只存 errorCode 與
 * 錯誤摘要，不存姓名 / 電話 / 地址 / raw response。
 */

import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingEventsTable,
  shipmentTrackingExceptionsTable,
  shipmentTrackingRunLogsTable,
} from "@workspace/db";
import { queryFamilyMartTracking } from "../adapters/familyMartAdapter.ts";
import type { FamilyMartTrackingResult } from "../adapters/familyMartAdapter.ts";
import type { NormalizedTrackingStatus } from "../adapters/types.ts";

const PROVIDER = "familymart" as const;
/** 巡查間隔：成功且尚未終態 → 6 小時後再查 */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** retryable 失敗 backoff：min(6h, 30min * failureCount) */
const RETRY_BASE_MS = 30 * 60 * 1000;

export interface FamilyMartWorkerInput {
  storeId?: number;
  limit?: number;
  now?: Date;
  dryRun?: boolean;
  trackingIds?: number[];
  timeoutMs?: number;
  runType?: "scheduled_worker" | "manual_worker";
  createdBy?: string;
}

export interface FamilyMartWorkerJobResult {
  shipmentTrackingId: number;
  trackingCode: string;
  status: "success" | "failed" | "skipped";
  normalizedStatus?: NormalizedTrackingStatus;
  latestStatusText?: string;
  errorCode?: string;
  insertedEventCount?: number;
  dryRun?: boolean;
}

export interface FamilyMartWorkerResult {
  ok: true;
  provider: typeof PROVIDER;
  runLogId: number | null;
  dryRun: boolean;
  totalJobs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  results: FamilyMartWorkerJobResult[];
}

export interface FamilyMartWorkerDeps {
  /** 測試用：mock adapter，預設 live queryFamilyMartTracking */
  queryTracking?: (input: {
    trackingCode: string;
    timeoutMs?: number;
  }) => Promise<FamilyMartTrackingResult>;
}

/** 全家事件時間為台灣時區字串（YYYY/MM/DD HH:mm），轉 +08:00 Date；parse 失敗回 null。 */
export function parseFamiEventDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const d = new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}+08:00`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** adapter normalizedStatus → shipment_trackings.tracking_status（查詢任務狀態，非貨態） */
export function toTrackingStatus(normalized: NormalizedTrackingStatus): string {
  if (normalized === "pending") return "pending";
  if (normalized === "delivered") return "delivered";
  if (normalized === "exception") return "failed";
  // in_transit / arrived_store / picked_up / returned / unknown → 查詢任務持續或停止由 nextCheckAt 控制
  return "active";
}

/** 終態貨態（picked_up / delivered / returned）→ 停止巡查（next_check_at = null） */
function isTerminalStatus(normalized: NormalizedTrackingStatus): boolean {
  return (
    normalized === "picked_up" ||
    normalized === "delivered" ||
    normalized === "returned"
  );
}

export function buildEventIdempotencyKey(
  trackingCode: string,
  occurredAtRaw: string | null,
  description: string,
): string {
  return `familymart:${trackingCode}:${occurredAtRaw ?? "no-date"}:${description}`;
}

export async function runFamilyMartTrackingWorker(
  input: FamilyMartWorkerInput = {},
  deps: FamilyMartWorkerDeps = {},
): Promise<FamilyMartWorkerResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 20;
  const dryRun = input.dryRun ?? false;
  const queryTracking = deps.queryTracking ?? queryFamilyMartTracking;

  // 1. 撈待查 trackings（join orders 取 storeId 供 exception 用）
  const conditions = [
    eq(shipmentTrackingsTable.trackingProvider, PROVIDER),
    eq(shipmentTrackingsTable.isActive, true),
    inArray(shipmentTrackingsTable.trackingStatus, [
      "pending",
      "checking",
      "active",
      "failed",
    ]),
  ];
  if (input.trackingIds?.length) {
    conditions.push(inArray(shipmentTrackingsTable.id, input.trackingIds));
  } else {
    // 指定 trackingIds 時略過 nextCheckAt gate，方便手動重查
    conditions.push(
      or(
        isNull(shipmentTrackingsTable.nextCheckAt),
        lte(shipmentTrackingsTable.nextCheckAt, now),
      )!,
    );
  }
  if (input.storeId !== undefined)
    conditions.push(eq(ordersTable.storeId, input.storeId));

  const jobs = await db
    .select({
      id: shipmentTrackingsTable.id,
      trackingCode: shipmentTrackingsTable.trackingCode,
      trackingStatus: shipmentTrackingsTable.trackingStatus,
      failureCount: shipmentTrackingsTable.failureCount,
      orderId: shipmentTrackingsTable.orderId,
      storeId: ordersTable.storeId,
    })
    .from(shipmentTrackingsTable)
    .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
    .where(and(...conditions))
    .orderBy(shipmentTrackingsTable.id)
    .limit(limit);

  // 2. run log（dryRun 不寫）
  let runLogId: number | null = null;
  if (!dryRun) {
    const [runLog] = await db
      .insert(shipmentTrackingRunLogsTable)
      .values({
        storeId: input.storeId ?? null,
        runType: input.runType ?? "manual_worker",
        provider: PROVIDER,
        startedAt: now,
        status: "running",
        totalJobs: jobs.length,
        createdBy: input.createdBy ?? "manual-script",
      })
      .returning({ id: shipmentTrackingRunLogsTable.id });
    runLogId = runLog.id;
  }

  const results: FamilyMartWorkerJobResult[] = [];
  const errorCodeCounts = new Map<string, number>();

  for (const job of jobs) {
    const trackingCode = job.trackingCode.trim();
    if (!trackingCode) {
      results.push({
        shipmentTrackingId: job.id,
        trackingCode,
        status: "skipped",
        errorCode: "EMPTY_TRACKING_CODE",
      });
      continue;
    }

    let adapterResult: FamilyMartTrackingResult;
    try {
      adapterResult = await queryTracking({
        trackingCode,
        timeoutMs: input.timeoutMs,
      });
    } catch (err) {
      // adapter 設計上不 throw；萬一 throw 仍轉成標準失敗，不讓整輪中斷
      adapterResult = {
        ok: false,
        provider: PROVIDER,
        trackingCode,
        errorCode: "UNKNOWN_ERROR",
        message:
          err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        retryable: true,
      };
    }

    if (adapterResult.ok) {
      const normalized = adapterResult.normalizedStatus;
      const latestEventAt = parseFamiEventDate(adapterResult.latestEventAt);
      let insertedEventCount = 0;

      if (!dryRun) {
        await db
          .update(shipmentTrackingsTable)
          .set({
            trackingStatus: toTrackingStatus(normalized),
            latestEventStatus: normalized,
            latestEventDescription: adapterResult.latestStatusText,
            latestEventAt,
            lastCheckedAt: now,
            nextCheckAt: isTerminalStatus(normalized)
              ? null
              : new Date(now.getTime() + RECHECK_INTERVAL_MS),
            failureCount: 0,
            checkError: null,
          })
          .where(eq(shipmentTrackingsTable.id, job.id));

        // events：occurred_at NOT NULL，日期 parse 不出的事件跳過不寫（極少數，回報於 rawSummary）
        const insertable = adapterResult.events
          .map((e) => ({
            event: e,
            occurredAt: parseFamiEventDate(e.occurredAt),
          }))
          .filter(
            (x): x is { event: typeof x.event; occurredAt: Date } =>
              x.occurredAt !== null,
          );
        if (insertable.length > 0) {
          const inserted = await db
            .insert(shipmentTrackingEventsTable)
            .values(
              insertable.map(({ event, occurredAt }) => ({
                shipmentTrackingId: job.id,
                eventStatus: event.eventStatus,
                eventDescription: event.eventDescription,
                eventLocation: event.eventLocation,
                occurredAt,
                rawData: event.rawData,
                idempotencyKey: buildEventIdempotencyKey(
                  trackingCode,
                  event.occurredAt,
                  event.eventDescription,
                ),
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

      results.push({
        shipmentTrackingId: job.id,
        trackingCode,
        status: "success",
        normalizedStatus: normalized,
        latestStatusText: adapterResult.latestStatusText,
        insertedEventCount,
        dryRun: dryRun || undefined,
      });
    } else {
      const { errorCode, message, retryable } = adapterResult;
      errorCodeCounts.set(errorCode, (errorCodeCounts.get(errorCode) ?? 0) + 1);
      const newFailureCount = job.failureCount + 1;

      if (!dryRun) {
        await db
          .update(shipmentTrackingsTable)
          .set({
            // retryable（網路 / timeout / 5xx）保留原狀態，避免一次網路錯誤就顯示失敗
            ...(retryable ? {} : { trackingStatus: "failed" }),
            lastCheckedAt: now,
            failureCount: newFailureCount,
            checkError: `${errorCode}: ${message}`.slice(0, 300),
            nextCheckAt: retryable
              ? new Date(
                  now.getTime() +
                    Math.min(
                      RECHECK_INTERVAL_MS,
                      RETRY_BASE_MS * newFailureCount,
                    ),
                )
              : null,
          })
          .where(eq(shipmentTrackingsTable.id, job.id));

        await db.insert(shipmentTrackingExceptionsTable).values({
          storeId: job.storeId,
          orderId: job.orderId,
          shipmentTrackingId: job.id,
          provider: PROVIDER,
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
      }

      results.push({
        shipmentTrackingId: job.id,
        trackingCode,
        status: "failed",
        errorCode,
        dryRun: dryRun || undefined,
      });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const runStatus =
    failedCount === 0 ? "success" : successCount > 0 ? "partial" : "failed";

  if (!dryRun && runLogId !== null) {
    const errorSummary =
      errorCodeCounts.size > 0
        ? [...errorCodeCounts.entries()]
            .map(([code, count]) => `${code}x${count}`)
            .join(", ")
        : null;
    await db
      .update(shipmentTrackingRunLogsTable)
      .set({
        finishedAt: new Date(),
        status: runStatus,
        totalJobs: jobs.length,
        successCount,
        failedCount,
        skippedCount,
        errorSummary,
      })
      .where(eq(shipmentTrackingRunLogsTable.id, runLogId));
  }

  return {
    ok: true,
    provider: PROVIDER,
    runLogId,
    dryRun,
    totalJobs: jobs.length,
    successCount,
    failedCount,
    skippedCount,
    results,
  };
}
