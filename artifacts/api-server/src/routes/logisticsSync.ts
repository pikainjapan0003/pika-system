import { Router } from "express";
import { desc, eq, inArray, and, isNull, or } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingEventsTable,
  shipmentTrackingRunLogsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";
import { runFamilyMartTrackingWorker } from "../lib/logistics/workers/familyMartTrackingWorker.ts";
import { runControlledDbWrite } from "../lib/logistics/workers/multiProviderControlledWriteWorker.ts";
import {
  signPreviewToken,
  isPreviewTokenAvailable,
  verifyPreviewToken,
} from "../lib/logistics/previewToken.ts";
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

/**
 * 共用驗證（Step 7N-J2 抽出，供 manual-provider 與 /preview 共用）：
 * owner、provider whitelist、trackingIds 形狀、store scope、provider 比對。
 * 全部在外部查詢與任何寫入之前執行；失敗時已回應，回 null。
 */
async function validateManualProviderRequest(
  req: any,
  res: any,
): Promise<{
  storeId: number;
  provider: string;
  trackingIds: number[];
  rowById: Map<number, { id: number; trackingCode: string; trackingProvider: string; storeId: number }>;
} | null> {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) {
    fail(res, 400, "INVALID_STORE", "Invalid storeId");
    return null;
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return null;

  const body = req.body ?? {};
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";

  if (!provider) {
    fail(res, 400, "PROVIDER_REQUIRED", "provider is required");
    return null;
  }
  if (!MANUAL_PROVIDER_WHITELIST.includes(provider as any)) {
    const message =
      provider === "familymart"
        ? "全家請使用既有的整批手動同步。"
        : provider === "711"
          ? "7-11 目前不支援手動查詢（半自動，需人工處理）。"
          : `provider must be one of: ${MANUAL_PROVIDER_WHITELIST.join(", ")}`;
    fail(res, 400, "PROVIDER_NOT_ALLOWED", message);
    return null;
  }

  const rawIds = body.trackingIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    fail(res, 400, "TRACKING_IDS_REQUIRED", "trackingIds must be a non-empty array");
    return null;
  }
  if (rawIds.length > MANUAL_PROVIDER_MAX_TRACKING_IDS) {
    fail(res, 400, "TOO_MANY_TRACKING_IDS", `一次最多查詢 ${MANUAL_PROVIDER_MAX_TRACKING_IDS} 筆。`);
    return null;
  }
  const trackingIds = rawIds.map((v: unknown) => Number(v));
  if (trackingIds.some((n: number) => !Number.isInteger(n) || n <= 0)) {
    fail(res, 400, "INVALID_TRACKING_IDS", "trackingIds must be positive integers");
    return null;
  }

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
    fail(res, 400, "TRACKING_NOT_FOUND", `找不到物流追蹤紀錄：${missing.join(", ")}`);
    return null;
  }
  // 跨店一律整批拒絕，不可只 skip（避免誤用）
  if (rows.some((r) => r.storeId !== storeId)) {
    fail(res, 400, "CROSS_STORE_TRACKING", "trackingIds 包含不屬於此店家的紀錄。");
    return null;
  }
  if (rows.some((r) => r.trackingProvider !== provider)) {
    fail(res, 400, "PROVIDER_MISMATCH", "trackingIds 包含與 provider 不符的紀錄。");
    return null;
  }

  return { storeId, provider, trackingIds, rowById };
}

router.post(
  "/stores/:storeId/logistics/sync/manual-provider",
  requireAuth,
  async (req: any, res: any) => {
    // Step 7N-J2 safety lock：裸 dryRun:false 一律擋下（在 owner 驗證 / DB 查詢 /
    // 外部查詢之前）。正式寫入必須走 preview/commit flow（/commit 於 J3 實作）。
    if ((req.body ?? {}).dryRun === false) {
      return fail(res, 400, "USE_COMMIT_ENDPOINT", "Manual provider write requires preview/commit flow.");
    }

    const validated = await validateManualProviderRequest(req, res);
    if (!validated) return;
    const { storeId, provider, trackingIds, rowById } = validated;
    const writeMode = "dryRun" as const;

    try {
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
        dryRun: true,
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
        message: "測試模式：本次僅預覽查詢結果，未寫入任何資料。",
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

/**
 * 郵局 / 黑貓 preview（Step 7N-J2）：dryRun 查詢 + 簽發 previewHash，
 * 供未來 /commit（J3）綁定「看到的 preview = 要寫入的內容」。
 * 永遠 dryRun、不寫 DB / events / snapshot / last_checked_at、不開排程。
 * duplicateEvents 以 idempotencyKeysPreview 唯讀比對既有 events 計算。
 */
router.post(
  "/stores/:storeId/logistics/sync/manual-provider/preview",
  requireAuth,
  async (req: any, res: any) => {
    const validated = await validateManualProviderRequest(req, res);
    if (!validated) return;
    const { storeId, provider, trackingIds, rowById } = validated;

    try {
      const result = await runControlledDbWrite(
        trackingIds.map((id: number) => ({
          provider,
          trackingId: id,
          trackingCode: rowById.get(id)!.trackingCode,
          writeMode: "dryRun" as const,
        })),
        { storeId, createdBy: req.userId ?? "owner-ui" },
      );

      const hashAvailable = isPreviewTokenAvailable();
      const jobs = [];
      for (const j of result.jobs) {
        // duplicateEvents：preview keys 中已存在於 DB 的事件數（唯讀查詢）
        let duplicateEvents = 0;
        const keys = j.idempotencyKeysPreview ?? [];
        if (j.status === "success" && keys.length > 0) {
          const existing = await db
            .select({ id: shipmentTrackingEventsTable.id })
            .from(shipmentTrackingEventsTable)
            .where(
              and(
                eq(shipmentTrackingEventsTable.shipmentTrackingId, j.trackingId),
                inArray(shipmentTrackingEventsTable.idempotencyKey, keys),
              ),
            );
          duplicateEvents = existing.length;
        }

        let previewHash: string | null = null;
        let previewExpiresAt: string | null = null;
        if (hashAvailable && j.status === "success") {
          const signed = signPreviewToken({
            storeId,
            trackingId: j.trackingId,
            provider,
            trackingCode: j.trackingCode,
            latestStatusText: j.latestStatusText ?? null,
            latestEventAt: j.latestEventAt ?? null,
            expectedEventCount: j.wouldWriteEvents ?? 0,
            normalizedStatus: j.normalizedStatus ?? null,
          });
          previewHash = signed.token;
          previewExpiresAt = signed.expiresAt;
        }

        jobs.push({
          success: j.status === "success",
          status: j.status,
          provider,
          trackingId: j.trackingId,
          trackingCode: j.trackingCode,
          latestStatusText: j.latestStatusText ?? null,
          latestEventAt: j.latestEventAt ?? null,
          wouldWriteEvents: j.wouldWriteEvents ?? 0,
          duplicateEvents,
          normalizedStatus: j.normalizedStatus ?? null,
          errorCode: j.errorCode,
          skippedReason: j.skippedReason,
          previewHash,
          previewExpiresAt,
        });
      }

      return res.json({
        ok: true,
        dryRun: true,
        provider,
        previewHashAvailable: hashAvailable,
        totalJobs: result.totalJobs,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        emptyCount: result.emptyCount,
        jobs,
        message: "測試模式：本次僅預覽查詢結果，未寫入任何資料。",
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("BATCH_SIZE_EXCEEDED")) {
        return fail(res, 400, "TOO_MANY_TRACKING_IDS", "一次最多查詢 5 筆。");
      }
      console.error("[logistics-sync] manual-provider preview failed:", err);
      return fail(res, 500, "MANUAL_PROVIDER_SYNC_FAILED", "手動查詢執行失敗，請稍後再試。");
    }
  },
);

const COMMIT_CONFIRM_TEXT = "WRITE_TRACKING_EVENTS";

/**
 * 郵局 / 黑貓 commit（Step 7N-J4B）：驗證 previewHash、re-dryRun drift 檢查、正式寫入。
 * provider whitelist postoffice / tcat only；711 / familymart 一律拒絕。
 * 寫入路徑唯一來源：runControlledDbWrite writeMode=write。
 * run log storeId 必須傳入；orders 主狀態不得更新。
 */
router.post(
  "/stores/:storeId/logistics/sync/manual-provider/commit",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId)) return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const body = req.body ?? {};
    const rawProvider = body.provider;
    const rawTrackingId = body.trackingId;
    const rawTrackingCode = body.trackingCode;
    const { previewHash, confirmText } = body;
    const expectedEventCount = body.expectedEventCount;
    const expectedLatestStatusText = body.expectedLatestStatusText !== undefined ? body.expectedLatestStatusText : null;
    const expectedLatestEventAt = body.expectedLatestEventAt !== undefined ? body.expectedLatestEventAt : null;

    // provider whitelist
    const provider = typeof rawProvider === "string" ? rawProvider.trim() : "";
    if (!provider || !MANUAL_PROVIDER_WHITELIST.includes(provider as any)) {
      const message =
        provider === "711"
          ? "7-11 目前不支援手動查詢（半自動，需人工處理）。"
          : provider === "familymart"
            ? "全家請使用既有的整批手動同步。"
            : `provider must be one of: ${MANUAL_PROVIDER_WHITELIST.join(", ")}`;
      return fail(res, 400, "INVALID_PROVIDER", message);
    }

    // trackingId
    const trackingId = Number(rawTrackingId);
    if (!Number.isInteger(trackingId) || trackingId <= 0) {
      return fail(res, 400, "INVALID_TRACKING_ID", "trackingId must be a positive integer");
    }

    // trackingCode
    const trackingCode = typeof rawTrackingCode === "string" ? rawTrackingCode.trim() : "";
    if (!trackingCode) {
      return fail(res, 400, "TRACKING_CODE_MISMATCH", "trackingCode is required");
    }

    // previewHash
    if (!previewHash || typeof previewHash !== "string") {
      return fail(res, 400, "PREVIEW_HASH_REQUIRED", "請提供 previewHash");
    }
    if (!isPreviewTokenAvailable()) {
      return fail(res, 503, "PREVIEW_HASH_UNAVAILABLE", "服務暫時無法處理，請稍後再試。");
    }
    const verified = verifyPreviewToken(previewHash);
    if (!verified.ok) {
      return fail(
        res,
        400,
        verified.errorCode,
        verified.errorCode === "PREVIEW_EXPIRED"
          ? "預覽已過期（10 分鐘），請重新預覽後再送出。"
          : "previewHash 無效或已被竄改。",
      );
    }
    const tokenPayload = verified.payload;

    // scope check
    if (
      tokenPayload.storeId !== storeId ||
      tokenPayload.trackingId !== trackingId ||
      tokenPayload.provider !== provider ||
      tokenPayload.trackingCode !== trackingCode
    ) {
      return fail(res, 400, "PREVIEW_SCOPE_MISMATCH", "previewHash 與請求內容不符。");
    }

    // confirmText
    if (!confirmText || typeof confirmText !== "string") {
      return fail(res, 400, "CONFIRM_TEXT_REQUIRED", "請提供 confirmText");
    }
    if (confirmText !== COMMIT_CONFIRM_TEXT) {
      return fail(res, 400, "CONFIRM_TEXT_INVALID", "confirmText 錯誤，必須填入 WRITE_TRACKING_EVENTS");
    }

    // compare expected fields vs token payload
    const reqEventCount = Number(expectedEventCount);
    if (!Number.isInteger(reqEventCount) || reqEventCount < 0 || reqEventCount !== tokenPayload.expectedEventCount) {
      return fail(res, 400, "EXPECTED_EVENT_COUNT_MISMATCH", "expectedEventCount 與預覽不符");
    }
    const normReqStatus = expectedLatestStatusText === null ? null : String(expectedLatestStatusText);
    const normReqAt = expectedLatestEventAt === null ? null : String(expectedLatestEventAt);
    if (normReqStatus !== (tokenPayload.latestStatusText ?? null)) {
      return fail(res, 400, "EXPECTED_LATEST_STATUS_MISMATCH", "expectedLatestStatusText 與預覽不符");
    }
    if (normReqAt !== (tokenPayload.latestEventAt ?? null)) {
      return fail(res, 400, "EXPECTED_LATEST_EVENT_AT_MISMATCH", "expectedLatestEventAt 與預覽不符");
    }

    // load tracking row scoped by storeId
    let trackingRow: { trackingCode: string; trackingProvider: string; isActive: boolean } | undefined;
    try {
      const rows = await db
        .select({
          trackingCode: shipmentTrackingsTable.trackingCode,
          trackingProvider: shipmentTrackingsTable.trackingProvider,
          isActive: shipmentTrackingsTable.isActive,
          ownerStoreId: ordersTable.storeId,
        })
        .from(shipmentTrackingsTable)
        .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
        .where(eq(shipmentTrackingsTable.id, trackingId));

      const row = rows[0];
      if (!row || row.ownerStoreId !== storeId) {
        return fail(res, 404, "TRACKING_NOT_FOUND", "找不到此物流追蹤紀錄");
      }
      trackingRow = row;
    } catch (err) {
      console.error("[logistics-sync/commit] DB lookup failed:", err);
      return fail(res, 500, "WRITE_FAILED", "寫入失敗，請稍後再試。");
    }

    if (!trackingRow.isActive) {
      return fail(res, 400, "TRACKING_INACTIVE", "此物流追蹤紀錄已停用");
    }
    if (trackingRow.trackingProvider !== provider) {
      return fail(res, 400, "PROVIDER_MISMATCH", "provider 與紀錄不符");
    }
    if (trackingRow.trackingCode !== trackingCode) {
      return fail(res, 400, "TRACKING_CODE_MISMATCH", "trackingCode 與紀錄不符");
    }

    const createdBy = req.userId ?? "owner-ui";

    // re-dryRun drift check
    let dryResult: Awaited<ReturnType<typeof runControlledDbWrite>>;
    try {
      dryResult = await runControlledDbWrite(
        [{ provider, trackingId, trackingCode, writeMode: "dryRun" }],
        { storeId, createdBy },
      );
    } catch (err) {
      console.error("[logistics-sync/commit] re-dryRun failed:", err);
      return fail(res, 502, "WRITE_FAILED", "寫入失敗，請稍後再試。");
    }

    const dryJob = dryResult.jobs[0];
    if (!dryJob || dryJob.status === "failed" || dryJob.status === "skipped") {
      return fail(res, 502, "WRITE_FAILED", "寫入失敗，請稍後再試。");
    }

    const freshEventCount = dryJob.wouldWriteEvents ?? 0;
    const freshStatusText = dryJob.latestStatusText ?? null;
    const freshEventAt = dryJob.latestEventAt ?? null;

    if (
      freshEventCount !== tokenPayload.expectedEventCount ||
      freshStatusText !== (tokenPayload.latestStatusText ?? null) ||
      freshEventAt !== (tokenPayload.latestEventAt ?? null)
    ) {
      return res.status(409).json({
        ok: false,
        code: "PREVIEW_DRIFTED",
        message: "外部貨態已更新，請重新預覽後再寫入。",
        freshPreview: {
          expectedEventCount: freshEventCount,
          latestStatusText: freshStatusText,
          latestEventAt: freshEventAt,
        },
      });
    }

    // write
    let writeResult: Awaited<ReturnType<typeof runControlledDbWrite>>;
    try {
      writeResult = await runControlledDbWrite(
        [{ provider, trackingId, trackingCode, writeMode: "write" }],
        { storeId, createdBy },
      );
    } catch (err) {
      console.error("[logistics-sync/commit] write failed:", err);
      return fail(res, 500, "WRITE_FAILED", "寫入失敗，請稍後再試。");
    }

    const writeJob = writeResult.jobs[0];
    if (!writeJob || writeJob.status === "failed" || writeJob.status === "skipped") {
      return fail(res, 500, "WRITE_FAILED", "寫入失敗，請稍後再試。");
    }

    const insertedEventCount = writeJob.insertedEventCount ?? 0;
    const idempotentNoop = insertedEventCount === 0 && tokenPayload.expectedEventCount > 0;

    return res.json({
      ok: true,
      provider,
      trackingId,
      trackingCode,
      committed: true,
      insertedEventCount,
      idempotentNoop,
      runLogId: writeResult.runLogId,
      latestStatusText: writeJob.latestStatusText ?? null,
      latestEventAt: writeJob.latestEventAt ?? null,
    });
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
