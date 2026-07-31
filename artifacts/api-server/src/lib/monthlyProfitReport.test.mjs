import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTaipeiMonthRange,
  summarizeMonthlyOrderProfits,
} from "./monthlyProfitReport.ts";

test("Taipei accounting month uses local midnight boundaries", () => {
  const july = parseTaipeiMonthRange("2026-07");
  assert.equal(july.start.toISOString(), "2026-06-30T16:00:00.000Z");
  assert.equal(july.end.toISOString(), "2026-07-31T16:00:00.000Z");

  const december = parseTaipeiMonthRange("2026-12");
  assert.equal(december.end.toISOString(), "2026-12-31T16:00:00.000Z");

  const leapFebruary = parseTaipeiMonthRange("2024-02");
  assert.equal(leapFebruary.start.toISOString(), "2024-01-31T16:00:00.000Z");
  assert.equal(leapFebruary.end.toISOString(), "2024-02-29T16:00:00.000Z");
});

test("monthly report delegates exact snapshot aggregation and counts orders", () => {
  const report = summarizeMonthlyOrderProfits("2026-07", [
    {
      quantity: 3,
      items: null,
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "186.553346500000",
    },
    {
      quantity: 1,
      items: [{ productId: 2 }],
      cartProfitSnapshotStatus: "captured",
      cartProfitSnapshotTotalTwd: "999.660039500000",
    },
    {
      quantity: 1,
      items: null,
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "-1680.000000000000",
    },
    { quantity: 1, items: null, profitSnapshotStatus: "pending" },
  ]);

  // 186.5533465 x 3 + 999.6600395 - 1680 = -120.679921.
  assert.deepEqual(report, {
    month: "2026-07",
    timeZone: "Asia/Taipei",
    orderCount: 4,
    capturedProfitSubtotalTwd: "-120.679921000000",
    capturedProfitSubtotalDisplayTwd: "-121",
    pendingOrderCount: 1,
    missingSnapshotOrderCount: 0,
  });
});

test("invalid month input fails closed", () => {
  assert.throws(() => parseTaipeiMonthRange("2026-13"), RangeError);
  assert.throws(() => parseTaipeiMonthRange("July 2026"), TypeError);
});

test("a month containing only pending snapshots counts them without inventing zero-cost orders", () => {
  const report = summarizeMonthlyOrderProfits("2026-07", [
    { quantity: 1, items: null, profitSnapshotStatus: "pending" },
    {
      quantity: 1,
      items: [{ productId: 1 }],
      cartProfitSnapshotStatus: "pending",
    },
  ]);

  assert.deepEqual(report, {
    month: "2026-07",
    timeZone: "Asia/Taipei",
    orderCount: 2,
    capturedProfitSubtotalTwd: "0.000000000000",
    capturedProfitSubtotalDisplayTwd: "0",
    pendingOrderCount: 2,
    missingSnapshotOrderCount: 0,
  });
});

test("a month containing only missing snapshots keeps a separate missing count", () => {
  const report = summarizeMonthlyOrderProfits("2026-07", [
    { quantity: 1, items: null, profitSnapshotStatus: null },
    {
      quantity: 1,
      items: [{ productId: 1 }],
      cartProfitSnapshotStatus: undefined,
    },
  ]);

  assert.deepEqual(report, {
    month: "2026-07",
    timeZone: "Asia/Taipei",
    orderCount: 2,
    capturedProfitSubtotalTwd: "0.000000000000",
    capturedProfitSubtotalDisplayTwd: "0",
    pendingOrderCount: 0,
    missingSnapshotOrderCount: 2,
  });
});

test("mixed captured, pending, and missing snapshots keep exact negative profit", () => {
  const report = summarizeMonthlyOrderProfits("2026-07", [
    {
      quantity: 2,
      items: null,
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "10.250000000000",
    },
    {
      quantity: 1,
      items: [{ productId: 1 }],
      cartProfitSnapshotStatus: "captured",
      cartProfitSnapshotTotalTwd: "-30.750000000000",
    },
    { quantity: 1, items: null, profitSnapshotStatus: "pending" },
    { quantity: 1, items: null, profitSnapshotStatus: null },
  ]);

  // 10.25 x 2 - 30.75 = -10.25.
  assert.deepEqual(report, {
    month: "2026-07",
    timeZone: "Asia/Taipei",
    orderCount: 4,
    capturedProfitSubtotalTwd: "-10.250000000000",
    capturedProfitSubtotalDisplayTwd: "-10",
    pendingOrderCount: 1,
    missingSnapshotOrderCount: 1,
  });
});
