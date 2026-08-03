import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  ordersTable,
  pool,
  productsTable,
  shipmentTrackingEventsTable,
  shipmentTrackingsTable,
  storesTable,
} from "@workspace/db";

import { commitTrackingWorkerPhase2Preview } from "./lib/logistics/workers/trackingWorkerPhase2Commit.ts";
import {
  TrackingWorkerPhase2LeaseUnavailableError,
  withTrackingWorkerPhase2Lease,
} from "./lib/logistics/workers/trackingWorkerPhase2Runtime.ts";

const marker = `b22-phase2-${Date.now()}`;
const storeIds = [];
const productIds = [];
const orderIds = [];
const trackingIds = [];

function preview(overrides = {}) {
  return {
    previewHash: "opaque-signed-token",
    expectedEventCount: 1,
    latestStatusText: "運送中",
    latestEventAt: "2026-08-03T00:00:00.000Z",
    normalizedStatus: "in_transit",
    payloadDigest: "opaque-payload-digest",
    payload: {
      normalizedStatus: "in_transit",
      latestStatusText: "運送中",
      latestEventAt: "2026-08-03T00:00:00.000Z",
      events: [
        {
          eventStatus: "in_transit",
          eventDescription: "運送中",
          eventLocation: "假資料處理中心",
          occurredAt: "2026-08-03T00:00:00.000Z",
          rawData: { fixture: true },
          idempotencyKey: `${marker}:event`,
        },
      ],
    },
    ...overrides,
  };
}

before(async () => {
  for (const suffix of ["a", "b"]) {
    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: `${marker}-merchant-${suffix}`,
        name: `假店鋪 ${suffix}`,
        slug: `${marker}-store-${suffix}`,
      })
      .returning({ id: storesTable.id });
    storeIds.push(store.id);

    const [product] = await db
      .insert(productsTable)
      .values({
        storeId: store.id,
        name: `假商品 ${suffix}`,
        price: "100",
        shareToken: `${marker}-product-${suffix}`,
      })
      .returning({ id: productsTable.id });
    productIds.push(product.id);
  }

  for (const [index, suffix] of ["ok", "rollback", "inactive"].entries()) {
    const [order] = await db
      .insert(ordersTable)
      .values({
        productId: productIds[0],
        storeId: storeIds[0],
        productName: `假商品 ${suffix}`,
        publicToken: `${marker}-order-${suffix}`,
        buyerName: "測試客",
        buyerPhone: "0900000000",
        pickupMethod: "測試取貨",
        quantity: 1,
        unitPrice: "100",
        shippingFee: "0",
        totalPrice: "100",
      })
      .returning({ id: ordersTable.id });
    orderIds.push(order.id);

    const [tracking] = await db
      .insert(shipmentTrackingsTable)
      .values({
        orderId: order.id,
        trackingCode: `${marker}-tracking-${index}`,
        trackingProvider: "postoffice",
        isActive: suffix !== "inactive",
      })
      .returning({ id: shipmentTrackingsTable.id });
    trackingIds.push(tracking.id);
  }
});

after(async () => {
  if (storeIds.length > 0) {
    await db
      .delete(auditLogsTable)
      .where(inArray(auditLogsTable.storeId, storeIds));
  }
  if (trackingIds.length > 0) {
    await db
      .delete(shipmentTrackingEventsTable)
      .where(
        inArray(shipmentTrackingEventsTable.shipmentTrackingId, trackingIds),
      );
    await db
      .delete(shipmentTrackingsTable)
      .where(inArray(shipmentTrackingsTable.id, trackingIds));
  }
  if (orderIds.length > 0) {
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  }
  if (productIds.length > 0) {
    await db.delete(productsTable).where(inArray(productsTable.id, productIds));
  }
  if (storeIds.length > 0) {
    await db.delete(storesTable).where(inArray(storesTable.id, storeIds));
  }
  await pool.end();
});

test("verified Phase 2 payload commits snapshot, event, and audit atomically", async () => {
  const job = {
    storeId: storeIds[0],
    orderId: orderIds[0],
    trackingId: trackingIds[0],
    provider: "postoffice",
    trackingCode: `${marker}-tracking-0`,
  };
  const result = await commitTrackingWorkerPhase2Preview(job, preview(), {
    runId: "opaque-run-id",
    jobIndex: 0,
    totalJobs: 1,
  });
  assert.equal(result.insertedEventCount, 1);

  const [tracking] = await db
    .select()
    .from(shipmentTrackingsTable)
    .where(eq(shipmentTrackingsTable.id, trackingIds[0]));
  assert.equal(tracking.latestEventDescription, "運送中");
  const events = await db
    .select()
    .from(shipmentTrackingEventsTable)
    .where(eq(shipmentTrackingEventsTable.shipmentTrackingId, trackingIds[0]));
  assert.equal(events.length, 1);
  const audits = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.storeId, storeIds[0]));
  assert.equal(
    audits.some((row) => row.action === "tracking_write_completed"),
    true,
  );
});

test("commit rejects cross-store and inactive jobs before writes", async () => {
  const baseJob = {
    storeId: storeIds[1],
    orderId: orderIds[0],
    trackingId: trackingIds[0],
    provider: "postoffice",
    trackingCode: `${marker}-tracking-0`,
  };
  await assert.rejects(
    commitTrackingWorkerPhase2Preview(baseJob, preview(), {
      runId: "cross-store",
      jobIndex: 0,
      totalJobs: 1,
    }),
    /TRACKING_PHASE2_OWNERSHIP_MISMATCH/,
  );
  await assert.rejects(
    commitTrackingWorkerPhase2Preview(
      {
        ...baseJob,
        storeId: storeIds[0],
        orderId: orderIds[2],
        trackingId: trackingIds[2],
        trackingCode: `${marker}-tracking-2`,
      },
      preview(),
      { runId: "inactive", jobIndex: 0, totalJobs: 1 },
    ),
    /TRACKING_PHASE2_OWNERSHIP_MISMATCH/,
  );
});

test("invalid event rolls back the snapshot and completed audit", async () => {
  const job = {
    storeId: storeIds[0],
    orderId: orderIds[1],
    trackingId: trackingIds[1],
    provider: "postoffice",
    trackingCode: `${marker}-tracking-1`,
  };
  const invalid = preview({
    payload: {
      ...preview().payload,
      events: [{ ...preview().payload.events[0], occurredAt: "not-a-date" }],
    },
  });
  await assert.rejects(
    commitTrackingWorkerPhase2Preview(job, invalid, {
      runId: "rollback-run",
      jobIndex: 0,
      totalJobs: 1,
    }),
  );
  const [tracking] = await db
    .select()
    .from(shipmentTrackingsTable)
    .where(eq(shipmentTrackingsTable.id, trackingIds[1]));
  assert.equal(tracking.latestEventDescription, null);
  const events = await db
    .select()
    .from(shipmentTrackingEventsTable)
    .where(eq(shipmentTrackingEventsTable.shipmentTrackingId, trackingIds[1]));
  assert.equal(events.length, 0);
  const audits = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.storeId, storeIds[0]));
  assert.equal(
    audits.some((row) => row.target.includes("rollback-run")),
    false,
  );
});

test("database advisory lease refuses a concurrent Phase 2 run", async () => {
  await withTrackingWorkerPhase2Lease(async () => {
    await assert.rejects(
      withTrackingWorkerPhase2Lease(async () => undefined),
      TrackingWorkerPhase2LeaseUnavailableError,
    );
  });
});

test("commit rejects an actual payload over the 50-event gate", async () => {
  const payload = preview().payload;
  const oversized = preview({
    expectedEventCount: 51,
    payload: {
      ...payload,
      events: Array.from({ length: 51 }, (_, index) => ({
        ...payload.events[0],
        idempotencyKey: `${marker}:oversized:${index}`,
      })),
    },
  });
  await assert.rejects(
    commitTrackingWorkerPhase2Preview(
      {
        storeId: storeIds[0],
        orderId: orderIds[1],
        trackingId: trackingIds[1],
        provider: "postoffice",
        trackingCode: `${marker}-tracking-1`,
      },
      oversized,
      { runId: "oversized", jobIndex: 0, totalJobs: 1 },
    ),
    /TRACKING_PHASE2_PAYLOAD_EVENT_COUNT_INVALID/,
  );
});
