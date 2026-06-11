import { Router } from "express";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db, shipmentTrackingRunLogsTable } from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";
import { runFamilyMartTrackingWorker } from "../lib/logistics/workers/familyMartTrackingWorker.ts";

const fail = (res: any, status: number, errorCode: string, message: string) =>
  res.status(status).json({ ok: false, errorCode, message });

/**
 * Step 7F：物流同步（最小閉環）。
 * 目前只有全家 adapter / worker，故僅支援 familymart；其餘 provider 誠實列為尚未支援。
 * autoSyncEnabled 由 AUTO_SYNC_ENABLED env 控制（排程啟用 SOP：先建排程驗證成功再開此 flag）；
 * 排程設定存在 Replit 平台，app 無可靠來源，故不回傳下次同步時間。
 */
const SUPPORTED_PROVIDERS = ["familymart"] as const;
const UNSUPPORTED_PROVIDERS = ["711", "tcat", "postoffice"] as const;
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
          eq(shipmentTrackingRunLogsTable.storeId, storeId),
          inArray(shipmentTrackingRunLogsTable.runType, SYNC_RUN_TYPES),
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
