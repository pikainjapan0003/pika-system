import assert from "node:assert/strict";
import test from "node:test";

import { summarizeOrderProfits } from "./orderProfitSummary.ts";

test("summary exactly adds single-item quantity profit and cart aggregate", () => {
  const summary = summarizeOrderProfits([
    {
      quantity: 3,
      items: null,
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "186.553346500000",
    },
    {
      quantity: 2,
      items: null,
      profitSnapshotStatus: "exempt",
      profitSnapshotUnitProfitTwd: "220.000000000000",
    },
    {
      quantity: 1,
      items: [{ productId: 1 }, { productId: 2 }],
      cartProfitSnapshotStatus: "captured",
      cartProfitSnapshotTotalTwd: "999.660039500000",
    },
    { quantity: 1, items: null, profitSnapshotStatus: "pending" },
    { quantity: 1, items: null, profitSnapshotStatus: null },
    {
      quantity: 1,
      items: [{ productId: 3 }],
      cartProfitSnapshotStatus: "pending",
    },
    {
      quantity: 1,
      items: [{ productId: 4 }],
      cartProfitSnapshotStatus: null,
    },
  ]);

  // 186.5533465 × 3 + 220 × 2 + 999.6600395 = 1999.320079.
  assert.deepEqual(summary, {
    capturedProfitSubtotalTwd: "1999.320079000000",
    capturedProfitSubtotalDisplayTwd: "1999",
    pendingOrderCount: 2,
    missingSnapshotOrderCount: 2,
  });
});

test("summary keeps negative profit and rounds only the display value", () => {
  const summary = summarizeOrderProfits([
    {
      quantity: 1,
      items: null,
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "-28.500000000000",
    },
  ]);

  assert.equal(summary.capturedProfitSubtotalTwd, "-28.500000000000");
  assert.equal(summary.capturedProfitSubtotalDisplayTwd, "-29");
});
