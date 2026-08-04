import assert from "node:assert/strict";
import test from "node:test";

import { calculateConsolidationCost } from "./consolidationCost.ts";

test("weight-only consolidation formula keeps base, fee and unit cost exact", () => {
  const result = calculateConsolidationCost({
    totalWeightKg: "25.5",
    rateJpyPerKg: "900",
    exchangeRate: "0.21",
    totalItemQuantity: 100,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.baseJpy.toDecimalPlaces(2), "22950.00");
  assert.equal(result.paymentFeeJpy.toDecimalPlaces(4), "344.2500");
  assert.equal(result.baseCostTwd.toDecimalPlaces(4), "4819.5000");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(4), "72.2925");
  assert.equal(result.totalCostTwd.toDecimalPlaces(4), "4891.7925");
  assert.equal(result.unitCostTwd.toDecimalPlaces(6), "48.917925");
});

test("zero weight is a valid zero cost, not pending", () => {
  const result = calculateConsolidationCost({
    totalWeightKg: "0",
    rateJpyPerKg: "900",
    exchangeRate: "0.21",
    totalItemQuantity: 10,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.totalCostTwd.toDecimalPlaces(0), "0");
  assert.equal(result.unitCostTwd.toDecimalPlaces(0), "0");
});

test("zero or missing item quantity remains pending", () => {
  for (const totalItemQuantity of [0, null]) {
    const result = calculateConsolidationCost({
      totalWeightKg: "10",
      rateJpyPerKg: "900",
      exchangeRate: "0.21",
      totalItemQuantity,
    });
    assert.equal(result.status, "pending_confirmation");
    assert.equal(result.reason, "缺少商品件數");
  }
});

test("missing weight, rate or exchange rate fails closed", () => {
  const complete = {
    totalWeightKg: "10",
    rateJpyPerKg: "900",
    exchangeRate: "0.21",
    totalItemQuantity: 10,
  };

  assert.equal(
    calculateConsolidationCost({ ...complete, totalWeightKg: null }).reason,
    "缺少合併運費資料",
  );
  assert.equal(
    calculateConsolidationCost({ ...complete, rateJpyPerKg: null }).reason,
    "缺少合併運費資料",
  );
  assert.equal(
    calculateConsolidationCost({ ...complete, exchangeRate: null }).reason,
    "缺少合併運費資料",
  );
});

test("negative consolidation inputs are rejected", () => {
  assert.throws(
    () =>
      calculateConsolidationCost({
        totalWeightKg: "-1",
        rateJpyPerKg: "900",
        exchangeRate: "0.21",
        totalItemQuantity: 10,
      }),
    /totalWeightKg cannot be negative/,
  );
});
