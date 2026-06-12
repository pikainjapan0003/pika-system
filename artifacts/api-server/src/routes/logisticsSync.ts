import { Router } from "express";
import { desc, eq, inArray, and, isNull, or } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingRunLogsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";
import { runFamilyMartTrackingWorker } from "../lib/logistics/workers/familyMartTrackingWorker.ts";
import { runControlledDbWrite } from "../lib/logistics/workers/multiProviderControlledWriteWorker.ts";
import {
  getSupportedAutoSyncProviders,
  getUnsupportedAutoSyncProviders,
} from "../lib/logistics/providers.ts";

const fail = (res: any, status: number, errorCode: string, message: string) =>
  res.status(status).json({ ok: false, errorCode, message });

/**
 * Step 7F：物流同步（最小閉環）。
 * 目前只有全家 adapter / worker，故僅支援 familymart；其餘 provider 誠實列為尚未支援。
 * autoSyncEnabled 由 AUTO_SYNC_ENABLED env 控制（排程啟用 SOP：先建排程驗證成功再開此 flag）；
 * 排程設定存在 Replit 平台，app 無可靠來源，故不回傳下次同步時間。
 */
const SUPPORTED_PROVIDERS = getSupportedAutoSyncProviders();
const UNSUPPORTED_PROVIDERS = getUnsupportedAutoSyncProviders();
/** 同步狀態卡只看 worker 跑的紀錄，不混入 import_confirm 等批次紀錄 */
const SYNC_RUN_TYPES = ["scheduled_worker", "manual_worker", "exception_retry"];

const router = Router();

/** 整批手動同步：重用既有 worker，storeId scope，不動訂單狀態。 */
router.post("/stores/:storeId/logistics/sync", requireAuth, async (req: any, res: any) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return fail(res, 400, "INVALID_STORE", "Invalid storeId");
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  try {
    const result = await runFamilyMartTrackingWorker({
      storeId,
      runType: "manual_worker",
      createdBy: req.userId ?? "owner-ui",
    });

    const eventCount = result.results.reduce((sum, r) => sum + (r.insertedEventCount ?? 0), 0);
    return res.json({
      ok: true,
      status: "completed",
      runId: result.runLogId,
      provider: result.provider,
      scannedCount: result.totalJobs,
      updatedCount: result.successCount,
      eventCount,
      exceptionCount: result.failedCount,
      skippedCount: result.skippedCount,
      message:
        result.totalJobs === 0
          ? "目前沒有待同步的全家物流單。"
          : `已同步全家物流：成功 ${result.successCount} 筆、失敗 ${result.failedCount} 筆、略過 ${result.skippedCount} 筆。`,
    });
  } catch (err) {
    console.error("[logistics-sync] manual sync failed:", err);
    return fail(res, 500, "SYNC_FAILED", "物流同步執行失敗，請稍後再試。");
  }
});

/**
 * 郵局 / 黑貓手動查詢（Step 7N-I）：explicit trackingIds only、一次最多 5 筆、
 * 預設 dryRun=true（不寫 DB）。不影響全家既有 manual / scheduled sync，
 * 不開排程、不改 supportsAutoSync。711 / familymart 一律拒絕。
 */
const MANUAL_PROVIDER_WHITELIST = ["postoffice", "tcat"] as const;
const MANUAL_PROVIDER_MAX_TRACKING_IDS = 5;

router.post(
  "/stores/:storeId/logistics/sync/manual-provider",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId)) return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const body = req.body ?? {};
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";

    if (!provider) {
      return fail(res, 400, "PROVIDER_REQUIRED", "provider is required");
    }
    if (!MANUAL_PROVIDER_WHITELIST.includes(provider as any)) {
      const message =
        provider === "familymart"
          ? "全家請使用既有的整批手動同步。"
          : provider === "711"
            ? "7-11 目前不支援手動查詢（半自動，需人工處理）。"
            : `provider must be one of: ${MANUAL_PROVIDER_WHITELIST.join(", ")}`;
      return fail(res, 400, "PROVIDER_NOT_ALLOWED", message);
    }

    const rawIds = body.trackingIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return fail(res, 400, "TRACKING_IDS_REQUIRED", "trackingIds must be a non-empty array");
    }
    if (rawIds.length > MANUAL_PROVIDER_MAX_TRACKING_IDS) {
      return fail(
        res,
        400,
        "TOO_MANY_TRACKING_IDS",
        `一次最多查詢 ${MANUAL_PROVIDER_MAX_TRACKING_IDS} 筆。`,
      );
    }
    const trackingIds = rawIds.map((v: unknown) => Number(v));
    if (trackingIds.some((n: number) => !Number.isInteger(n) || n <= 0)) {
      return fail(res, 400, "INVALID_TRACKING_IDS", "trackingIds must be positive integers");
    }

    // 預設 dryRun=true：只有明確傳 dryRun === false 才實寫
    const writeMode = body.dryRun === false ? "write" : "dryRun";

    try {
      // store scope + provider 比對（worker 的 SAFETY_MISMATCH 為第二道防線）
      const rows = await db
        .select({
          id: shipmentTrackingsTable.id,
          trackingCode: shipmentTrackingsTable.trackingCode,
          trackingProvider: shipmentTrackingsTable.trackingProvider,
          storeId: ordersTable.storeId,
        })
        .from(shipmentTrackingsTable)
        .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
        .where(inArray(shipmentTrackingsTable.id, trackingIds));

      const rowById = new Map(rows.map((r) => [r.id, r]));
      const missing = trackingIds.filter((id: number) => !rowById.has(id));
      if (missing.length > 0) {
        return fail(res, 400, "TRACKING_NOT_FOUND", `找不到物流追蹤紀錄：${missing.join(", ")}`);
      }
      // 跨店一律整批拒絕，不可只 skip（避免誤用）
      if (rows.some((r) => r.storeId !== storeId)) {
        return fail(res, 400, "CROSS_STORE_TRACKING", "trackingIds 包含不屬於此店家的紀錄。");
      }
      if (rows.some((r) => r.trackingProvider !== provider)) {
        return fail(
          res,
          400,
          "PROVIDER_MISMATCH",
          "trackingIds 包含與 provider 不符的紀錄。",
        );
      }

      const result = await runControlledDbWrite(
        trackingIds.map((id: number) => ({
          provider,
          trackingId: id,
          trackingCode: rowById.get(id)!.trackingCode,
          writeMode,
        })),
        { storeId, createdBy: req.userId ?? "owner-ui" },
      );

      return res.json({
        ok: true,
        dryRun: writeMode === "dryRun",
        provider,
        runId: result.runLogId,
        totalJobs: result.totalJobs,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        emptyCount: result.emptyCount,
        jobs: result.jobs.map((j) => ({
          trackingId: j.trackingId,
          trackingCode: j.trackingCode,
          status: j.status,
          latestStatusText: j.latestStatusText ?? null,
          latestEventAt: j.latestEventAt ?? null,
          wouldWriteEvents: j.wouldWriteEvents ?? 0,
          insertedEventCount: j.insertedEventCount,
          errorCode: j.errorCode,
          skippedReason: j.skippedReason,
        })),
        message:
          writeMode === "dryRun"
            ? "測試模式：本次僅預覽查詢結果，未寫入任何資料。"
            : `手動查詢完成：成功 ${result.successCount} 筆、失敗 ${result.failedCount} 筆、查無 ${result.emptyCount} 筆。`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("BATCH_SIZE_EXCEEDED")) {
        return fail(res, 400, "TOO_MANY_TRACKING_IDS", "一次最多查詢 5 筆。");
      }
      console.error("[logistics-sync] manual-provider sync failed:", err);
      return fail(res, 500, "MANUAL_PROVIDER_SYNC_FAILED", "手動查詢執行失敗，請稍後再試。");
    }
  },
);

/** 同步狀態：給前端動態狀態卡。lastRun / recentRuns 讀 shipment_tracking_run_logs。 */
router.get("/stores/:storeId/logistics/sync/status", requireAuth, async (req: any, res: any) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return fail(res, 400, "INVALID_STORE", "Invalid storeId");
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  try {
    const runs = await db
      .select({
        id: shipmentTrackingRunLogsTable.id,
        provider: shipmentTrackingRunLogsTable.provider,
        runType: shipmentTrackingRunLogsTable.runType,
        status: shipmentTrackingRunLogsTable.status,
        startedAt: shipmentTrackingRunLogsTable.startedAt,
        finishedAt: shipmentTrackingRunLogsTable.finishedAt,
        totalJobs: shipmentTrackingRunLogsTable.totalJobs,
        successCount: shipmentTrackingRunLogsTable.successCount,
        failedCount: shipmentTrackingRunLogsTable.failedCount,
        skippedCount: shipmentTrackingRunLogsTable.skippedCount,
      })
      .from(shipmentTrackingRunLogsTable)
      .where(
        and(
          inArray(shipmentTrackingRunLogsTable.runType, SYNC_RUN_TYPES),
          // 排程是全店域掃描（storeId=null），各店狀態卡都應看得到；
          // 全域紀錄僅限 scheduled_worker，避免 storeId=null 的手動/重試紀錄混入
          or(
            eq(shipmentTrackingRunLogsTable.storeId, storeId),
            and(
              isNull(shipmentTrackingRunLogsTable.storeId),
              eq(shipmentTrackingRunLogsTable.runType, "scheduled_worker"),
            ),
          ),
        ),
      )
      .orderBy(desc(shipmentTrackingRunLogsTable.startedAt))
      .limit(5);

    const toRunPayload = (r: (typeof runs)[number]) => ({
      id: r.id,
      provider: r.provider,
      runType: r.runType,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      scannedCount: r.totalJobs,
      updatedCount: r.successCount,
      exceptionCount: r.failedCount,
      skippedCount: r.skippedCount,
    });

    const autoSyncEnabled = process.env.AUTO_SYNC_ENABLED === "true";
    return res.json({
      ok: true,
      autoSyncEnabled,
      manualSyncEnabled: true,
      supportedProviders: SUPPORTED_PROVIDERS,
      unsupportedProviders: UNSUPPORTED_PROVIDERS,
      lastRun: runs.length > 0 ? toRunPayload(runs[0]) : null,
      recentRuns: runs.map(toRunPayload),
      message: autoSyncEnabled
        ? "自動同步已啟用，系統會定期同步已支援的物流商。"
        : "目前自動同步尚未啟用，可手動同步已支援的物流商。",
    });
  } catch (err) {
    console.error("[logistics-sync] status failed:", err);
    return fail(res, 500, "SYNC_STATUS_FAILED", "無法讀取同步狀態，請稍後再試。");
  }
});

export default router;
