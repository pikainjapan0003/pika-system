import assert from "node:assert/strict";
import test from "node:test";

import { formatCustomerOrderProfit } from "./customerDetail.ts";

test("customer history displays immutable single-item snapshot values", () => {
  assert.deepEqual(
    formatCustomerOrderProfit({
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "186.553346500000",
    }),
    {
      status: "captured",
      label: "定格單件毛利",
      amountTwd: "187",
      scope: "unit",
    },
  );
});

test("customer history preserves exempt and pending labels without silent zero", () => {
  assert.deepEqual(
    formatCustomerOrderProfit({
      profitSnapshotStatus: "exempt",
      profitSnapshotUnitProfitTwd: "220.000000000000",
    }),
    {
      status: "exempt",
      label: "免攤單件毛利",
      amountTwd: "220",
      scope: "unit",
    },
  );
  assert.deepEqual(
    formatCustomerOrderProfit({ profitSnapshotStatus: "pending" }),
    {
      status: "pending",
      label: "待確認",
      amountTwd: null,
      scope: "unit",
    },
  );
});

test("cart history uses the existing order aggregate snapshot", () => {
  assert.deepEqual(
    formatCustomerOrderProfit({
      cartProfitSnapshotStatus: "captured",
      cartProfitSnapshotTotalTwd: "123.500000000000",
    }),
    {
      status: "captured",
      label: "定格整單毛利",
      amountTwd: "124",
      scope: "order",
    },
  );
});

test("mixed customer history keeps single, cart, exempt, pending, and missing states distinct", () => {
  const displays = [
    {
      profitSnapshotStatus: "captured",
      profitSnapshotUnitProfitTwd: "10.4",
    },
    {
      cartProfitSnapshotStatus: "captured",
      cartProfitSnapshotTotalTwd: "20.5",
    },
    {
      profitSnapshotStatus: "exempt",
      profitSnapshotUnitProfitTwd: "30",
    },
    { cartProfitSnapshotStatus: "pending" },
    { profitSnapshotStatus: null },
  ].map(formatCustomerOrderProfit);

  assert.deepEqual(displays, [
    {
      status: "captured",
      label: "定格單件毛利",
      amountTwd: "10",
      scope: "unit",
    },
    {
      status: "captured",
      label: "定格整單毛利",
      amountTwd: "21",
      scope: "order",
    },
    {
      status: "exempt",
      label: "免攤單件毛利",
      amountTwd: "30",
      scope: "unit",
    },
    {
      status: "pending",
      label: "待確認",
      amountTwd: null,
      scope: "order",
    },
    {
      status: "missing",
      label: "尚無快照",
      amountTwd: null,
      scope: "unit",
    },
  ]);
});
