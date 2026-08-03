import { and, eq, sql } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  ordersTable,
  shipmentTrackingEventsTable,
  shipmentTrackingsTable,
} from "@workspace/db";

import type { NormalizedTrackingStatus } from "../adapters/types.ts";
import { toTrackingStatus } from "./familyMartTrackingWorker.ts";
import {
  TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN,
  TRACKING_WRITE_COMPLETED_AUDIT_ACTION,
  type TrackingWorkerPhase2CommitContext,
  type TrackingWorkerPhase2Job,
  type TrackingWorkerPhase2Preview,
} from "./trackingWorkerPhase2.ts";

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isTerminalStatus(status: NormalizedTrackingStatus): boolean {
  return (
    status === "picked_up" || status === "delivered" || status === "returned"
  );
}

export interface TrackingWorkerPhase2OwnedRow {
  trackingId: number;
  orderId: number;
  storeId: number;
  provider: string;
  trackingCode: string;
  isActive: boolean;
}

export function isTrackingWorkerPhase2OwnedRow(
  job: TrackingWorkerPhase2Job,
  row: TrackingWorkerPhase2OwnedRow,
): boolean {
  return (
    row.trackingId === job.trackingId &&
    row.orderId === job.orderId &&
    row.storeId === job.storeId &&
    row.provider === job.provider &&
    row.trackingCode === job.trackingCode &&
    row.isActive
  );
}

export async function commitTrackingWorkerPhase2Preview(
  job: TrackingWorkerPhase2Job,
  preview: TrackingWorkerPhase2Preview,
  context: TrackingWorkerPhase2CommitContext,
  now: Date = new Date(),
): Promise<{ insertedEventCount: number }> {
  if (
    preview.payload.events.length !== preview.expectedEventCount ||
    preview.payload.events.length > TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN
  ) {
    throw new Error("TRACKING_PHASE2_PAYLOAD_EVENT_COUNT_INVALID");
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(221102, ${job.trackingId})`,
    );

    const [row] = await tx
      .select({
        trackingId: shipmentTrackingsTable.id,
        orderId: shipmentTrackingsTable.orderId,
        storeId: ordersTable.storeId,
        provider: shipmentTrackingsTable.trackingProvider,
        trackingCode: shipmentTrackingsTable.trackingCode,
        isActive: shipmentTrackingsTable.isActive,
      })
      .from(shipmentTrackingsTable)
      .innerJoin(
        ordersTable,
        eq(shipmentTrackingsTable.orderId, ordersTable.id),
      )
      .where(
        and(
          eq(shipmentTrackingsTable.id, job.trackingId),
          eq(shipmentTrackingsTable.orderId, job.orderId),
          eq(ordersTable.storeId, job.storeId),
          eq(shipmentTrackingsTable.trackingProvider, job.provider),
          eq(shipmentTrackingsTable.trackingCode, job.trackingCode),
          eq(shipmentTrackingsTable.isActive, true),
        ),
      )
      .limit(1);

    if (!row || !isTrackingWorkerPhase2OwnedRow(job, row)) {
      throw new Error("TRACKING_PHASE2_OWNERSHIP_MISMATCH");
    }

    const normalizedStatus = preview.payload
      .normalizedStatus as NormalizedTrackingStatus;
    const latestEventAt = preview.payload.latestEventAt
      ? new Date(preview.payload.latestEventAt)
      : null;
    if (latestEventAt && Number.isNaN(latestEventAt.getTime())) {
      throw new Error("TRACKING_PHASE2_LATEST_EVENT_AT_INVALID");
    }

    const updated = await tx
      .update(shipmentTrackingsTable)
      .set({
        trackingStatus: toTrackingStatus(normalizedStatus),
        latestEventStatus: normalizedStatus,
        latestEventDescription: preview.payload.latestStatusText,
        latestEventAt,
        lastCheckedAt: now,
        nextCheckAt: isTerminalStatus(normalizedStatus)
          ? null
          : new Date(now.getTime() + RECHECK_INTERVAL_MS),
        failureCount: 0,
        checkError: null,
      })
      .where(
        and(
          eq(shipmentTrackingsTable.id, job.trackingId),
          eq(shipmentTrackingsTable.orderId, job.orderId),
          eq(shipmentTrackingsTable.isActive, true),
          eq(shipmentTrackingsTable.trackingProvider, job.provider),
          eq(shipmentTrackingsTable.trackingCode, job.trackingCode),
        ),
      )
      .returning({ id: shipmentTrackingsTable.id });
    if (updated.length !== 1)
      throw new Error("TRACKING_PHASE2_UPDATE_SCOPE_MISMATCH");

    let insertedEventCount = 0;
    if (preview.payload.events.length > 0) {
      const inserted = await tx
        .insert(shipmentTrackingEventsTable)
        .values(
          preview.payload.events.map((event) => ({
            shipmentTrackingId: job.trackingId,
            eventStatus: event.eventStatus,
            eventDescription: event.eventDescription,
            eventLocation: event.eventLocation,
            occurredAt: new Date(event.occurredAt),
            rawData: event.rawData,
            idempotencyKey: event.idempotencyKey,
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

    await tx.insert(auditLogsTable).values({
      storeId: job.storeId,
      actor: "tracking-worker",
      action: TRACKING_WRITE_COMPLETED_AUDIT_ACTION,
      target: `tracking-run:${context.runId}:job-${context.jobIndex + 1}-of-${context.totalJobs}:inserted-${insertedEventCount}`,
    });

    return { insertedEventCount };
  });
}
