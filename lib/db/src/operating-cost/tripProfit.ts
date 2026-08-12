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

export type GrossProfitSource = "UNIT" | "DAILY" | "REVENUE";

export interface TripProfitInput {
  grossSalesRevenueTwd?: DecimalInput;
  freeShippingDiscountTwd?: DecimalInput;
  bulkDiscountTwd?: DecimalInput;
  cardDiscountTwd?: DecimalInput;
  purchaseCostTwd?: DecimalInput;
  fixedCostTotalTwd?: DecimalInput;
  /** JPY-origin costs are the only fixed costs subject to the payment fee. */
  fixedCostJpyOriginTwd?: DecimalInput;
  fixedCostTwdDirectTwd?: DecimalInput;
  variableCostBaseTotalTwd?: DecimalInput;
  variableCostJpyOriginTwd?: DecimalInput;
  variableCostTwdDirectTwd?: DecimalInput;
  purchaseCostJpyOriginTwd?: DecimalInput;
  purchaseCostTwdDirectTwd?: DecimalInput;
  unitGrossProfitTwd?: DecimalInput;
  dailyGrossProfitTwd?: DecimalInput;
  estimatedItemQuantity?: QuantityInput;
  creditCardRebateTwd?: DecimalInput;
  workingDays?: QuantityInput;
  referenceDailyWageTwd?: DecimalInput;
}

export interface ReadyTripProfitProjection {
  status: "ready";
  outcome: TripProfitStatus;
  grossProfitSource: GrossProfitSource;
  customerDiscountTotalTwd: ExactDecimal | null;
  adjustedRevenueTwd: ExactDecimal | null;
  grossProfitTwd: ExactDecimal;
  grossMarginRate: ExactDecimal | null;
  operatingProfitBeforeAdjustmentsTwd: ExactDecimal;
  finalOperatingProfitTwd: ExactDecimal;
  salaryTargetTwd: ExactDecimal;
}

export interface PendingTripProfitProjection extends PendingOperatingCost {
  grossProfitSource: GrossProfitSource;
}

export type TripProfitProjectionResult =
  | ReadyTripProfitProjection
  | PendingTripProfitProjection;

export interface ReadyTripProfit {
  status: "ready";
  projections: {
    unit: TripProfitProjectionResult;
    daily: TripProfitProjectionResult;
  };
  fixedPaymentFeeTwd: ExactDecimal;
  variablePaymentFeeTwd: ExactDecimal;
  purchasePaymentFeeTwd: ExactDecimal;
  paymentFeeTwd: ExactDecimal;
  operatingExpenseTwd: ExactDecimal;
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

type ProjectionContext = {
  operatingExpenseTwd: ExactDecimal;
  creditCardRebateTwd: ExactDecimal;
  salaryTargetTwd: ExactDecimal;
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

  if (isMissingDecimal(input.legacyValue)) return null;
  const legacyTotal = parseMoney(input.legacyValue, input.legacyFieldName);
  return {
    jpyOriginTwd: ExactDecimal.zero(),
    twdDirectTwd: legacyTotal,
    totalTwd: legacyTotal,
    feeBaseTwd: input.legacyFeeApplies ? legacyTotal : ExactDecimal.zero(),
  };
}

function pendingProjection(
  grossProfitSource: GrossProfitSource,
  reason: string,
): PendingTripProfitProjection {
  return {
    ...pendingOperatingCost(reason),
    grossProfitSource,
  };
}

function projectionContext(
  input: TripProfitInput,
  operatingExpenseTwd: ExactDecimal,
): ProjectionContext | null {
  const workingDays = parsePositiveQuantity(input.workingDays);
  if (
    workingDays === null ||
    isMissingDecimal(input.creditCardRebateTwd) ||
    isMissingDecimal(input.referenceDailyWageTwd)
  ) {
    return null;
  }
  return {
    operatingExpenseTwd,
    creditCardRebateTwd: parseMoney(
      input.creditCardRebateTwd,
      "creditCardRebateTwd",
    ),
    salaryTargetTwd: parseMoney(
      input.referenceDailyWageTwd,
      "referenceDailyWageTwd",
    ).multiply(workingDays),
  };
}

function calculateProjection(input: {
  grossProfitSource: GrossProfitSource;
  grossProfitTwd: ExactDecimal;
  customerDiscountTotalTwd: ExactDecimal | null;
  adjustedRevenueTwd: ExactDecimal | null;
  context: ProjectionContext;
}): ReadyTripProfitProjection {
  const operatingProfitBeforeAdjustmentsTwd = subtractDecimal(
    input.grossProfitTwd,
    input.context.operatingExpenseTwd,
  );
  const finalOperatingProfitTwd = operatingProfitBeforeAdjustmentsTwd.add(
    input.context.creditCardRebateTwd,
  );
  const zero = ExactDecimal.zero();
  const outcome: TripProfitStatus =
    compareDecimals(finalOperatingProfitTwd, zero) < 0
      ? "LOSS"
      : compareDecimals(
            finalOperatingProfitTwd,
            input.context.salaryTargetTwd,
          ) < 0
        ? "PROFIT_BELOW_SALARY_TARGET"
        : "SALARY_TARGET_MET";
  return {
    status: "ready",
    outcome,
    grossProfitSource: input.grossProfitSource,
    customerDiscountTotalTwd: input.customerDiscountTotalTwd,
    adjustedRevenueTwd: input.adjustedRevenueTwd,
    grossProfitTwd: input.grossProfitTwd,
    grossMarginRate:
      input.adjustedRevenueTwd === null || input.adjustedRevenueTwd.equals(zero)
        ? null
        : input.grossProfitTwd.divide(input.adjustedRevenueTwd),
    operatingProfitBeforeAdjustmentsTwd,
    finalOperatingProfitTwd,
    salaryTargetTwd: input.context.salaryTargetTwd,
  };
}

function calculateUnitProjection(input: {
  trip: TripProfitInput;
  purchase: CostSection;
  context: ProjectionContext | null;
}): TripProfitProjectionResult {
  const unitGrossProfitTwd = isMissingDecimal(input.trip.unitGrossProfitTwd)
    ? null
    : parseMoney(input.trip.unitGrossProfitTwd, "unitGrossProfitTwd");
  const estimatedItemQuantity = parsePositiveQuantity(
    input.trip.estimatedItemQuantity,
  );
  const hasUnitSource =
    unitGrossProfitTwd !== null && estimatedItemQuantity !== null;
  const revenueInputs = [
    input.trip.grossSalesRevenueTwd,
    input.trip.freeShippingDiscountTwd,
    input.trip.bulkDiscountTwd,
    input.trip.cardDiscountTwd,
  ];
  const hasRevenueSource = revenueInputs.every(
    (value) => !isMissingDecimal(value),
  );
  const source: GrossProfitSource = hasUnitSource ? "UNIT" : "REVENUE";
  if (!hasUnitSource && !hasRevenueSource) {
    return pendingProjection("UNIT", "缺少單件毛利或預估件數");
  }
  if (input.context === null) {
    return pendingProjection(source, "缺少工作天數、刷卡回饋或參考日薪");
  }

  if (hasUnitSource) {
    return calculateProjection({
      grossProfitSource: "UNIT",
      grossProfitTwd: unitGrossProfitTwd.multiply(estimatedItemQuantity),
      customerDiscountTotalTwd: null,
      adjustedRevenueTwd: null,
      context: input.context,
    });
  }

  const customerDiscountTotalTwd = parseMoney(
    input.trip.freeShippingDiscountTwd,
    "freeShippingDiscountTwd",
  )
    .add(parseMoney(input.trip.bulkDiscountTwd, "bulkDiscountTwd"))
    .add(parseMoney(input.trip.cardDiscountTwd, "cardDiscountTwd"));
  const adjustedRevenueTwd = subtractDecimal(
    parseMoney(input.trip.grossSalesRevenueTwd, "grossSalesRevenueTwd"),
    customerDiscountTotalTwd,
  );
  return calculateProjection({
    grossProfitSource: "REVENUE",
    grossProfitTwd: subtractDecimal(
      adjustedRevenueTwd,
      input.purchase.totalTwd,
    ),
    customerDiscountTotalTwd,
    adjustedRevenueTwd,
    context: input.context,
  });
}

function calculateDailyProjection(input: {
  trip: TripProfitInput;
  context: ProjectionContext | null;
}): TripProfitProjectionResult {
  if (isMissingDecimal(input.trip.dailyGrossProfitTwd)) {
    return pendingProjection("DAILY", "缺少每日毛利");
  }
  const workingDays = parsePositiveQuantity(input.trip.workingDays);
  if (workingDays === null || input.context === null) {
    return pendingProjection("DAILY", "缺少工作天數、刷卡回饋或參考日薪");
  }
  return calculateProjection({
    grossProfitSource: "DAILY",
    grossProfitTwd: parseMoney(
      input.trip.dailyGrossProfitTwd,
      "dailyGrossProfitTwd",
    ).multiply(workingDays),
    customerDiscountTotalTwd: null,
    adjustedRevenueTwd: null,
    context: input.context,
  });
}

export function calculateSectionPaymentFeeTwd(
  jpyOriginTwd: ExactDecimal,
): ExactDecimal {
  if (jpyOriginTwd.isNegative()) {
    throw new RangeError("jpyOriginTwd cannot be negative");
  }
  return jpyOriginTwd.multiply(ExactDecimal.from(PAYMENT_FEE_RATE));
}

export function calculateTripProfit(input: TripProfitInput): TripProfitResult {
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

  const fixedPaymentFeeTwd = calculateSectionPaymentFeeTwd(fixed.feeBaseTwd);
  const variablePaymentFeeTwd = calculateSectionPaymentFeeTwd(
    variable.feeBaseTwd,
  );
  const purchasePaymentFeeTwd = calculateSectionPaymentFeeTwd(
    purchase.feeBaseTwd,
  );
  const paymentFeeTwd = fixedPaymentFeeTwd
    .add(variablePaymentFeeTwd)
    .add(purchasePaymentFeeTwd);
  const operatingExpenseTwd = fixed.totalTwd
    .add(variable.totalTwd)
    .add(paymentFeeTwd);
  const context = projectionContext(input, operatingExpenseTwd);

  return {
    status: "ready",
    projections: {
      unit: calculateUnitProjection({ trip: input, purchase, context }),
      daily: calculateDailyProjection({ trip: input, context }),
    },
    fixedPaymentFeeTwd,
    variablePaymentFeeTwd,
    purchasePaymentFeeTwd,
    paymentFeeTwd,
    operatingExpenseTwd,
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
