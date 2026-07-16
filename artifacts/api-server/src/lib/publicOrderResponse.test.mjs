import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPublicOrderCreatedResponse,
  PUBLIC_ORDER_CREATED_RESPONSE_KEYS,
} from "./publicOrderResponse.ts";

test("created public order response contains exactly the approved allowlist", () => {
  const response = formatPublicOrderCreatedResponse({
    publicToken: "fake-public-token",
    productName: "假商品",
    quantity: 2,
    unitPrice: "100.00",
    shippingFee: "60.00",
    totalPrice: "200.00",
    pickupMethod: "7-11 取貨",
    specValues: { 顏色: "粉色" },
    status: "pending",
    cvsStoreId: "000001",
    cvsStoreName: "假門市",
    cvsStoreAddress: "測試縣測試區測試路1號",
    cvsStorePhone: "0200000000",
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    buyerName: "不得出現",
    buyerPhone: "0900000000",
    internalNote: "不得出現",
    profitSnapshotUnitProfitTwd: "999.000000000000",
  });

  assert.deepEqual(
    Object.keys(response).sort(),
    [...PUBLIC_ORDER_CREATED_RESPONSE_KEYS].sort(),
  );
  assert.equal(response.orderTotal, 260);
  assert.equal(response.statusLabel, "待確認");
});
