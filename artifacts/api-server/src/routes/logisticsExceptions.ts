import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentTrackingExceptionsTable,
  shipmentTrackingsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { runFamilyMartTrackingWorker } from "../lib/logistics/workers/familyMartTrackingWorker.ts";

const fail = (res: any, status: number, errorCode: string, message: string) =>
  res.status(status).json({ ok: false, errorCode, message });

const PROVIDERS = new Set(["711", "familymart", "tcat", "postoffice"]);
const STATUSES = new Set(["open", "reviewing", "resolved", "ignored"]);
// query 用 "import"，DB 存 "file_import"
const SOURCE_TYPE_ALIASES: Record<string, string> = {
  import: "file_import",
  file_import: "file_import",
  worker: "worker",
  manual: "manual",
  agent: "agent",
};

const router = Router();

/**
 * 物流異常清單（store-scoped，老闆用）。
 * 只回傳安全欄位：不含 rawData / stack / 姓名 / 電話 / 地址（message 依寫入端規則已是安全摘要）。
 */
router.get(
  "/stores/:storeId/logistics/exceptions",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId))
      return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const status = String(req.query.status ?? "open");
    const provider = String(req.query.provider ?? "all");
    const sourceType = String(req.query.sourceType ?? "all");
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "50")) || 50, 1),
      100,
    );

    if (status !== "all" && !STATUSES.has(status))
      return fail(
        res,
        400,
        "INVALID_STATUS",
        "status must be open|reviewing|resolved|ignored|all",
      );
    if (provider !== "all" && !PROVIDERS.has(provider))
      return fail(
        res,
        400,
        "INVALID_PROVIDER",
        "provider must be 711|familymart|tcat|postoffice|all",
      );
    if (sourceType !== "all" && !SOURCE_TYPE_ALIASES[sourceType])
      return fail(
        res,
        400,
        "INVALID_SOURCE_TYPE",
        "sourceType must be import|worker|manual|agent|all",
      );

    const conditions = [eq(shipmentTrackingExceptionsTable.storeId, storeId)];
    if (status !== "all")
      conditions.push(eq(shipmentTrackingExceptionsTable.status, status));
    if (provider !== "all")
      conditions.push(eq(shipmentTrackingExceptionsTable.provider, provider));
    if (sourceType !== "all")
      conditions.push(
        eq(
          shipmentTrackingExceptionsTable.sourceType,
          SOURCE_TYPE_ALIASES[sourceType],
        ),
      );

    try {
      const items = await db
        .select({
          id: shipmentTrackingExceptionsTable.id,
          provider: shipmentTrackingExceptionsTable.provider,
          sourceType: shipmentTrackingExceptionsTable.sourceType,
          trackingCode: shipmentTrackingExceptionsTable.trackingCode,
          orderId: shipmentTrackingExceptionsTable.orderId,
          shipmentTrackingId:
            shipmentTrackingExceptionsTable.shipmentTrackingId,
          status: shipmentTrackingExceptionsTable.status,
          severity: shipmentTrackingExceptionsTable.severity,
          errorCode: shipmentTrackingExceptionsTable.errorCode,
          message: shipmentTrackingExceptionsTable.message,
          retryable: shipmentTrackingExceptionsTable.retryable,
          failureCount: shipmentTrackingExceptionsTable.failureCount,
          lastOccurredAt: shipmentTrackingExceptionsTable.lastOccurredAt,
          createdAt: shipmentTrackingExceptionsTable.createdAt,
          updatedAt: shipmentTrackingExceptionsTable.updatedAt,
          resolvedAt: shipmentTrackingExceptionsTable.resolvedAt,
          resolvedBy: shipmentTrackingExceptionsTable.resolvedBy,
        })
        .from(shipmentTrackingExceptionsTable)
        .where(and(...conditions))
        .orderBy(desc(shipmentTrackingExceptionsTable.createdAt))
        .limit(limit);

      return res.json({ ok: true, items, total: items.length });
    } catch {
      return fail(
        res,
        500,
        "EXCEPTIONS_READ_FAILED",
        "Could not load exceptions",
      );
    }
  },
);

/** 更新異常狀態：resolved / ignored 設 resolved_at + resolved_by；open 清空。 */
router.patch(
  "/stores/:storeId/logistics/exceptions/:id",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    const id = parseInt(req.params.id);
    if (isNaN(storeId))
      return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (isNaN(id)) return fail(res, 400, "INVALID_ID", "Invalid exception id");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const status = req.body?.status;
    if (status !== "resolved" && status !== "ignored" && status !== "open")
      return fail(
        res,
        400,
        "INVALID_STATUS",
        "status must be resolved|ignored|open",
      );

    try {
      const [updated] = await db
        .update(shipmentTrackingExceptionsTable)
        .set(
          status === "open"
            ? { status, resolvedAt: null, resolvedBy: null }
            : {
                status,
                resolvedAt: new Date(),
                resolvedBy: req.userId ?? "owner-ui",
              },
        )
        .where(
          and(
            eq(shipmentTrackingExceptionsTable.id, id),
            eq(shipmentTrackingExceptionsTable.storeId, storeId),
          ),
        )
        .returning({
          id: shipmentTrackingExceptionsTable.id,
          status: shipmentTrackingExceptionsTable.status,
          resolvedAt: shipmentTrackingExceptionsTable.resolvedAt,
        });
      if (!updated) return fail(res, 404, "NOT_FOUND", "Exception not found");
      return res.json({ ok: true, item: updated });
    } catch {
      return fail(
        res,
        500,
        "EXCEPTIONS_UPDATE_FAILED",
        "Could not update exception",
      );
    }
  },
);

// 可重新查詢的 errorCode；conflict / 配對類異常重查也無法解決，不開放
const RETRYABLE_ERROR_CODES = new Set([
  "NO_RESULT",
  "NETWORK_FAILED",
  "TIMEOUT",
  "PARSER_FAILED",
  "UNKNOWN_ERROR",
]);

/**
 * 重新查詢物流：對 exception 對應的 shipment_tracking 重跑一次 worker。
 * 目前僅支援 familymart。不自動 resolve exception，由列表 re-fetch 反映狀態。
 */
router.post(
  "/stores/:storeId/logistics/exceptions/:id/retry",
  requireAuth,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    const id = parseInt(req.params.id);
    if (isNaN(storeId))
      return fail(res, 400, "INVALID_STORE", "Invalid storeId");
    if (isNaN(id)) return fail(res, 400, "INVALID_ID", "Invalid exception id");
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    try {
      const [exception] = await db
        .select({
          id: shipmentTrackingExceptionsTable.id,
          provider: shipmentTrackingExceptionsTable.provider,
          errorCode: shipmentTrackingExceptionsTable.errorCode,
          trackingCode: shipmentTrackingExceptionsTable.trackingCode,
          shipmentTrackingId:
            shipmentTrackingExceptionsTable.shipmentTrackingId,
        })
        .from(shipmentTrackingExceptionsTable)
        .where(
          and(
            eq(shipmentTrackingExceptionsTable.id, id),
            eq(shipmentTrackingExceptionsTable.storeId, storeId),
          ),
        )
        .limit(1);
      if (!exception) return fail(res, 404, "NOT_FOUND", "Exception not found");

      if (!RETRYABLE_ERROR_CODES.has(exception.errorCode))
        return fail(res, 400, "NOT_RETRYABLE", "此物流異常不適合重新查詢");
      if (exception.provider !== "familymart")
        return fail(
          res,
          400,
          "PROVIDER_NOT_SUPPORTED",
          "目前僅支援全家重新查詢",
        );

      // 找可重查的 tracking：優先 exception.shipmentTrackingId，否則用
      // provider + trackingCode + storeId 找 active tracking
      let trackingId = exception.shipmentTrackingId;
      if (trackingId == null && exception.trackingCode) {
        const [tracking] = await db
          .select({ id: shipmentTrackingsTable.id })
          .from(shipmentTrackingsTable)
          .innerJoin(
            ordersTable,
            eq(shipmentTrackingsTable.orderId, ordersTable.id),
          )
          .where(
            and(
              eq(shipmentTrackingsTable.trackingProvider, "familymart"),
              eq(shipmentTrackingsTable.trackingCode, exception.trackingCode),
              eq(shipmentTrackingsTable.isActive, true),
              eq(ordersTable.storeId, storeId),
            ),
          )
          .limit(1);
        trackingId = tracking?.id ?? null;
      }
      if (trackingId == null)
        return fail(
          res,
          400,
          "TRACKING_NOT_FOUND",
          "找不到可重新查詢的物流追蹤資料",
        );

      const result = await runFamilyMartTrackingWorker({
        storeId,
        trackingIds: [trackingId],
        runType: "manual_worker",
        createdBy: req.userId ?? "owner-ui",
      });
      return res.json({ ok: true, result });
    } catch {
      return fail(
        res,
        500,
        "EXCEPTION_RETRY_FAILED",
        "Could not retry exception",
      );
    }
  },
);

export default router;
