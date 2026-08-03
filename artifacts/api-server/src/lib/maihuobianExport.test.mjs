import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaihuobianExportPreview,
  parseMaihuobianDateRange,
  toMaihuobianExportPreviewDto,
} from "./maihuobianExport.ts";

const product = {
  id: 1,
  name: "BATCH-17 假商品",
  storageTempClass: "normal",
};

function fakeEligibleOrder(id, pickupMethod = "7-11 賣貨便") {
  return {
    id,
    productId: product.id,
    productName: product.name,
    buyerName: "王小明",
    buyerPhone: "0912345678",
    recipientName: "王小明",
    recipientPhone: "0912345678",
    cvsStoreId: "123456",
    pickupMethod,
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

test("Maihuobian preview DTO exposes product summary without cleartext row fields", () => {
  const fullPreview = buildMaihuobianExportPreview(
    [fakeEligibleOrder(1)],
    [product],
  );
  const preview = toMaihuobianExportPreviewDto(fullPreview);

  assert.deepEqual(Object.keys(preview.eligible[0]).sort(), [
    "orderId",
    "productSummary",
  ]);
  assert.equal(JSON.stringify(preview).includes("0912345678"), false);
});

test("Maihuobian eligibility accepts only the exact sell便 pickup method", () => {
  const cases = [
    { pickupMethod: "7-11 賣貨便", eligible: true },
    { pickupMethod: "7-11 取貨（先付款）", eligible: false },
    { pickupMethod: "7-11 貨到付款", eligible: false },
    { pickupMethod: "全家取貨（先付款）", eligible: false },
  ];

  for (const [index, { pickupMethod, eligible }] of cases.entries()) {
    const preview = buildMaihuobianExportPreview(
      [fakeEligibleOrder(index + 1, pickupMethod)],
      [product],
    );
    assert.equal(preview.eligibleCount, eligible ? 1 : 0, pickupMethod);
    assert.equal(preview.ineligibleCount, eligible ? 0 : 1, pickupMethod);
    if (!eligible) {
      assert.equal(
        preview.ineligible[0].reasons.find(
          (reason) => reason.code === "PICKUP_METHOD_INELIGIBLE",
        )?.message,
        "僅 7-11 賣貨便訂單可匯出",
      );
    }
  }
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
