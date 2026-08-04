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

export interface TripProfitInput {
  grossSalesRevenueTwd?: DecimalInput;
  freeShippingDiscountTwd?: DecimalInput;
  bulkDiscountTwd?: DecimalInput;
  cardDiscountTwd?: DecimalInput;
  purchaseCostTwd?: DecimalInput;
  fixedCostTotalTwd?: DecimalInput;
  variableCostBaseTotalTwd?: DecimalInput;
  creditCardRebateTwd?: DecimalInput;
  workingDays?: QuantityInput;
  referenceDailyWageTwd?: DecimalInput;
}

export interface ReadyTripProfit {
  status: "ready";
  outcome: TripProfitStatus;
  customerDiscountTotalTwd: ExactDecimal;
  adjustedRevenueTwd: ExactDecimal;
  grossProfitTwd: ExactDecimal;
  grossMarginRate: ExactDecimal | null;
  paymentFeeTwd: ExactDecimal;
  operatingExpenseTwd: ExactDecimal;
  operatingProfitBeforeAdjustmentsTwd: ExactDecimal;
  finalOperatingProfitTwd: ExactDecimal;
  salaryTargetTwd: ExactDecimal;
}

export type TripProfitResult = ReadyTripProfit | PendingOperatingCost;

export function calculateTripProfit(input: TripProfitInput): TripProfitResult {
  const workingDays = parsePositiveQuantity(input.workingDays);
  if (workingDays === null) {
    return pendingOperatingCost("缺少工作天數");
  }

  const moneyInputs: Array<[string, DecimalInput]> = [
    ["grossSalesRevenueTwd", input.grossSalesRevenueTwd],
    ["freeShippingDiscountTwd", input.freeShippingDiscountTwd],
    ["bulkDiscountTwd", input.bulkDiscountTwd],
    ["cardDiscountTwd", input.cardDiscountTwd],
    ["purchaseCostTwd", input.purchaseCostTwd],
    ["fixedCostTotalTwd", input.fixedCostTotalTwd],
    ["variableCostBaseTotalTwd", input.variableCostBaseTotalTwd],
    ["creditCardRebateTwd", input.creditCardRebateTwd],
    ["referenceDailyWageTwd", input.referenceDailyWageTwd],
  ];
  if (moneyInputs.some(([, value]) => isMissingDecimal(value))) {
    return pendingOperatingCost("缺少營運損益資料");
  }

  const parsed = Object.fromEntries(
    moneyInputs.map(([name, value]) => [
      name,
      parseNonNegativeDecimal(
        value as Exclude<DecimalInput, null | undefined>,
        name,
      ),
    ]),
  ) as Record<string, ExactDecimal>;

  const customerDiscountTotalTwd = parsed.freeShippingDiscountTwd
    .add(parsed.bulkDiscountTwd)
    .add(parsed.cardDiscountTwd);
  const adjustedRevenueTwd = subtractDecimal(
    parsed.grossSalesRevenueTwd,
    customerDiscountTotalTwd,
  );
  const grossProfitTwd = subtractDecimal(
    adjustedRevenueTwd,
    parsed.purchaseCostTwd,
  );
  const costBaseTwd = parsed.fixedCostTotalTwd.add(
    parsed.variableCostBaseTotalTwd,
  );
  const paymentFeeTwd = costBaseTwd.multiply(
    ExactDecimal.from(PAYMENT_FEE_RATE),
  );
  const operatingExpenseTwd = costBaseTwd.add(paymentFeeTwd);
  const operatingProfitBeforeAdjustmentsTwd = subtractDecimal(
    grossProfitTwd,
    operatingExpenseTwd,
  );
  const finalOperatingProfitTwd = operatingProfitBeforeAdjustmentsTwd.add(
    parsed.creditCardRebateTwd,
  );
  const salaryTargetTwd = parsed.referenceDailyWageTwd.multiply(workingDays);
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
    customerDiscountTotalTwd,
    adjustedRevenueTwd,
    grossProfitTwd,
    grossMarginRate: adjustedRevenueTwd.equals(zero)
      ? null
      : grossProfitTwd.divide(adjustedRevenueTwd),
    paymentFeeTwd,
    operatingExpenseTwd,
    operatingProfitBeforeAdjustmentsTwd,
    finalOperatingProfitTwd,
    salaryTargetTwd,
  };
}
