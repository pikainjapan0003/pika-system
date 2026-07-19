import { Router } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingsTable,
  shipmentTrackingExceptionsTable,
  shipmentTrackingRunLogsTable,
  logisticsImportBatchesTable,
  logisticsImportRowsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import {
  parseSevenElevenSpreadsheet,
  parseFamilyMartSpreadsheet,
  matchLogisticsImportRows,
  sanitizeImportRowForStorage,
} from "../lib/logistics/importers/index.ts";
import { loadCandidateOrders } from "../lib/logistics/importers/loadCandidateOrders.ts";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // some clients send xlsx as octet-stream; extension still checked
]);

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
});

function parseMulter(req: any, res: any): Promise<void> {
  return new Promise((resolve, reject) => {
    multerUpload.single("file")(req, res, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

const fail = (res: any, status: number, errorCode: string, message: string) =>
  res.status(status).json({ ok: false, errorCode, message });

const router = Router();

/**
 * Dry-run logistics spreadsheet upload (store-scoped). Parses the xlsx,
 * matches rows against the store's orders (read-only) and persists the masked
 * dry-run result as a logistics_import_batches + logistics_import_rows draft
 * (status "dry_run"). NEVER writes orders / shipment_trackings — that only
 * happens via the confirm endpoint below. The uploaded file's tmp copy is
 * deleted in finally; only masked PII is stored or returned.
 */
router.post(
  "/stores/:storeId/logistics/imports/dry-run",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId))
      return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    try {
      await parseMulter(req, res);
    } catch (err: unknown) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
        return fail(res, 400, "FILE_TOO_LARGE", "File exceeds 10MB limit");
      return fail(res, 400, "UNKNOWN_ERROR", "Upload error");
    }

    const provider = String(req.body?.provider ?? req.query?.provider ?? "");
    if (provider !== "711" && provider !== "familymart")
      return fail(
        res,
        400,
        "INVALID_PROVIDER",
        "provider must be 711 or familymart",
      );

    if (!req.file || !req.file.buffer?.length)
      return fail(
        res,
        400,
        "MISSING_FILE",
        "file is required (multipart field: file)",
      );

    const fileName = req.file.originalname || "upload.xlsx";
    if (
      !fileName.toLowerCase().endsWith(".xlsx") ||
      !XLSX_MIME_TYPES.has(req.file.mimetype)
    )
      return fail(
        res,
        400,
        "UNSUPPORTED_FILE_TYPE",
        "Only .xlsx files are accepted",
      );

    const tmpPath = path.join(
      tmpdir(),
      `logistics-dryrun-${randomBytes(8).toString("hex")}.xlsx`,
    );
    try {
      await writeFile(tmpPath, req.file.buffer);

      let sheet;
      try {
        sheet =
          provider === "711"
            ? await parseSevenElevenSpreadsheet(tmpPath, fileName)
            : await parseFamilyMartSpreadsheet(tmpPath, fileName);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("FORM_PARSE_FAILED"))
          return fail(
            res,
            422,
            "REQUIRED_COLUMNS_MISSING",
            "Spreadsheet headers do not match the expected export format",
          );
        return fail(
          res,
          422,
          "PARSE_FAILED",
          "Could not parse the spreadsheet",
        );
      }

      let orders;
      try {
        orders = await loadCandidateOrders(storeId);
      } catch {
        return fail(
          res,
          500,
          "ORDERS_READ_FAILED",
          "Could not load orders for matching",
        );
      }

      const dryRun = matchLogisticsImportRows(sheet, orders);

      const rowByNumber = new Map(sheet.rows.map((r) => [r.rowNumber, r]));
      const batch = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(logisticsImportBatchesTable)
          .values({
            storeId,
            provider,
            fileName,
            uploadedBy: req.userId,
            status: "dry_run",
            totalRows: dryRun.totalRows,
            matchedRows: dryRun.matchedRows,
            needsReviewRows: dryRun.needsReviewRows,
            ambiguousRows: dryRun.ambiguousRows,
            notFoundRows: dryRun.notFoundRows,
            conflictRows: dryRun.conflictRows,
            invalidRows: dryRun.invalidRows,
          })
          .returning();
        if (dryRun.rows.length) {
          await tx.insert(logisticsImportRowsTable).values(
            dryRun.rows.map((r) => {
              const sanitized = sanitizeImportRowForStorage(
                rowByNumber.get(r.rowNumber)!,
              );
              return {
                batchId: created.id,
                rowNumber: r.rowNumber,
                trackingCode: r.trackingCode,
                recipientNameMasked: sanitized.recipientNameMasked,
                recipientPhoneMasked: sanitized.recipientPhoneMasked,
                storeName: r.storeName,
                externalOrderNo:
                  rowByNumber.get(r.rowNumber)?.externalOrderNo ?? null,
                matchedOrderId: r.matchedOrderId ?? null,
                matchStatus: r.matchStatus,
                confidence: r.confidence ?? null,
                reasons: r.reasons,
                errorCode: r.errorCode,
                rawRowJson: sanitized.rawRowJson,
              };
            }),
          );
        }
        return created;
      });

      return res.json({
        ok: true,
        provider,
        fileName,
        batchId: batch.id,
        dryRun,
      });
    } catch {
      return fail(res, 500, "UNKNOWN_ERROR", "Unexpected error");
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  },
);

/**
 * Confirm a dry-run batch: writes tracking codes onto orders and creates
 * shipment_trackings (source_type "file_import") for the selected matched
 * rows, inside one transaction. Only match_status === "matched" rows are
 * importable; everything else is recorded as an exception and skipped.
 * A batch can be confirmed once (status dry_run → confirmed).
 */
router.post(
  "/stores/:storeId/logistics/imports/:batchId/confirm",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    const batchId = parseInt(req.params.batchId);
    if (isNaN(storeId) || isNaN(batchId))
      return fail(res, 400, "INVALID_REQUEST", "Invalid storeId or batchId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const rowIds: number[] | undefined = Array.isArray(req.body?.rowIds)
      ? req.body.rowIds.map(Number)
      : undefined;
    const confirmAllMatched = req.body?.confirmAllMatched === true;
    if (!confirmAllMatched && (!rowIds || rowIds.length === 0))
      return fail(
        res,
        400,
        "INVALID_CONFIRM_REQUEST",
        "Provide rowIds or confirmAllMatched=true",
      );

    const [batch] = await db
      .select()
      .from(logisticsImportBatchesTable)
      .where(
        and(
          eq(logisticsImportBatchesTable.id, batchId),
          eq(logisticsImportBatchesTable.storeId, storeId),
        ),
      );
    if (!batch)
      return fail(
        res,
        404,
        "BATCH_NOT_FOUND",
        "Batch not found for this store",
      );
    if (batch.status !== "dry_run")
      return fail(
        res,
        409,
        "BATCH_ALREADY_CONFIRMED",
        `Batch status is ${batch.status}`,
      );

    const targetRows = await db
      .select()
      .from(logisticsImportRowsTable)
      .where(
        confirmAllMatched
          ? and(
              eq(logisticsImportRowsTable.batchId, batchId),
              eq(logisticsImportRowsTable.matchStatus, "matched"),
            )
          : and(
              eq(logisticsImportRowsTable.batchId, batchId),
              inArray(logisticsImportRowsTable.id, rowIds!),
            ),
      );
    if (!targetRows.length)
      return fail(res, 400, "NO_ROWS_SELECTED", "No rows to confirm");

    type RowResult = {
      rowId: number;
      rowNumber: number;
      status: "imported" | "skipped";
      errorCode: string | null;
    };
    const results: RowResult[] = [];
    const exceptions: Array<
      typeof shipmentTrackingExceptionsTable.$inferInsert
    > = [];

    try {
      await db.transaction(async (tx) => {
        for (const row of targetRows) {
          const skip = (errorCode: string) => {
            results.push({
              rowId: row.id,
              rowNumber: row.rowNumber,
              status: "skipped",
              errorCode,
            });
            exceptions.push({
              storeId,
              orderId: row.matchedOrderId,
              importBatchId: batchId,
              importRowId: row.id,
              provider: batch.provider as any,
              trackingCode: row.trackingCode,
              sourceType: "file_import",
              errorCode,
              // row number / store name only — never raw PII
              message: `import confirm skipped: row ${row.rowNumber} (${row.storeName ?? "no store"})`,
              severity: "warning",
            });
          };

          if (row.matchStatus !== "matched") {
            skip("ROW_NOT_IMPORTABLE");
            continue;
          }
          if (!row.matchedOrderId || !row.trackingCode) {
            skip("ORDER_NOT_FOUND");
            continue;
          }

          const [order] = await tx
            .select()
            .from(ordersTable)
            .where(eq(ordersTable.id, row.matchedOrderId));
          if (!order || order.storeId !== storeId) {
            skip("ORDER_NOT_FOUND");
            continue;
          }
          if (order.trackingCode && order.trackingCode !== row.trackingCode) {
            skip("ORDER_ALREADY_HAS_TRACKING");
            continue;
          }

          const [dupTracking] = await tx
            .select({
              id: shipmentTrackingsTable.id,
              orderId: shipmentTrackingsTable.orderId,
            })
            .from(shipmentTrackingsTable)
            .where(
              and(
                eq(shipmentTrackingsTable.trackingProvider, batch.provider),
                eq(shipmentTrackingsTable.trackingCode, row.trackingCode),
              ),
            );
          if (dupTracking) {
            if (dupTracking.orderId === order.id) {
              // Idempotent re-run: same order + same provider + same tracking code.
              // Reactivate the existing tracking (conservative: keep source_type and
              // tracking_status as-is so a status never regresses to pending) and
              // re-set the same values on the order — no duplicate row, counted as success.
              await tx
                .update(shipmentTrackingsTable)
                .set({ isActive: true })
                .where(eq(shipmentTrackingsTable.id, dupTracking.id));
              await tx
                .update(ordersTable)
                .set({
                  trackingCode: row.trackingCode,
                  trackingProvider: batch.provider,
                })
                .where(eq(ordersTable.id, order.id));
              await tx
                .update(logisticsImportRowsTable)
                .set({ matchStatus: "imported" })
                .where(eq(logisticsImportRowsTable.id, row.id));
              results.push({
                rowId: row.id,
                rowNumber: row.rowNumber,
                status: "imported",
                errorCode: null,
              });
              continue;
            }
            skip("TRACKING_CODE_CONFLICT");
            continue;
          }

          await tx
            .update(ordersTable)
            .set({
              trackingCode: row.trackingCode,
              trackingProvider: batch.provider,
            })
            .where(eq(ordersTable.id, order.id));

          await tx.insert(shipmentTrackingsTable).values({
            orderId: order.id,
            trackingCode: row.trackingCode,
            trackingProvider: batch.provider,
            sourceType: "file_import",
            trackingStatus: "pending",
            isActive: true,
            nextCheckAt: new Date(),
          });

          await tx
            .update(logisticsImportRowsTable)
            .set({ matchStatus: "imported" })
            .where(eq(logisticsImportRowsTable.id, row.id));

          results.push({
            rowId: row.id,
            rowNumber: row.rowNumber,
            status: "imported",
            errorCode: null,
          });
        }

        // mark selected-but-skipped rows so the batch view reflects the outcome
        const skippedIds = results
          .filter((r) => r.status === "skipped")
          .map((r) => r.rowId);
        if (skippedIds.length) {
          await tx
            .update(logisticsImportRowsTable)
            .set({ matchStatus: "skipped" })
            .where(
              and(
                inArray(logisticsImportRowsTable.id, skippedIds),
                eq(logisticsImportRowsTable.matchStatus, "matched"),
              ),
            );
        }

        await tx
          .update(logisticsImportBatchesTable)
          .set({ status: "confirmed", confirmedAt: new Date() })
          .where(eq(logisticsImportBatchesTable.id, batchId));

        if (exceptions.length)
          await tx.insert(shipmentTrackingExceptionsTable).values(exceptions);

        const successCount = results.filter(
          (r) => r.status === "imported",
        ).length;
        const skippedCount = results.length - successCount;
        const errorCodes = [
          ...new Set(
            results.filter((r) => r.errorCode).map((r) => r.errorCode),
          ),
        ];
        await tx.insert(shipmentTrackingRunLogsTable).values({
          storeId,
          runType: "import_confirm",
          provider: batch.provider,
          startedAt: new Date(),
          finishedAt: new Date(),
          status:
            skippedCount === 0
              ? "success"
              : successCount === 0
                ? "failed"
                : "partial",
          totalJobs: results.length,
          successCount,
          failedCount: 0,
          skippedCount,
          errorSummary: errorCodes.length ? errorCodes.join(",") : null,
          createdBy: req.userId,
        });
      });
    } catch {
      return fail(res, 500, "UNKNOWN_ERROR", "Confirm transaction failed");
    }

    const importedCount = results.filter((r) => r.status === "imported").length;
    return res.json({
      ok: true,
      batchId,
      batchStatus: "confirmed",
      importedCount,
      skippedCount: results.length - importedCount,
      rows: results,
    });
  },
);

// rowStatus → 老闆端結果分類：imported=成功；matched=待匯入；invalid=失敗；其餘=略過
const SKIPPED_MATCH_STATUSES = new Set([
  "skipped",
  "conflict",
  "not_found",
  "ambiguous",
  "needs_review",
]);

/**
 * 匯入批次列表（store-scoped）。回傳安全欄位 + 由 rows matchStatus 推導的
 * success/skipped/failed/pending 計數。不回 rawRowJson / 個資。
 */
router.get(
  "/stores/:storeId/logistics/import-batches",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId))
      return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const provider = String(req.query.provider ?? "all");
    if (provider !== "all" && provider !== "711" && provider !== "familymart")
      return fail(
        res,
        400,
        "INVALID_PROVIDER",
        "provider must be 711|familymart|all",
      );
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "20")) || 20, 1),
      50,
    );

    const conditions = [eq(logisticsImportBatchesTable.storeId, storeId)];
    if (provider !== "all")
      conditions.push(eq(logisticsImportBatchesTable.provider, provider));

    try {
      const batches = await db
        .select({
          id: logisticsImportBatchesTable.id,
          provider: logisticsImportBatchesTable.provider,
          fileName: logisticsImportBatchesTable.fileName,
          status: logisticsImportBatchesTable.status,
          totalRows: logisticsImportBatchesTable.totalRows,
          confirmedAt: logisticsImportBatchesTable.confirmedAt,
          createdAt: logisticsImportBatchesTable.createdAt,
        })
        .from(logisticsImportBatchesTable)
        .where(and(...conditions))
        .orderBy(desc(logisticsImportBatchesTable.createdAt))
        .limit(limit);

      const batchIds = batches.map((b) => b.id);
      const statusCounts = batchIds.length
        ? await db
            .select({
              batchId: logisticsImportRowsTable.batchId,
              matchStatus: logisticsImportRowsTable.matchStatus,
              n: count(),
            })
            .from(logisticsImportRowsTable)
            .where(inArray(logisticsImportRowsTable.batchId, batchIds))
            .groupBy(
              logisticsImportRowsTable.batchId,
              logisticsImportRowsTable.matchStatus,
            )
        : [];

      const countsByBatch = new Map<
        number,
        { success: number; skipped: number; failed: number; pending: number }
      >();
      for (const { batchId, matchStatus, n } of statusCounts) {
        const c = countsByBatch.get(batchId) ?? {
          success: 0,
          skipped: 0,
          failed: 0,
          pending: 0,
        };
        if (matchStatus === "imported") c.success += n;
        else if (matchStatus === "invalid") c.failed += n;
        else if (SKIPPED_MATCH_STATUSES.has(matchStatus)) c.skipped += n;
        else c.pending += n; // matched（dry-run 尚未確認）
        countsByBatch.set(batchId, c);
      }

      const items = batches.map((b) => {
        const c = countsByBatch.get(b.id) ?? {
          success: 0,
          skipped: 0,
          failed: 0,
          pending: 0,
        };
        return {
          id: b.id,
          provider: b.provider,
          sourceType: "file_import",
          fileName: b.fileName,
          status: b.status,
          totalRows: b.totalRows,
          successRows: c.success,
          skippedRows: c.skipped,
          failedRows: c.failed,
          pendingRows: c.pending,
          confirmedAt: b.confirmedAt,
          createdAt: b.createdAt,
        };
      });

      return res.json({ ok: true, items, total: items.length });
    } catch {
      return fail(
        res,
        500,
        "BATCHES_READ_FAILED",
        "Could not load import batches",
      );
    }
  },
);

/**
 * 批次 row 明細（store-scoped：batch 必須屬於 storeId 才查 rows）。
 * 只回安全欄位：不含 rawRowJson / 遮罩前個資 / stack。
 */
router.get(
  "/stores/:storeId/logistics/import-batches/:batchId/rows",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    const batchId = parseInt(req.params.batchId);
    if (isNaN(storeId) || isNaN(batchId))
      return fail(res, 400, "INVALID_REQUEST", "Invalid storeId or batchId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const status = String(req.query.status ?? "all");
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "200")) || 200, 1),
      500,
    );

    try {
      const [batch] = await db
        .select({
          id: logisticsImportBatchesTable.id,
          provider: logisticsImportBatchesTable.provider,
          fileName: logisticsImportBatchesTable.fileName,
          status: logisticsImportBatchesTable.status,
          totalRows: logisticsImportBatchesTable.totalRows,
          createdAt: logisticsImportBatchesTable.createdAt,
        })
        .from(logisticsImportBatchesTable)
        .where(
          and(
            eq(logisticsImportBatchesTable.id, batchId),
            eq(logisticsImportBatchesTable.storeId, storeId),
          ),
        );
      if (!batch)
        return fail(
          res,
          404,
          "BATCH_NOT_FOUND",
          "Batch not found for this store",
        );

      const rowConditions = [eq(logisticsImportRowsTable.batchId, batchId)];
      if (status !== "all")
        rowConditions.push(eq(logisticsImportRowsTable.matchStatus, status));

      const rows = await db
        .select({
          id: logisticsImportRowsTable.id,
          rowNumber: logisticsImportRowsTable.rowNumber,
          trackingCode: logisticsImportRowsTable.trackingCode,
          orderId: logisticsImportRowsTable.matchedOrderId,
          status: logisticsImportRowsTable.matchStatus,
          errorCode: logisticsImportRowsTable.errorCode,
          createdAt: logisticsImportRowsTable.createdAt,
        })
        .from(logisticsImportRowsTable)
        .where(and(...rowConditions))
        .orderBy(logisticsImportRowsTable.rowNumber)
        .limit(limit);

      return res.json({ ok: true, batch, rows, total: rows.length });
    } catch {
      return fail(
        res,
        500,
        "BATCH_ROWS_READ_FAILED",
        "Could not load batch rows",
      );
    }
  },
);

export default router;
