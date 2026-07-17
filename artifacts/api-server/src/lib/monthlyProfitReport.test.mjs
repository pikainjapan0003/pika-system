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
