/**
 * Step 7F：排程專用物流同步入口（code-ready，排程本身由 Replit Scheduled Deployment 另行設定）。
 *
 * 安全模型：不走 Clerk，改以 x-internal-sync-secret header 比對 CRON_SYNC_SECRET。
 * CRON_SYNC_SECRET 未設定時回 404 —— 部署 code 後預設關閉，設 secret 即啟用、刪 secret 即 rollback。
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, shipmentTrackingRunLogsTable } from "@workspace/db";
import { runFamilyMartTrackingWorker } from "../lib/logistics/workers/familyMartTrackingWorker.ts";
import { runManualSnapshotRefresh } from "../lib/logistics/workers/manualSnapshotRefreshWorker.ts";

const SCHEDULED_SYNC_LIMIT = 30;
/** running-check 視窗：近 10 分鐘內已有 running 的 scheduled run → 本輪 skip */
const RUNNING_CHECK_WINDOW_MS = 10 * 60 * 1000;

/** 長度不同也不提早 return 的比對；secret 本身不落 log。 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const router = Router();

router.post("/internal/logistics/sync/scheduled", async (req: any, res: any) => {
  const expectedSecret = process.env.CRON_SYNC_SECRET;
  if (!expectedSecret) {
    return res.status(404).json({ ok: false, errorCode: "NOT_FOUND", message: "Not found" });
  }

  const providedSecret = req.header("x-internal-sync-secret");
  if (typeof providedSecret !== "string" || !secretMatches(providedSecret, expectedSecret)) {
    return res.status(401).json({ ok: false, errorCode: "UNAUTHORIZED", message: "Invalid sync secret" });
  }

  try {
    const now = new Date();
    const [runningLog] = await db
      .select({ id: shipmentTrackingRunLogsTable.id })
      .from(shipmentTrackingRunLogsTable)
      .where(
        and(
          eq(shipmentTrackingRunLogsTable.runType, "scheduled_worker"),
          eq(shipmentTrackingRunLogsTable.status, "running"),
          gte(shipmentTrackingRunLogsTable.startedAt, new Date(now.getTime() - RUNNING_CHECK_WINDOW_MS)),
        ),
      )
      .orderBy(desc(shipmentTrackingRunLogsTable.startedAt))
      .limit(1);

    if (runningLog) {
      return res.json({
        ok: true,
        status: "skipped",
        runId: null,
        provider: "familymart",
        totalJobs: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        message: `近 10 分鐘內已有排程同步執行中（runId=${runningLog.id}），本輪略過。`,
      });
    }

    const result = await runFamilyMartTrackingWorker({
      runType: "scheduled_worker",
      createdBy: "replit-schedule",
      limit: SCHEDULED_SYNC_LIMIT,
    });

    const runStatus =
      result.failedCount === 0 ? "success" : result.successCount > 0 ? "partial" : "failed";
    return res.json({
      ok: true,
      status: runStatus,
      runId: result.runLogId,
      provider: result.provider,
      totalJobs: result.totalJobs,
      successCount: result.successCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      message:
        result.totalJobs === 0
          ? "目前沒有待同步的全家物流單。"
          : `排程同步完成：成功 ${result.successCount} 筆、失敗 ${result.failedCount} 筆、略過 ${result.skippedCount} 筆。`,
    });
  } catch (err) {
    console.error("[internal-logistics-sync] scheduled sync failed:", err);
    return res
      .status(500)
      .json({ ok: false, errorCode: "SCHEDULED_SYNC_FAILED", message: "排程同步執行失敗。" });
  }
});

/**
 * Manual Provider Snapshot Refresh（Step 7S）
 * 掃描 postoffice / tcat trackings，更新貨態摘要快照。
 * 不寫完整 events、不改 trackingStatus、不開排程。
 * 同樣以 CRON_SYNC_SECRET 保護；未設定 secret 回 404（預設關閉）。
 */
router.post("/internal/logistics/manual-snapshot-refresh", async (req: any, res: any) => {
  const expectedSecret = process.env.CRON_SYNC_SECRET;
  if (!expectedSecret) {
    return res.status(404).json({ ok: false, errorCode: "NOT_FOUND", message: "Not found" });
  }

  const providedSecret = req.header("x-internal-sync-secret");
  if (typeof providedSecret !== "string" || !secretMatches(providedSecret, expectedSecret)) {
    return res.status(401).json({ ok: false, errorCode: "UNAUTHORIZED", message: "Invalid sync secret" });
  }

  try {
    const result = await runManualSnapshotRefresh();
    const runStatus =
      result.failedCount === 0
        ? result.refreshedCount > 0
          ? "success"
          : "empty"
        : result.refreshedCount > 0
          ? "partial"
          : "failed";

    return res.json({
      ok: true,
      status: runStatus,
      scannedCount: result.scannedCount,
      refreshedCount: result.refreshedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      message:
        result.scannedCount === 0
          ? "目前沒有待更新的郵局 / 黑貓物流單。"
          : `貨態摘要更新：成功 ${result.refreshedCount} 筆、略過 ${result.skippedCount} 筆、失敗 ${result.failedCount} 筆。`,
    });
  } catch (err) {
    console.error("[internal-logistics-sync] manual snapshot refresh failed:", err);
    return res
      .status(500)
      .json({ ok: false, errorCode: "SNAPSHOT_REFRESH_FAILED", message: "貨態摘要更新失敗。" });
  }
});

export default router;
