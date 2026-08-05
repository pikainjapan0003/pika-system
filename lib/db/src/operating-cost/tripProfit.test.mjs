import assert from "node:assert/strict";
import test from "node:test";

import { calculateTripProfit } from "./tripProfit.ts";

const BASE_INPUT = {
  grossSalesRevenueTwd: "100000",
  freeShippingDiscountTwd: "1000",
  bulkDiscountTwd: "500",
  cardDiscountTwd: "500",
  purchaseCostTwd: "60000",
  fixedCostTotalTwd: "20000",
  variableCostBaseTotalTwd: "5000",
  creditCardRebateTwd: "500",
  workingDays: 5,
  referenceDailyWageTwd: "1500",
};

test("trip profit follows the approved full formula without double-counting discounts", () => {
  const result = calculateTripProfit(BASE_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.customerDiscountTotalTwd.toDecimalPlaces(2), "2000.00");
  assert.equal(result.adjustedRevenueTwd.toDecimalPlaces(2), "98000.00");
  assert.equal(result.grossProfitTwd.toDecimalPlaces(2), "38000.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "375.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "25375.00");
  assert.equal(
    result.operatingProfitBeforeAdjustmentsTwd.toDecimalPlaces(2),
    "12625.00",
  );
  assert.equal(result.finalOperatingProfitTwd.toDecimalPlaces(2), "13125.00");
  assert.equal(result.salaryTargetTwd.toDecimalPlaces(2), "7500.00");
  assert.equal(result.outcome, "SALARY_TARGET_MET");
});

test("gross margin is gross profit divided by adjusted revenue", () => {
  const result = calculateTripProfit(BASE_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.grossMarginRate.toDecimalPlaces(8), "0.38775510");
});

test("zero adjusted revenue returns a null margin instead of dividing by zero", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "0",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    purchaseCostTwd: "0",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.adjustedRevenueTwd.toDecimalPlaces(0), "0");
  assert.equal(result.grossMarginRate, null);
});

test("negative final profit is classified as a loss", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "1000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.outcome, "LOSS");
  assert.equal(result.finalOperatingProfitTwd.isNegative(), true);
});

test("positive profit below salary target is not mislabeled as a loss", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "88000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    referenceDailyWageTwd: "1000",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.finalOperatingProfitTwd.toDecimalPlaces(2), "3125.00");
  assert.equal(result.outcome, "PROFIT_BELOW_SALARY_TARGET");
});

test("profit equal to the salary target counts as met", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "90375",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    creditCardRebateTwd: "0",
    referenceDailyWageTwd: "1000",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.finalOperatingProfitTwd.toDecimalPlaces(2), "5000.00");
  assert.equal(result.salaryTargetTwd.toDecimalPlaces(2), "5000.00");
  assert.equal(result.outcome, "SALARY_TARGET_MET");
});

test("missing inputs stay pending and negative costs are rejected", () => {
  assert.equal(
    calculateTripProfit({ ...BASE_INPUT, fixedCostTotalTwd: null }).reason,
    "缺少營運損益資料",
  );
  assert.throws(
    () =>
      calculateTripProfit({ ...BASE_INPUT, variableCostBaseTotalTwd: "-1" }),
    /variableCostBaseTotalTwd cannot be negative/,
  );
});

test("split fixed costs charge the fee only on JPY-origin and variable costs", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "1000",
    fixedCostTwdDirectTwd: "30000",
    variableCostBaseTotalTwd: "0",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "15.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "31015.00");
});

test("TWD-only fixed cost has no payment fee", () => {
  const result = calculateTripProfit({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "30000",
    variableCostBaseTotalTwd: "0",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "0.00");
});

test("legacy total fixed cost equals the equivalent JPY-origin split input", () => {
  const legacy = calculateTripProfit({
    ...BASE_INPUT,
    fixedCostTotalTwd: "20000",
    variableCostBaseTotalTwd: "5000",
  });
  const split = calculateTripProfit({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "20000",
    fixedCostTwdDirectTwd: "0",
    variableCostBaseTotalTwd: "5000",
  });

  assert.equal(legacy.status, "ready");
  assert.equal(split.status, "ready");
  assert.equal(
    legacy.paymentFeeTwd.toDecimalPlaces(2),
    split.paymentFeeTwd.toDecimalPlaces(2),
  );
  assert.equal(
    legacy.operatingExpenseTwd.toDecimalPlaces(2),
    split.operatingExpenseTwd.toDecimalPlaces(2),
  );
  assert.equal(
    legacy.finalOperatingProfitTwd.toDecimalPlaces(2),
    split.finalOperatingProfitTwd.toDecimalPlaces(2),
  );
});
