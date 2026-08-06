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

test("split purchase principal is deducted once in REVENUE mode and only its JPY share pays the fee", () => {
  const withPurchase = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "100000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    purchaseCostTwd: undefined,
    purchaseCostJpyOriginTwd: "10000",
    purchaseCostTwdDirectTwd: "5000",
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostBaseTotalTwd: undefined,
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    creditCardRebateTwd: "0",
    workingDays: 1,
    referenceDailyWageTwd: "0",
  });
  const purchaseAlreadyRemovedFromRevenue = calculateTripProfit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "85000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    purchaseCostTwd: undefined,
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "0",
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostBaseTotalTwd: undefined,
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    creditCardRebateTwd: "0",
    workingDays: 1,
    referenceDailyWageTwd: "0",
  });

  assert.equal(withPurchase.status, "ready");
  assert.equal(withPurchase.grossProfitSource, "REVENUE");
  assert.equal(
    withPurchase.purchaseCostPrincipalTwd.toDecimalPlaces(2),
    "15000.00",
  );
  assert.equal(withPurchase.grossProfitTwd.toDecimalPlaces(2), "85000.00");
  assert.equal(withPurchase.purchasePaymentFeeTwd.toDecimalPlaces(2), "150.00");
  assert.equal(withPurchase.operatingExpenseTwd.toDecimalPlaces(2), "150.00");
  assert.equal(
    withPurchase.finalOperatingProfitTwd.toDecimalPlaces(2),
    "84850.00",
  );
  assert.equal(purchaseAlreadyRemovedFromRevenue.status, "ready");
  assert.equal(
    withPurchase.finalOperatingProfitTwd
      .add(withPurchase.purchasePaymentFeeTwd)
      .toDecimalPlaces(2),
    purchaseAlreadyRemovedFromRevenue.finalOperatingProfitTwd.toDecimalPlaces(
      2,
    ),
  );
});

test("UNIT mode uses unit gross profit without deducting purchase principal again", () => {
  const result = calculateTripProfit({
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    purchaseCostJpyOriginTwd: "10000",
    purchaseCostTwdDirectTwd: "5000",
    unitGrossProfitTwd: "130",
    estimatedItemQuantity: 700,
    creditCardRebateTwd: "0",
    workingDays: 1,
    referenceDailyWageTwd: "0",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.grossProfitSource, "UNIT");
  assert.equal(result.grossProfitTwd.toDecimalPlaces(2), "91000.00");
  assert.equal(result.purchaseCostPrincipalTwd.toDecimalPlaces(2), "15000.00");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(2), "150.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "150.00");
  assert.equal(result.finalOperatingProfitTwd.toDecimalPlaces(2), "90850.00");
});

test("missing both UNIT and REVENUE gross-profit sources stays pending", () => {
  const result = calculateTripProfit({
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "0",
    creditCardRebateTwd: "0",
    workingDays: 1,
    referenceDailyWageTwd: "0",
  });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少毛利來源資料");
});

test("all-TWD sections pay no fee while purchase principal remains auditable", () => {
  const result = calculateTripProfit({
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "100",
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "200",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "300",
    unitGrossProfitTwd: "10",
    estimatedItemQuantity: 100,
    creditCardRebateTwd: "0",
    workingDays: 1,
    referenceDailyWageTwd: "0",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.fixedPaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.variablePaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "300.00");
  assert.equal(result.purchaseCostPrincipalTwd.toDecimalPlaces(2), "300.00");
});

test("March golden fixture keeps each section and final profit exact", () => {
  const result = calculateTripProfit({
    fixedCostJpyOriginTwd: "15215.715",
    fixedCostTwdDirectTwd: "23932",
    variableCostJpyOriginTwd: "12682.325",
    variableCostTwdDirectTwd: "4960",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "0",
    unitGrossProfitTwd: "130",
    estimatedItemQuantity: 700,
    creditCardRebateTwd: "0",
    workingDays: 10,
    referenceDailyWageTwd: "1500",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.grossProfitSource, "UNIT");
  assert.equal(result.fixedCostTotalTwd.toDecimalPlaces(3), "39147.715");
  assert.equal(result.fixedPaymentFeeTwd.toDecimalPlaces(6), "228.235725");
  assert.equal(result.variablePaymentFeeTwd.toDecimalPlaces(6), "190.234875");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(0), "0");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(4), "418.4706");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(4), "57208.5106");
  assert.equal(result.grossProfitTwd.toDecimalPlaces(0), "91000");
  assert.equal(result.finalOperatingProfitTwd.toDecimalPlaces(4), "33791.4894");
  assert.equal(result.outcome, "SALARY_TARGET_MET");
});
