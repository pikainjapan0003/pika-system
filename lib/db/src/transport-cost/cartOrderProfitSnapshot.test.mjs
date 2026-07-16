import assert from "node:assert/strict";
import test from "node:test";

import {
  backfillPendingCartOrderProfitSnapshot,
  createCartOrderProfitSnapshot,
} from "./cartOrderProfitSnapshot.ts";

const emptyTransport = {
  product: { tripRouteId: null },
  route: null,
  trip: null,
};

const exemptInput = (rate = "0.21") => ({
  unitPriceTwd: "1900",
  costJpy: "8000",
  storePurchaseExchangeRate: rate,
  isTransportCostExempt: true,
  transport: emptyTransport,
});

const allocatedInput = {
  unitPriceTwd: "800",
  costJpy: "2970",
  storePurchaseExchangeRate: "0.199",
  isTransportCostExempt: false,
  transport: {
    product: { tripRouteId: 5 },
    route: {
      id: 5,
      tripId: 7,
      estQty: "160",
      trainJpy: "0",
      fuelJpy: "3515",
      parkingJpy: "2100",
      etcJpy: "4800",
      cardboardJpy: "1360",
      shippingJpy: "6136",
      parcelCount: "4",
    },
    trip: { id: 7, exchangeRate: "0.199" },
  },
};

test("mixed exempt and allocated items capture the approved exact quantity total", () => {
  const captured = createCartOrderProfitSnapshot(
    [
      { item: { productId: 1 }, quantity: 2, snapshotInput: exemptInput() },
      { item: { productId: 2 }, quantity: 3, snapshotInput: allocatedInput },
    ],
    new Date("2026-07-16T00:00:00.000Z"),
  );

  // 220 × 2 + 186.5533465 × 3 = 999.6600395 (expectation hand-calculated before execution).
  assert.equal(captured.cartProfitSnapshotStatus, "captured");
  assert.equal(captured.cartProfitSnapshotTotalTwd, "999.660039500000");
  assert.equal(captured.items[0].profitSnapshot.profitSnapshotStatus, "exempt");
  assert.equal(
    captured.items[0].profitSnapshot.profitSnapshotTransportCostTwd,
    "0.000000000000",
  );
  assert.equal(
    captured.items[1].profitSnapshot.profitSnapshotStatus,
    "captured",
  );
});

test("one pending item keeps the whole cart pending without silently writing zero", () => {
  const pending = createCartOrderProfitSnapshot(
    [
      { item: { productId: 1 }, quantity: 2, snapshotInput: exemptInput() },
      {
        item: { productId: 2 },
        quantity: 1,
        snapshotInput: { ...allocatedInput, costJpy: null },
      },
    ],
    new Date("2026-07-16T00:00:00.000Z"),
  );

  assert.equal(pending.cartProfitSnapshotStatus, "pending");
  assert.equal(pending.cartProfitSnapshotTotalTwd, null);
  assert.equal(pending.items[1].profitSnapshot.profitSnapshotStatus, "pending");
  assert.equal(
    pending.items[1].profitSnapshot.profitSnapshotUnitProfitTwd,
    null,
  );
});

test("captured cart stays frozen while a new calculation reflects a changed store rate", () => {
  const capturedAt = new Date("2026-07-16T00:00:00.000Z");
  const oldCart = createCartOrderProfitSnapshot(
    [
      {
        item: { productId: 1 },
        quantity: 2,
        snapshotInput: exemptInput("0.21"),
      },
    ],
    capturedAt,
  );
  const newCart = createCartOrderProfitSnapshot(
    [
      {
        item: { productId: 1 },
        quantity: 2,
        snapshotInput: exemptInput("0.22"),
      },
    ],
    capturedAt,
  );

  assert.equal(oldCart.cartProfitSnapshotTotalTwd, "440.000000000000");
  assert.equal(newCart.cartProfitSnapshotTotalTwd, "280.000000000000");
  assert.equal(oldCart.cartProfitSnapshotTotalTwd, "440.000000000000");
});

test("pending cart can be backfilled once and a captured cart rejects a second backfill", () => {
  const at = new Date("2026-07-16T02:00:00.000Z");
  const readyItems = [
    {
      item: { productId: 1 },
      quantity: 2,
      snapshotInput: exemptInput("0.21"),
    },
  ];

  const first = backfillPendingCartOrderProfitSnapshot(
    "pending",
    readyItems,
    at,
  );
  assert.equal(first.outcome, "backfilled");
  assert.equal(first.snapshot.cartProfitSnapshotTotalTwd, "440.000000000000");
  assert.equal(
    first.snapshot.items[0].profitSnapshot.profitSnapshotBackfilledAt,
    at.toISOString(),
  );

  const second = backfillPendingCartOrderProfitSnapshot(
    "captured",
    readyItems,
    at,
  );
  assert.deepEqual(second, {
    outcome: "rejected",
    reason: "snapshot_not_pending",
  });
});

test("legacy cart with a null aggregate snapshot can be backfilled once", () => {
  const at = new Date("2026-07-16T05:00:00.000Z");
  const first = backfillPendingCartOrderProfitSnapshot(
    null,
    [{ item: { productId: 1 }, quantity: 1, snapshotInput: exemptInput() }],
    at,
  );
  assert.equal(first.outcome, "backfilled");
  assert.equal(first.snapshot.cartProfitSnapshotTotalTwd, "220.000000000000");

  const second = backfillPendingCartOrderProfitSnapshot(
    first.snapshot.cartProfitSnapshotStatus,
    [{ item: { productId: 1 }, quantity: 1, snapshotInput: exemptInput() }],
    at,
  );
  assert.deepEqual(second, {
    outcome: "rejected",
    reason: "snapshot_not_pending",
  });
});
