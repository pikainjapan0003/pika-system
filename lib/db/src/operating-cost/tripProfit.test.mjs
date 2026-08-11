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

function readyResult(input = BASE_INPUT) {
  const result = calculateTripProfit(input);
  assert.equal(result.status, "ready");
  return result;
}

function readyUnit(input = BASE_INPUT) {
  const result = readyResult(input);
  assert.equal(result.projections.unit.status, "ready");
  return { result, projection: result.projections.unit };
}

test("REVENUE fallback preserves the approved formula without double-counting discounts", () => {
  const { result, projection } = readyUnit();

  assert.equal(projection.grossProfitSource, "REVENUE");
  assert.equal(
    projection.customerDiscountTotalTwd.toDecimalPlaces(2),
    "2000.00",
  );
  assert.equal(projection.adjustedRevenueTwd.toDecimalPlaces(2), "98000.00");
  assert.equal(projection.grossProfitTwd.toDecimalPlaces(2), "38000.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "375.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "25375.00");
  assert.equal(
    projection.operatingProfitBeforeAdjustmentsTwd.toDecimalPlaces(2),
    "12625.00",
  );
  assert.equal(
    projection.finalOperatingProfitTwd.toDecimalPlaces(2),
    "13125.00",
  );
  assert.equal(projection.salaryTargetTwd.toDecimalPlaces(2), "7500.00");
  assert.equal(projection.outcome, "SALARY_TARGET_MET");
});

test("gross margin is gross profit divided by adjusted revenue", () => {
  const { projection } = readyUnit();
  assert.equal(projection.grossMarginRate.toDecimalPlaces(8), "0.38775510");
});

test("zero adjusted revenue returns a null margin instead of dividing by zero", () => {
  const { projection } = readyUnit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "0",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    purchaseCostTwd: "0",
  });

  assert.equal(projection.adjustedRevenueTwd.toDecimalPlaces(0), "0");
  assert.equal(projection.grossMarginRate, null);
});

test("negative final profit is classified as a loss", () => {
  const { projection } = readyUnit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "1000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
  });

  assert.equal(projection.outcome, "LOSS");
  assert.equal(projection.finalOperatingProfitTwd.isNegative(), true);
});

test("positive profit below salary target is not mislabeled as a loss", () => {
  const { projection } = readyUnit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "88000",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    referenceDailyWageTwd: "1000",
  });

  assert.equal(
    projection.finalOperatingProfitTwd.toDecimalPlaces(2),
    "3125.00",
  );
  assert.equal(projection.outcome, "PROFIT_BELOW_SALARY_TARGET");
});

test("profit equal to the salary target counts as met", () => {
  const { projection } = readyUnit({
    ...BASE_INPUT,
    grossSalesRevenueTwd: "90375",
    freeShippingDiscountTwd: "0",
    bulkDiscountTwd: "0",
    cardDiscountTwd: "0",
    creditCardRebateTwd: "0",
    referenceDailyWageTwd: "1000",
  });

  assert.equal(
    projection.finalOperatingProfitTwd.toDecimalPlaces(2),
    "5000.00",
  );
  assert.equal(projection.salaryTargetTwd.toDecimalPlaces(2), "5000.00");
  assert.equal(projection.outcome, "SALARY_TARGET_MET");
});

test("missing shared costs stay pending and negative costs are rejected", () => {
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
  const { result } = readyUnit({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "1000",
    fixedCostTwdDirectTwd: "30000",
    variableCostBaseTotalTwd: "0",
  });
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "15.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "31015.00");
});

test("TWD-only fixed cost has no payment fee", () => {
  const { result } = readyUnit({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "30000",
    variableCostBaseTotalTwd: "0",
  });
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "0.00");
});

test("legacy total fixed cost equals the equivalent JPY-origin split input", () => {
  const legacy = readyResult({
    ...BASE_INPUT,
    fixedCostTotalTwd: "20000",
    variableCostBaseTotalTwd: "5000",
  });
  const split = readyResult({
    ...BASE_INPUT,
    fixedCostTotalTwd: undefined,
    fixedCostJpyOriginTwd: "20000",
    fixedCostTwdDirectTwd: "0",
    variableCostBaseTotalTwd: "5000",
  });
  assert.equal(legacy.projections.unit.status, "ready");
  assert.equal(split.projections.unit.status, "ready");
  assert.equal(
    legacy.paymentFeeTwd.toDecimalPlaces(2),
    split.paymentFeeTwd.toDecimalPlaces(2),
  );
  assert.equal(
    legacy.operatingExpenseTwd.toDecimalPlaces(2),
    split.operatingExpenseTwd.toDecimalPlaces(2),
  );
  assert.equal(
    legacy.projections.unit.finalOperatingProfitTwd.toDecimalPlaces(2),
    split.projections.unit.finalOperatingProfitTwd.toDecimalPlaces(2),
  );
});

test("split purchase principal is deducted once in REVENUE mode and only its JPY share pays the fee", () => {
  const withPurchase = readyResult({
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
  const withoutPurchase = readyResult({
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
  assert.equal(withPurchase.projections.unit.status, "ready");
  assert.equal(withoutPurchase.projections.unit.status, "ready");
  assert.equal(withPurchase.projections.unit.grossProfitSource, "REVENUE");
  assert.equal(
    withPurchase.purchaseCostPrincipalTwd.toDecimalPlaces(2),
    "15000.00",
  );
  assert.equal(
    withPurchase.projections.unit.grossProfitTwd.toDecimalPlaces(2),
    "85000.00",
  );
  assert.equal(withPurchase.purchasePaymentFeeTwd.toDecimalPlaces(2), "150.00");
  assert.equal(withPurchase.operatingExpenseTwd.toDecimalPlaces(2), "150.00");
  assert.equal(
    withPurchase.projections.unit.finalOperatingProfitTwd
      .add(withPurchase.purchasePaymentFeeTwd)
      .toDecimalPlaces(2),
    withoutPurchase.projections.unit.finalOperatingProfitTwd.toDecimalPlaces(2),
  );
});

test("UNIT mode uses unit gross profit without deducting purchase principal again", () => {
  const { result, projection } = readyUnit({
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

  assert.equal(projection.grossProfitSource, "UNIT");
  assert.equal(projection.grossProfitTwd.toDecimalPlaces(2), "91000.00");
  assert.equal(result.purchaseCostPrincipalTwd.toDecimalPlaces(2), "15000.00");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(2), "150.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "150.00");
  assert.equal(
    projection.finalOperatingProfitTwd.toDecimalPlaces(2),
    "90850.00",
  );
});

test("UNIT and DAILY projections are independent and share one exact cost side", () => {
  const result = readyResult({
    fixedCostJpyOriginTwd: "100",
    fixedCostTwdDirectTwd: "200",
    variableCostJpyOriginTwd: "50",
    variableCostTwdDirectTwd: "100",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "300",
    unitGrossProfitTwd: "130",
    estimatedItemQuantity: 10,
    dailyGrossProfitTwd: "500",
    creditCardRebateTwd: "25",
    workingDays: 4,
    referenceDailyWageTwd: "100",
  });

  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "452.25");
  assert.equal(result.projections.unit.status, "ready");
  assert.equal(result.projections.daily.status, "ready");
  assert.equal(result.projections.unit.grossProfitSource, "UNIT");
  assert.equal(result.projections.daily.grossProfitSource, "DAILY");
  assert.equal(
    result.projections.unit.grossProfitTwd.toDecimalPlaces(2),
    "1300.00",
  );
  assert.equal(
    result.projections.daily.grossProfitTwd.toDecimalPlaces(2),
    "2000.00",
  );
  assert.equal(
    result.projections.unit.finalOperatingProfitTwd.toDecimalPlaces(2),
    "872.75",
  );
  assert.equal(
    result.projections.daily.finalOperatingProfitTwd.toDecimalPlaces(2),
    "1572.75",
  );
  assert.equal(
    result.projections.unit.salaryTargetTwd.toFractionString(),
    result.projections.daily.salaryTargetTwd.toFractionString(),
  );
});

test("missing DAILY input stays pending without blocking a ready UNIT projection", () => {
  const result = readyResult({
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "0",
    unitGrossProfitTwd: "10",
    estimatedItemQuantity: 3,
    dailyGrossProfitTwd: null,
    creditCardRebateTwd: "0",
    workingDays: 2,
    referenceDailyWageTwd: "0",
  });

  assert.equal(result.projections.unit.status, "ready");
  assert.equal(result.projections.unit.grossProfitTwd.toDecimalPlaces(0), "30");
  assert.deepEqual(result.projections.daily, {
    status: "pending_confirmation",
    label: "待確認",
    reason: "缺少每日毛利",
    grossProfitSource: "DAILY",
  });
});

test("missing UNIT and REVENUE inputs do not block an independently ready DAILY projection", () => {
  const result = readyResult({
    fixedCostJpyOriginTwd: "0",
    fixedCostTwdDirectTwd: "0",
    variableCostJpyOriginTwd: "0",
    variableCostTwdDirectTwd: "0",
    purchaseCostJpyOriginTwd: "0",
    purchaseCostTwdDirectTwd: "0",
    dailyGrossProfitTwd: "100",
    creditCardRebateTwd: "0",
    workingDays: 2,
    referenceDailyWageTwd: "0",
  });

  assert.equal(result.projections.unit.status, "pending_confirmation");
  assert.equal(result.projections.unit.reason, "缺少單件毛利或預估件數");
  assert.equal(result.projections.daily.status, "ready");
  assert.equal(
    result.projections.daily.grossProfitTwd.toDecimalPlaces(0),
    "200",
  );
});

test("all-TWD sections pay no fee while purchase principal remains auditable", () => {
  const result = readyResult({
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

  assert.equal(result.fixedPaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.variablePaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(2), "300.00");
  assert.equal(result.purchaseCostPrincipalTwd.toDecimalPlaces(2), "300.00");
});

test("March golden fixture keeps each shared section and UNIT result exact", () => {
  const { result, projection } = readyUnit({
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

  assert.equal(projection.grossProfitSource, "UNIT");
  assert.equal(result.fixedCostTotalTwd.toDecimalPlaces(3), "39147.715");
  assert.equal(result.fixedPaymentFeeTwd.toDecimalPlaces(6), "228.235725");
  assert.equal(result.variablePaymentFeeTwd.toDecimalPlaces(6), "190.234875");
  assert.equal(result.purchasePaymentFeeTwd.toDecimalPlaces(0), "0");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(4), "418.4706");
  assert.equal(result.operatingExpenseTwd.toDecimalPlaces(4), "57208.5106");
  assert.equal(projection.grossProfitTwd.toDecimalPlaces(0), "91000");
  assert.equal(
    projection.finalOperatingProfitTwd.toDecimalPlaces(4),
    "33791.4894",
  );
  assert.equal(projection.outcome, "SALARY_TARGET_MET");
});
