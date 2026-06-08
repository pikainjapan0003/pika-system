import { Router } from "express";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { db, shipmentTrackingsTable, ordersTable, shipmentTrackingEventsTable } from "@workspace/db";
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

const VALID_EVENT_STATUSES = new Set([
  "unknown", "pending", "in_transit", "arrived_store", "picked_up", "delivered", "returned", "exception",
]);

const SENSITIVE_KEY_PATTERNS = [
  "phone", "tel", "mobile", "address", "addr", "name", "email",
  "token", "secret", "password", "credential", "authorization",
];

function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => sanitizePayload(v, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = k.toLowerCase();
    if (SENSITIVE_KEY_PATTERNS.some((pat) => keyLower.includes(pat))) continue;
    result[k] = sanitizePayload(v, depth + 1);
  }
  return result;
}

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

router.post("/shipment-events", agentTokenAuth, async (req: any, res: any) => {
  try {
    const { storeId } = res.locals.agentToken as AgentTokenLocals;
    const body = req.body ?? {};

    // Validate trackingId
    const rawTrackingId = body.trackingId;
    const trackingId = rawTrackingId !== undefined ? Number(rawTrackingId) : NaN;
    if (!Number.isInteger(trackingId) || trackingId <= 0) {
      return res.status(400).json({
        error: "invalid_tracking_id",
        message: "trackingId is required and must be a positive integer",
      });
    }

    // Validate eventStatus
    const eventStatus = typeof body.eventStatus === "string" ? body.eventStatus : "";
    if (!VALID_EVENT_STATUSES.has(eventStatus)) {
      return res.status(400).json({
        error: "invalid_event_status",
        message: `eventStatus must be one of: ${[...VALID_EVENT_STATUSES].join(", ")}`,
      });
    }

    // Parse occurredAt
    let occurredAt: Date;
    if (body.occurredAt !== undefined) {
      const d = new Date(body.occurredAt as string);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: "invalid_occurred_at",
          message: "occurredAt must be a valid ISO date string",
        });
      }
      occurredAt = d;
    } else {
      occurredAt = new Date();
    }

    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
    const rawPayload = body.rawPayload;
    const sanitizedPayload: Record<string, unknown> | null =
      rawPayload !== null && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (sanitizePayload(rawPayload) as Record<string, unknown>)
        : null;

    // Verify ownership: tracking must belong to this store and be active
    const [tracking] = await db
      .select({ trackingId: shipmentTrackingsTable.id })
      .from(shipmentTrackingsTable)
      .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
      .where(
        and(
          eq(shipmentTrackingsTable.id, trackingId),
          eq(ordersTable.storeId, storeId),
          eq(shipmentTrackingsTable.isActive, true),
        ),
      )
      .limit(1);

    if (!tracking) {
      return res.status(404).json({ error: "tracking_not_found", message: "Tracking job not found or not accessible" });
    }

    // Pre-insert idempotency check
    if (idempotencyKey) {
      const [existing] = await db
        .select({
          id: shipmentTrackingEventsTable.id,
          shipmentTrackingId: shipmentTrackingEventsTable.shipmentTrackingId,
          eventStatus: shipmentTrackingEventsTable.eventStatus,
          eventDescription: shipmentTrackingEventsTable.eventDescription,
          eventLocation: shipmentTrackingEventsTable.eventLocation,
          occurredAt: shipmentTrackingEventsTable.occurredAt,
          idempotencyKey: shipmentTrackingEventsTable.idempotencyKey,
        })
        .from(shipmentTrackingEventsTable)
        .where(
          and(
            eq(shipmentTrackingEventsTable.shipmentTrackingId, trackingId),
            eq(shipmentTrackingEventsTable.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(200).json({
          event: {
            eventId: existing.id,
            trackingId: existing.shipmentTrackingId,
            eventStatus: existing.eventStatus,
            eventDescription: existing.eventDescription ?? null,
            eventLocation: existing.eventLocation ?? null,
            occurredAt: existing.occurredAt,
            idempotencyKey: existing.idempotencyKey ?? null,
          },
          idempotent: true,
        });
      }
    }

    // Insert event
    try {
      const [inserted] = await db
        .insert(shipmentTrackingEventsTable)
        .values({
          shipmentTrackingId: trackingId,
          eventStatus,
          eventDescription: typeof body.eventDescription === "string" ? body.eventDescription : null,
          eventLocation: typeof body.eventLocation === "string" ? body.eventLocation : null,
          occurredAt,
          rawData: sanitizedPayload,
          idempotencyKey,
        })
        .returning();

      return res.status(201).json({
        event: {
          eventId: inserted.id,
          trackingId: inserted.shipmentTrackingId,
          eventStatus: inserted.eventStatus,
          eventDescription: inserted.eventDescription ?? null,
          eventLocation: inserted.eventLocation ?? null,
          occurredAt: inserted.occurredAt,
          idempotencyKey: inserted.idempotencyKey ?? null,
        },
        idempotent: false,
      });
    } catch (insertErr: any) {
      // Handle unique constraint violation — race condition with concurrent identical key
      if (insertErr?.code === "23505" && idempotencyKey) {
        const [existing] = await db
          .select({
            id: shipmentTrackingEventsTable.id,
            shipmentTrackingId: shipmentTrackingEventsTable.shipmentTrackingId,
            eventStatus: shipmentTrackingEventsTable.eventStatus,
            eventDescription: shipmentTrackingEventsTable.eventDescription,
            eventLocation: shipmentTrackingEventsTable.eventLocation,
            occurredAt: shipmentTrackingEventsTable.occurredAt,
            idempotencyKey: shipmentTrackingEventsTable.idempotencyKey,
          })
          .from(shipmentTrackingEventsTable)
          .where(
            and(
              eq(shipmentTrackingEventsTable.shipmentTrackingId, trackingId),
              eq(shipmentTrackingEventsTable.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);

        if (existing) {
          return res.status(200).json({
            event: {
              eventId: existing.id,
              trackingId: existing.shipmentTrackingId,
              eventStatus: existing.eventStatus,
              eventDescription: existing.eventDescription ?? null,
              eventLocation: existing.eventLocation ?? null,
              occurredAt: existing.occurredAt,
              idempotencyKey: existing.idempotencyKey ?? null,
            },
            idempotent: true,
          });
        }
      }
      logger.error({ err: insertErr }, "agent_shipment_event_failed");
      return res.status(500).json({
        error: "agent_shipment_event_failed",
        message: "Failed to insert shipment event",
      });
    }
  } catch (err) {
    logger.error({ err }, "agent_shipment_event_failed");
    return res.status(500).json({
      error: "agent_shipment_event_failed",
      message: "Failed to insert shipment event",
    });
  }
});

router.patch("/shipment-status", agentTokenAuth, async (req: any, res: any) => {
  try {
    const { storeId } = res.locals.agentToken as AgentTokenLocals;
    const body = req.body ?? {};

    // Validate trackingId
    const rawTrackingId = body.trackingId;
    const trackingId = rawTrackingId !== undefined ? Number(rawTrackingId) : NaN;
    if (!Number.isInteger(trackingId) || trackingId <= 0) {
      return res.status(400).json({
        error: "invalid_tracking_id",
        message: "trackingId is required and must be a positive integer",
      });
    }

    // Validate trackingStatus (required)
    const trackingStatus = typeof body.trackingStatus === "string" ? body.trackingStatus : "";
    if (!VALID_TRACKING_STATUSES.has(trackingStatus)) {
      return res.status(400).json({
        error: "invalid_tracking_status",
        message: `trackingStatus must be one of: ${[...VALID_TRACKING_STATUSES].join(", ")}`,
      });
    }

    // Validate latestEventStatus (optional)
    let latestEventStatus: string | undefined;
    if (body.latestEventStatus !== undefined) {
      const les = typeof body.latestEventStatus === "string" ? body.latestEventStatus : "";
      if (!VALID_EVENT_STATUSES.has(les)) {
        return res.status(400).json({
          error: "invalid_event_status",
          message: `latestEventStatus must be one of: ${[...VALID_EVENT_STATUSES].join(", ")}`,
        });
      }
      latestEventStatus = les;
    }

    // Parse latestEventAt (optional)
    let latestEventAt: Date | undefined;
    if (body.latestEventAt !== undefined) {
      const d = new Date(body.latestEventAt as string);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: "invalid_latest_event_at",
          message: "latestEventAt must be a valid ISO date string",
        });
      }
      latestEventAt = d;
    }

    // Parse lastCheckedAt (optional)
    let lastCheckedAt: Date | undefined;
    if (body.lastCheckedAt !== undefined) {
      const d = new Date(body.lastCheckedAt as string);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: "invalid_last_checked_at",
          message: "lastCheckedAt must be a valid ISO date string",
        });
      }
      lastCheckedAt = d;
    }

    // Parse nextCheckAt (optional)
    let nextCheckAt: Date | undefined;
    if (body.nextCheckAt !== undefined) {
      const d = new Date(body.nextCheckAt as string);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: "invalid_next_check_at",
          message: "nextCheckAt must be a valid ISO date string",
        });
      }
      nextCheckAt = d;
    }

    // Validate failureCount (optional)
    let failureCount: number | undefined;
    if (body.failureCount !== undefined) {
      const fc = Number(body.failureCount);
      if (!Number.isInteger(fc) || fc < 0) {
        return res.status(400).json({
          error: "invalid_failure_count",
          message: "failureCount must be a non-negative integer",
        });
      }
      failureCount = fc;
    }

    // Verify ownership: tracking must belong to this store and be active
    const [tracking] = await db
      .select({ trackingId: shipmentTrackingsTable.id })
      .from(shipmentTrackingsTable)
      .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
      .where(
        and(
          eq(shipmentTrackingsTable.id, trackingId),
          eq(ordersTable.storeId, storeId),
          eq(shipmentTrackingsTable.isActive, true),
        ),
      )
      .limit(1);

    if (!tracking) {
      return res.status(404).json({ error: "tracking_not_found", message: "Tracking job not found or not accessible" });
    }

    // Build update values — only include fields provided in the request
    const setValues: Record<string, unknown> = { trackingStatus, updatedAt: new Date() };
    if (latestEventStatus !== undefined) setValues.latestEventStatus = latestEventStatus;
    if (body.latestEventDescription !== undefined) {
      setValues.latestEventDescription = typeof body.latestEventDescription === "string" ? body.latestEventDescription : null;
    }
    if (latestEventAt !== undefined) setValues.latestEventAt = latestEventAt;
    if (lastCheckedAt !== undefined) setValues.lastCheckedAt = lastCheckedAt;
    if (nextCheckAt !== undefined) setValues.nextCheckAt = nextCheckAt;
    if (failureCount !== undefined) setValues.failureCount = failureCount;

    const [updated] = await db
      .update(shipmentTrackingsTable)
      .set(setValues as any)
      .where(eq(shipmentTrackingsTable.id, trackingId))
      .returning();

    return res.status(200).json({
      tracking: {
        trackingId: updated.id,
        trackingStatus: updated.trackingStatus,
        latestEventStatus: updated.latestEventStatus ?? null,
        latestEventDescription: updated.latestEventDescription ?? null,
        latestEventAt: updated.latestEventAt ?? null,
        lastCheckedAt: updated.lastCheckedAt ?? null,
        nextCheckAt: updated.nextCheckAt ?? null,
        failureCount: updated.failureCount,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    logger.error({ err }, "agent_shipment_status_failed");
    return res.status(500).json({
      error: "agent_shipment_status_failed",
      message: "Failed to update shipment status",
    });
  }
});

router.post("/run-log", agentTokenAuth, (_req, res) => {
  res.status(501).json(NOT_IMPLEMENTED);
});

export default router;
