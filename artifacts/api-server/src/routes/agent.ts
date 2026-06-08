import { Router } from "express";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { db, shipmentTrackingsTable, ordersTable } from "@workspace/db";
import { agentTokenAuth, type AgentTokenLocals } from "../middlewares/agentAuth.ts";
import { logger } from "../lib/logger.ts";

const router = Router();

const NOT_IMPLEMENTED = {
  error: "not_implemented",
  message: "Agent endpoint is not implemented yet",
} as const;

const VALID_TRACKING_STATUSES = new Set([
  "pending", "checking", "active", "delivered", "failed", "inactive",
]);

router.get("/orders/tracking-jobs", agentTokenAuth, async (req: any, res: any) => {
  try {
    const { storeId } = res.locals.agentToken as AgentTokenLocals;

    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, Math.floor(rawLimit)), 100)
      : 50;

    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    if (statusFilter !== undefined && !VALID_TRACKING_STATUSES.has(statusFilter)) {
      return res.status(400).json({
        error: "invalid_tracking_status",
        message: `status must be one of: ${[...VALID_TRACKING_STATUSES].join(", ")}`,
      });
    }

    const dueOnly = req.query.dueOnly === "true";

    const rows = await db
      .select({
        trackingId: shipmentTrackingsTable.id,
        orderId: shipmentTrackingsTable.orderId,
        trackingCode: shipmentTrackingsTable.trackingCode,
        trackingProvider: shipmentTrackingsTable.trackingProvider,
        trackingStatus: shipmentTrackingsTable.trackingStatus,
        latestEventStatus: shipmentTrackingsTable.latestEventStatus,
        latestEventDescription: shipmentTrackingsTable.latestEventDescription,
        latestEventAt: shipmentTrackingsTable.latestEventAt,
        lastCheckedAt: shipmentTrackingsTable.lastCheckedAt,
        nextCheckAt: shipmentTrackingsTable.nextCheckAt,
        failureCount: shipmentTrackingsTable.failureCount,
        orderNumber: ordersTable.publicToken,
        orderStoreId: ordersTable.storeId,
        shippingStatus: ordersTable.shippingStatus,
      })
      .from(shipmentTrackingsTable)
      .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          eq(shipmentTrackingsTable.isActive, true),
          statusFilter ? eq(shipmentTrackingsTable.trackingStatus, statusFilter) : undefined,
          dueOnly
            ? or(
                isNull(shipmentTrackingsTable.nextCheckAt),
                lte(shipmentTrackingsTable.nextCheckAt, new Date()),
              )
            : undefined,
        ),
      )
      .orderBy(shipmentTrackingsTable.nextCheckAt, shipmentTrackingsTable.createdAt)
      .limit(limit);

    const jobs = rows.map((row) => ({
      trackingId: row.trackingId,
      orderId: row.orderId,
      trackingCode: row.trackingCode,
      trackingProvider: row.trackingProvider,
      trackingStatus: row.trackingStatus,
      latestEventStatus: row.latestEventStatus,
      latestEventDescription: row.latestEventDescription,
      latestEventAt: row.latestEventAt,
      lastCheckedAt: row.lastCheckedAt,
      nextCheckAt: row.nextCheckAt,
      failureCount: row.failureCount,
      order: {
        orderNumber: row.orderNumber,
        storeId: row.orderStoreId,
        shippingStatus: row.shippingStatus,
      },
    }));

    return res.json({ jobs, nextCursor: null });
  } catch (err) {
    logger.error({ err }, "agent_tracking_jobs_failed");
    return res.status(500).json({ error: "agent_tracking_jobs_failed", message: "Failed to fetch tracking jobs" });
  }
});

router.post("/shipment-events", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

router.patch("/shipment-status", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

router.post("/run-log", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

export default router;
