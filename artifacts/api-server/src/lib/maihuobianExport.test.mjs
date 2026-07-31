import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaihuobianExportPreview,
  parseMaihuobianDateRange,
} from "./maihuobianExport.ts";

const product = {
  id: 1,
  name: "BATCH-17 假商品",
  storageTempClass: "normal",
};

function fakeEligibleOrder(id) {
  return {
    id,
    productId: product.id,
    productName: product.name,
    buyerName: "王小明",
    buyerPhone: "0912345678",
    recipientName: "王小明",
    recipientPhone: "0912345678",
    cvsStoreId: "123456",
    pickupMethod: "7-11 取貨",
    status: "preparing",
    shippingStatus: "not_shipped",
    quantity: 1,
    totalPrice: "100.00",
    shippingFee: "60.00",
    createdAt: new Date("2026-07-19T04:00:00.000Z"),
    notes: null,
    items: null,
  };
}

test("Maihuobian export accepts exactly 500 eligible rows", () => {
  const preview = buildMaihuobianExportPreview(
    Array.from({ length: 500 }, (_, index) => fakeEligibleOrder(index + 1)),
    [product],
  );
  assert.equal(preview.eligibleCount, 500);
  assert.equal(preview.ineligibleCount, 0);
});

test("Maihuobian export rejects 501 eligible rows instead of truncating", () => {
  assert.throws(
    () =>
      buildMaihuobianExportPreview(
        Array.from({ length: 501 }, (_, index) => fakeEligibleOrder(index + 1)),
        [product],
      ),
    /單次最多匯出 500 筆/u,
  );
});

test("Maihuobian date range is an inclusive Taipei calendar range", () => {
  const range = parseMaihuobianDateRange("2026-07-19", "2026-07-19");
  assert.equal(range.start.toISOString(), "2026-07-18T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-07-19T16:00:00.000Z");
});
