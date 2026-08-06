import { PAYMENT_FEE_RATE } from "../operating-settings/index.ts";
import {
  type DecimalInput,
  ExactDecimal,
  type QuantityInput,
} from "../transport-cost/index.ts";
import {
  compareDecimals,
  isMissingDecimal,
  parseNonNegativeDecimal,
  parsePositiveQuantity,
  pendingOperatingCost,
  subtractDecimal,
  type PendingOperatingCost,
} from "./exact.ts";

export type TripProfitStatus =
  | "LOSS"
  | "PROFIT_BELOW_SALARY_TARGET"
  | "SALARY_TARGET_MET";

export type GrossProfitSource = "UNIT" | "REVENUE";

export interface TripProfitInput {
  grossSalesRevenueTwd?: DecimalInput;
  freeShippingDiscountTwd?: DecimalInput;
  bulkDiscountTwd?: DecimalInput;
  cardDiscountTwd?: DecimalInput;
  purchaseCostTwd?: DecimalInput;
  fixedCostTotalTwd?: DecimalInput;
  /** New V1 split: JPY-origin costs are the only fixed costs subject to the fee. */
  fixedCostJpyOriginTwd?: DecimalInput;
  fixedCostTwdDirectTwd?: DecimalInput;
  variableCostBaseTotalTwd?: DecimalInput;
  variableCostJpyOriginTwd?: DecimalInput;
  variableCostTwdDirectTwd?: DecimalInput;
  purchaseCostJpyOriginTwd?: DecimalInput;
  purchaseCostTwdDirectTwd?: DecimalInput;
  unitGrossProfitTwd?: DecimalInput;
  estimatedItemQuantity?: QuantityInput;
  creditCardRebateTwd?: DecimalInput;
  workingDays?: QuantityInput;
  referenceDailyWageTwd?: DecimalInput;
}

export interface ReadyTripProfit {
  status: "ready";
  outcome: TripProfitStatus;
  grossProfitSource: GrossProfitSource;
  customerDiscountTotalTwd: ExactDecimal | null;
  adjustedRevenueTwd: ExactDecimal | null;
  grossProfitTwd: ExactDecimal;
  grossMarginRate: ExactDecimal | null;
  fixedPaymentFeeTwd: ExactDecimal;
  variablePaymentFeeTwd: ExactDecimal;
  purchasePaymentFeeTwd: ExactDecimal;
  paymentFeeTwd: ExactDecimal;
  operatingExpenseTwd: ExactDecimal;
  operatingProfitBeforeAdjustmentsTwd: ExactDecimal;
  finalOperatingProfitTwd: ExactDecimal;
  salaryTargetTwd: ExactDecimal;
  fixedCostJpyOriginTwd: ExactDecimal;
  fixedCostTwdDirectTwd: ExactDecimal;
  fixedCostTotalTwd: ExactDecimal;
  variableCostJpyOriginTwd: ExactDecimal;
  variableCostTwdDirectTwd: ExactDecimal;
  variableCostTotalTwd: ExactDecimal;
  purchaseCostJpyOriginTwd: ExactDecimal;
  purchaseCostTwdDirectTwd: ExactDecimal;
  purchaseCostPrincipalTwd: ExactDecimal;
}

export type TripProfitResult = ReadyTripProfit | PendingOperatingCost;

type CostSection = {
  jpyOriginTwd: ExactDecimal;
  twdDirectTwd: ExactDecimal;
  totalTwd: ExactDecimal;
  feeBaseTwd: ExactDecimal;
};

function parseMoney(value: DecimalInput, fieldName: string): ExactDecimal {
  return parseNonNegativeDecimal(
    value as Exclude<DecimalInput, null | undefined>,
    fieldName,
  );
}

function parseCostSection(input: {
  legacyValue: DecimalInput;
  legacyFieldName: string;
  jpyValue: DecimalInput;
  jpyFieldName: string;
  twdValue: DecimalInput;
  twdFieldName: string;
  legacyFeeApplies: boolean;
}): CostSection | null {
  const split = input.jpyValue !== undefined || input.twdValue !== undefined;
  if (split) {
    if (isMissingDecimal(input.jpyValue) || isMissingDecimal(input.twdValue)) {
      return null;
    }
    const jpyOriginTwd = parseMoney(input.jpyValue, input.jpyFieldName);
    const twdDirectTwd = parseMoney(input.twdValue, input.twdFieldName);
    return {
      jpyOriginTwd,
      twdDirectTwd,
      totalTwd: jpyOriginTwd.add(twdDirectTwd),
      feeBaseTwd: jpyOriginTwd,
    };
  }

  if (isMissingDecimal(input.legacyValue)) {
    return null;
  }
  const legacyTotal = parseMoney(input.legacyValue, input.legacyFieldName);
  return {
    jpyOriginTwd: ExactDecimal.zero(),
    twdDirectTwd: legacyTotal,
    totalTwd: legacyTotal,
    feeBaseTwd: input.legacyFeeApplies ? legacyTotal : ExactDecimal.zero(),
  };
}

export function calculateTripProfit(input: TripProfitInput): TripProfitResult {
  const workingDays = parsePositiveQuantity(input.workingDays);
  if (workingDays === null) {
    return pendingOperatingCost("缺少工作天數");
  }

  if (
    isMissingDecimal(input.creditCardRebateTwd) ||
    isMissingDecimal(input.referenceDailyWageTwd)
  ) {
    return pendingOperatingCost("缺少營運損益資料");
  }

  const fixed = parseCostSection({
    legacyValue: input.fixedCostTotalTwd,
    legacyFieldName: "fixedCostTotalTwd",
    jpyValue: input.fixedCostJpyOriginTwd,
    jpyFieldName: "fixedCostJpyOriginTwd",
    twdValue: input.fixedCostTwdDirectTwd,
    twdFieldName: "fixedCostTwdDirectTwd",
    legacyFeeApplies: true,
  });
  const variable = parseCostSection({
    legacyValue: input.variableCostBaseTotalTwd,
    legacyFieldName: "variableCostBaseTotalTwd",
    jpyValue: input.variableCostJpyOriginTwd,
    jpyFieldName: "variableCostJpyOriginTwd",
    twdValue: input.variableCostTwdDirectTwd,
    twdFieldName: "variableCostTwdDirectTwd",
    legacyFeeApplies: true,
  });
  const purchase = parseCostSection({
    legacyValue: input.purchaseCostTwd,
    legacyFieldName: "purchaseCostTwd",
    jpyValue: input.purchaseCostJpyOriginTwd,
    jpyFieldName: "purchaseCostJpyOriginTwd",
    twdValue: input.purchaseCostTwdDirectTwd,
    twdFieldName: "purchaseCostTwdDirectTwd",
    legacyFeeApplies: false,
  });
  if (fixed === null || variable === null || purchase === null) {
    return pendingOperatingCost("缺少營運損益資料");
  }

  const unitGrossProfitTwd = isMissingDecimal(input.unitGrossProfitTwd)
    ? null
    : parseMoney(input.unitGrossProfitTwd, "unitGrossProfitTwd");
  const estimatedItemQuantity = parsePositiveQuantity(
    input.estimatedItemQuantity,
  );
  const hasUnitSource =
    unitGrossProfitTwd !== null && estimatedItemQuantity !== null;
  const revenueInputs = [
    input.grossSalesRevenueTwd,
    input.freeShippingDiscountTwd,
    input.bulkDiscountTwd,
    input.cardDiscountTwd,
  ];
  const hasRevenueSource = revenueInputs.every(
    (value) => !isMissingDecimal(value),
  );
  if (!hasUnitSource && !hasRevenueSource) {
    return pendingOperatingCost("缺少毛利來源資料");
  }

  let customerDiscountTotalTwd: ExactDecimal | null = null;
  let adjustedRevenueTwd: ExactDecimal | null = null;
  if (hasRevenueSource) {
    customerDiscountTotalTwd = parseMoney(
      input.freeShippingDiscountTwd,
      "freeShippingDiscountTwd",
    )
      .add(parseMoney(input.bulkDiscountTwd, "bulkDiscountTwd"))
      .add(parseMoney(input.cardDiscountTwd, "cardDiscountTwd"));
    adjustedRevenueTwd = subtractDecimal(
      parseMoney(input.grossSalesRevenueTwd, "grossSalesRevenueTwd"),
      customerDiscountTotalTwd,
    );
  }

  const grossProfitSource: GrossProfitSource = hasUnitSource
    ? "UNIT"
    : "REVENUE";
  const grossProfitTwd = hasUnitSource
    ? unitGrossProfitTwd.multiply(estimatedItemQuantity)
    : subtractDecimal(adjustedRevenueTwd as ExactDecimal, purchase.totalTwd);

  const paymentFeeRate = ExactDecimal.from(PAYMENT_FEE_RATE);
  const fixedPaymentFeeTwd = fixed.feeBaseTwd.multiply(paymentFeeRate);
  const variablePaymentFeeTwd = variable.feeBaseTwd.multiply(paymentFeeRate);
  const purchasePaymentFeeTwd = purchase.feeBaseTwd.multiply(paymentFeeRate);
  const paymentFeeTwd = fixedPaymentFeeTwd
    .add(variablePaymentFeeTwd)
    .add(purchasePaymentFeeTwd);
  const operatingExpenseTwd = fixed.totalTwd
    .add(variable.totalTwd)
    .add(paymentFeeTwd);
  const operatingProfitBeforeAdjustmentsTwd = subtractDecimal(
    grossProfitTwd,
    operatingExpenseTwd,
  );
  const creditCardRebateTwd = parseMoney(
    input.creditCardRebateTwd,
    "creditCardRebateTwd",
  );
  const finalOperatingProfitTwd =
    operatingProfitBeforeAdjustmentsTwd.add(creditCardRebateTwd);
  const salaryTargetTwd = parseMoney(
    input.referenceDailyWageTwd,
    "referenceDailyWageTwd",
  ).multiply(workingDays);
  const zero = ExactDecimal.zero();
  const outcome: TripProfitStatus =
    compareDecimals(finalOperatingProfitTwd, zero) < 0
      ? "LOSS"
      : compareDecimals(finalOperatingProfitTwd, salaryTargetTwd) < 0
        ? "PROFIT_BELOW_SALARY_TARGET"
        : "SALARY_TARGET_MET";

  return {
    status: "ready",
    outcome,
    grossProfitSource,
    customerDiscountTotalTwd,
    adjustedRevenueTwd,
    grossProfitTwd,
    grossMarginRate:
      adjustedRevenueTwd === null || adjustedRevenueTwd.equals(zero)
        ? null
        : grossProfitTwd.divide(adjustedRevenueTwd),
    fixedPaymentFeeTwd,
    variablePaymentFeeTwd,
    purchasePaymentFeeTwd,
    paymentFeeTwd,
    operatingExpenseTwd,
    operatingProfitBeforeAdjustmentsTwd,
    finalOperatingProfitTwd,
    salaryTargetTwd,
    fixedCostJpyOriginTwd: fixed.jpyOriginTwd,
    fixedCostTwdDirectTwd: fixed.twdDirectTwd,
    fixedCostTotalTwd: fixed.totalTwd,
    variableCostJpyOriginTwd: variable.jpyOriginTwd,
    variableCostTwdDirectTwd: variable.twdDirectTwd,
    variableCostTotalTwd: variable.totalTwd,
    purchaseCostJpyOriginTwd: purchase.jpyOriginTwd,
    purchaseCostTwdDirectTwd: purchase.twdDirectTwd,
    purchaseCostPrincipalTwd: purchase.totalTwd,
  };
}
