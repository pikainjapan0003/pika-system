import assert from "node:assert/strict";
import test from "node:test";

import { calculateRouteCost } from "./routeCost.ts";

const COMPLETE_INPUT = {
  fuelJpy: "800",
  etcJpy: "500",
  trainJpy: "1000",
  parkingJpy: "200",
  exchangeRate: "0.2",
  tripCount: 2,
  regionalItemQuantity: 100,
};

test("route total applies exchange rate, 1.5% fee and trip count exactly", () => {
  const result = calculateRouteCost(COMPLETE_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.subtotalJpy.toDecimalPlaces(0), "2500");
  assert.equal(result.subtotalTwdPerTrip.toDecimalPlaces(2), "500.00");
  assert.equal(result.baseRouteCostTwd.toDecimalPlaces(2), "1000.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "15.00");
  assert.equal(result.totalRouteCostTwd.toDecimalPlaces(2), "1015.00");
  assert.equal(result.unitRouteCostTwd.toDecimalPlaces(4), "10.1500");
});

test("trip count scales both base cost and its payment fee", () => {
  const result = calculateRouteCost({ ...COMPLETE_INPUT, tripCount: 3 });

  assert.equal(result.status, "ready");
  assert.equal(result.baseRouteCostTwd.toDecimalPlaces(2), "1500.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "22.50");
  assert.equal(result.totalRouteCostTwd.toDecimalPlaces(2), "1522.50");
});

test("zero or missing regional quantity stays pending", () => {
  assert.equal(
    calculateRouteCost({
      ...COMPLETE_INPUT,
      regionalItemQuantity: 0,
    }).reason,
    "缺少區域商品件數",
  );
  assert.equal(
    calculateRouteCost({
      ...COMPLETE_INPUT,
      regionalItemQuantity: null,
    }).reason,
    "缺少區域商品件數",
  );
});

test("missing trip count stays pending", () => {
  const result = calculateRouteCost({ ...COMPLETE_INPUT, tripCount: null });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少路線趟數");
});

test("missing exchange rate or a route cost fails closed", () => {
  assert.equal(
    calculateRouteCost({ ...COMPLETE_INPUT, exchangeRate: null }).reason,
    "缺少行程匯率",
  );
  assert.equal(
    calculateRouteCost({ ...COMPLETE_INPUT, etcJpy: null }).reason,
    "缺少路線成本資料",
  );
});

test("negative route costs are rejected", () => {
  assert.throws(
    () => calculateRouteCost({ ...COMPLETE_INPUT, fuelJpy: "-0.01" }),
    /fuelJpy cannot be negative/,
  );
});
