import assert from "node:assert/strict";
import test from "node:test";

import { formatOrderExportCsv } from "./orderExport.ts";

const fakeOrder = {
  id: 101,
  productName: "測試商品",
  buyerName: "王小明",
  buyerPhone: "0912345678",
  pickupMethod: "面交",
  quantity: 2,
  unitPrice: "800.00",
  totalPrice: "1600.00",
  paymentLast5: "12345",
  discountAmount: 0,
  discountNote: "聯絡 0912345678",
  status: "pending",
  specValues: { 顏色: "紅" },
  createdAt: new Date("2026-07-17T00:00:00.000Z"),
  profitSnapshotProductCostTwd: "591.030000000000",
  profitSnapshotTransportCostTwd: "22.416653500000",
  profitSnapshotUnitProfitTwd: "186.553346500000",
  profitSnapshotFullUnitProfitTwd: "208.970000000000",
  profitSnapshotStatus: "captured",
  cartProfitSnapshotTotalTwd: null,
  cartProfitSnapshotStatus: null,
};

test("masked order CSV hides buyer PII and preserves captured decimals", () => {
  const csv = formatOrderExportCsv([fakeOrder], "masked");
  assert.match(csv, /王\*明/);
  assert.match(csv, /0912\*\*\*678/);
  assert.doesNotMatch(csv, /王小明/);
  assert.doesNotMatch(csv, /0912345678/);
  assert.doesNotMatch(csv, /聯絡/);
  assert.match(csv, /186\.553346500000/);
  assert.match(csv, /22\.416653500000/);
});

test("pending snapshot exports 待確認 and never silently substitutes zero", () => {
  const csv = formatOrderExportCsv(
    [
      {
        ...fakeOrder,
        profitSnapshotProductCostTwd: null,
        profitSnapshotTransportCostTwd: null,
        profitSnapshotUnitProfitTwd: null,
        profitSnapshotFullUnitProfitTwd: null,
        profitSnapshotStatus: "pending",
      },
    ],
    "masked",
  );
  const line = csv.split("\r\n")[1];
  const cells = line.slice(1, -1).split('\",\"');
  assert.deepEqual(cells.slice(13, 18), Array(5).fill("待確認"));
  assert.equal(cells[18], "不適用（單品）");
  assert.doesNotMatch(line, /"0\.000000000000"/);
});

test("cart export uses only its captured aggregate snapshot", () => {
  const csv = formatOrderExportCsv(
    [
      {
        ...fakeOrder,
        profitSnapshotProductCostTwd: null,
        profitSnapshotTransportCostTwd: null,
        profitSnapshotUnitProfitTwd: null,
        profitSnapshotFullUnitProfitTwd: null,
        profitSnapshotStatus: null,
        cartProfitSnapshotTotalTwd: "512.250000000000",
        cartProfitSnapshotStatus: "captured",
      },
    ],
    "masked",
  );
  assert.match(csv, /512\.250000000000/);
  assert.match(csv, /不適用（購物車）/);
});
