import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillPendingOrderProfitSnapshot,
  calculateOrderProfitSnapshot,
  createInitialOrderProfitSnapshot,
} from "./orderProfitSnapshot.ts";

const product = { tripRouteId: 5 };
const trip = { id: 2, exchangeRate: "0.199" };
const route = {
  id: 5,
  tripId: 2,
  estQty: 160,
  trainJpy: "0",
  fuelJpy: "3515",
  parkingJpy: "2100",
  etcJpy: "4800",
  cardboardJpy: "1360",
  shippingJpy: "6136",
  fee1_5PctOverride: null,
  fee1_5PctIsOverridden: false,
  totalJpyOverride: null,
  totalJpyIsOverridden: false,
  domesticPerItemOverride: null,
  domesticPerItemIsOverridden: false,
  transportPerItemOverride: null,
  transportPerItemIsOverridden: false,
  finalCostPerItemOverride: null,
  finalCostPerItemIsOverridden: false,
};

function input(overrides = {}) {
  return {
    unitPriceTwd: "800",
    costJpy: "2970",
    storePurchaseExchangeRate: "0.199",
    isTransportCostExempt: false,
    transport: { product, route, trip },
    ...overrides,
  };
}

test("order-time 小樽 snapshot captures the approved exact chain at 12 decimal places", () => {
  // Independent fixture: 2970 × 0.199 = 591.03;
  // 800 - 591.03 - 22.4166535 = 186.5533465; full profit = 208.97.
  assert.deepEqual(calculateOrderProfitSnapshot(input()), {
    profitSnapshotCostJpy: "2970.000000000000",
    profitSnapshotExchangeRate: "0.199000000000",
    profitSnapshotProductCostTwd: "591.030000000000",
    profitSnapshotTransportCostTwd: "22.416653500000",
    profitSnapshotUnitProfitTwd: "186.553346500000",
    profitSnapshotFullUnitProfitTwd: "208.970000000000",
    profitSnapshotStatus: "captured",
  });
});

test("missing cost is captured as pending without silently writing zero", () => {
  const capturedAt = new Date("2026-07-15T01:00:00.000Z");
  assert.deepEqual(createInitialOrderProfitSnapshot(input({ costJpy: null }), capturedAt), {
    profitSnapshotCostJpy: null,
    profitSnapshotExchangeRate: "0.199000000000",
    profitSnapshotProductCostTwd: null,
    profitSnapshotTransportCostTwd: null,
    profitSnapshotUnitProfitTwd: null,
    profitSnapshotFullUnitProfitTwd: null,
    profitSnapshotStatus: "pending",
    profitSnapshotCapturedAt: capturedAt,
    profitSnapshotBackfilledAt: null,
  });
});

test("transport-exempt snapshot stores zero transport with an explicit exempt status", () => {
  const snapshot = calculateOrderProfitSnapshot(input({
    unitPriceTwd: "1900",
    costJpy: "8000",
    storePurchaseExchangeRate: "0.21",
    isTransportCostExempt: true,
    transport: { product: { tripRouteId: null }, route: null, trip: null },
  }));

  assert.equal(snapshot.profitSnapshotStatus, "exempt");
  assert.equal(snapshot.profitSnapshotTransportCostTwd, "0.000000000000");
  assert.equal(snapshot.profitSnapshotUnitProfitTwd, "220.000000000000");
  assert.equal(snapshot.profitSnapshotFullUnitProfitTwd, "220.000000000000");
});

test("pending snapshot can be backfilled once and is then permanently rejected", () => {
  const backfilledAt = new Date("2026-07-15T02:00:00.000Z");
  const first = backfillPendingOrderProfitSnapshot("pending", input(), backfilledAt);
  assert.equal(first.outcome, "backfilled");
  assert.equal(first.values.profitSnapshotUnitProfitTwd, "186.553346500000");
  assert.equal(first.profitSnapshotBackfilledAt, backfilledAt);

  const second = backfillPendingOrderProfitSnapshot(
    first.values.profitSnapshotStatus,
    input({ storePurchaseExchangeRate: "0.21" }),
    new Date("2026-07-15T03:00:00.000Z"),
  );
  assert.deepEqual(second, { outcome: "rejected", reason: "snapshot_not_pending" });
});

test("legacy null snapshot can be backfilled once using current cost data", () => {
  const backfilledAt = new Date("2026-07-16T03:00:00.000Z");
  const first = backfillPendingOrderProfitSnapshot(null, input(), backfilledAt);
  assert.equal(first.outcome, "backfilled");
  assert.equal(first.values.profitSnapshotUnitProfitTwd, "186.553346500000");
  assert.equal(first.profitSnapshotBackfilledAt, backfilledAt);

  const second = backfillPendingOrderProfitSnapshot(
    first.values.profitSnapshotStatus,
    input(),
    new Date("2026-07-16T04:00:00.000Z"),
  );
  assert.deepEqual(second, { outcome: "rejected", reason: "snapshot_not_pending" });
});

test("captured order stays frozen when the current store rate changes", () => {
  const captured = calculateOrderProfitSnapshot(input());
  const currentEstimate = calculateOrderProfitSnapshot(input({
    storePurchaseExchangeRate: "0.21",
  }));

  assert.equal(captured.profitSnapshotProductCostTwd, "591.030000000000");
  assert.equal(captured.profitSnapshotUnitProfitTwd, "186.553346500000");
  assert.equal(currentEstimate.profitSnapshotProductCostTwd, "623.700000000000");
  assert.equal(currentEstimate.profitSnapshotUnitProfitTwd, "153.883346500000");
  assert.equal(captured.profitSnapshotUnitProfitTwd, "186.553346500000");
});

test("Q69 captures a repeating decimal at 12 places with half-up rounding", () => {
  // est_qty=3 with manually entered ETC=90; train=1; transport=(90+1)÷3=91/3.
  // unit profit=100-91/3=209/3=69.666..., so the 13th digit rounds the 12th up.
  const repeatingRoute = {
    ...route,
    estQty: 3,
    etcJpy: "90",
    trainJpy: "1",
    fuelJpy: "0",
    parkingJpy: "0",
    cardboardJpy: "0",
    shippingJpy: "0",
  };
  const snapshot = calculateOrderProfitSnapshot(input({
    unitPriceTwd: "100",
    costJpy: "0",
    storePurchaseExchangeRate: "1",
    transport: {
      product,
      route: repeatingRoute,
      trip: { id: 2, exchangeRate: "1" },
    },
  }));

  assert.equal(snapshot.profitSnapshotTransportCostTwd, "30.333333333333");
  assert.equal(snapshot.profitSnapshotUnitProfitTwd, "69.666666666667");
  assert.equal(snapshot.profitSnapshotFullUnitProfitTwd, "100.000000000000");
});
