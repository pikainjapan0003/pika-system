import assert from "node:assert/strict";
import test from "node:test";

import { formatCustomerOrderProfit } from "./customerDetail.ts";

test("customer history displays immutable single-item snapshot values", () => {
  assert.deepEqual(formatCustomerOrderProfit({
    profitSnapshotStatus: "captured",
    profitSnapshotUnitProfitTwd: "186.553346500000",
  }), {
    status: "captured",
    label: "定格單件毛利",
    amountTwd: "187",
    scope: "unit",
  });
});

test("customer history preserves exempt and pending labels without silent zero", () => {
  assert.deepEqual(formatCustomerOrderProfit({
    profitSnapshotStatus: "exempt",
    profitSnapshotUnitProfitTwd: "220.000000000000",
  }), {
    status: "exempt",
    label: "免攤單件毛利",
    amountTwd: "220",
    scope: "unit",
  });
  assert.deepEqual(formatCustomerOrderProfit({ profitSnapshotStatus: "pending" }), {
    status: "pending",
    label: "待確認",
    amountTwd: null,
    scope: "unit",
  });
});

test("cart history uses the existing order aggregate snapshot", () => {
  assert.deepEqual(formatCustomerOrderProfit({
    cartProfitSnapshotStatus: "captured",
    cartProfitSnapshotTotalTwd: "123.500000000000",
  }), {
    status: "captured",
    label: "定格整單毛利",
    amountTwd: "124",
    scope: "order",
  });
});
