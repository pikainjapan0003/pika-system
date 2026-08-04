import { PAYMENT_FEE_RATE } from "../operating-settings/index.ts";
import { type DecimalInput, ExactDecimal } from "../transport-cost/index.ts";
import {
  ceilDecimal,
  compareDecimals,
  isMissingDecimal,
  parseNonNegativeDecimal,
  pendingOperatingCost,
  subtractDecimal,
  type PendingOperatingCost,
} from "./exact.ts";

export interface BreakevenInput {
  fixedCostTotalTwd?: DecimalInput;
  variableCostBaseTotalTwd?: DecimalInput;
  creditCardRebateTwd?: DecimalInput;
  unitGrossProfitTwd?: DecimalInput;
  salaryTargetTwd?: DecimalInput;
}

export interface ReadyBreakeven {
  status: "ready";
  paymentFeeTwd: ExactDecimal;
  netCostToRecoverTwd: ExactDecimal;
  breakevenQuantity: bigint;
  salaryTargetQuantity: bigint;
  conclusion: string;
}

export type BreakevenResult = ReadyBreakeven | PendingOperatingCost;

export function calculateBreakeven(input: BreakevenInput): BreakevenResult {
  if (
    isMissingDecimal(input.fixedCostTotalTwd) ||
    isMissingDecimal(input.variableCostBaseTotalTwd) ||
    isMissingDecimal(input.creditCardRebateTwd) ||
    isMissingDecimal(input.unitGrossProfitTwd) ||
    isMissingDecimal(input.salaryTargetTwd)
  ) {
    return pendingOperatingCost("缺少損益平衡資料");
  }

  const fixedCost = parseNonNegativeDecimal(
    input.fixedCostTotalTwd,
    "fixedCostTotalTwd",
  );
  const variableCost = parseNonNegativeDecimal(
    input.variableCostBaseTotalTwd,
    "variableCostBaseTotalTwd",
  );
  const rebate = parseNonNegativeDecimal(
    input.creditCardRebateTwd,
    "creditCardRebateTwd",
  );
  const salaryTarget = parseNonNegativeDecimal(
    input.salaryTargetTwd,
    "salaryTargetTwd",
  );
  const unitGrossProfit = ExactDecimal.from(input.unitGrossProfitTwd);
  if (compareDecimals(unitGrossProfit, ExactDecimal.zero()) <= 0) {
    return pendingOperatingCost("單件毛利必須大於 0");
  }

  const costBase = fixedCost.add(variableCost);
  const paymentFeeTwd = costBase.multiply(ExactDecimal.from(PAYMENT_FEE_RATE));
  const netCostToRecoverTwd = subtractDecimal(
    costBase.add(paymentFeeTwd),
    rebate,
  );
  const breakevenQuantity = ceilDecimal(
    netCostToRecoverTwd.divide(unitGrossProfit),
  );
  const salaryTargetQuantity = ceilDecimal(
    netCostToRecoverTwd.add(salaryTarget).divide(unitGrossProfit),
  );

  return {
    status: "ready",
    paymentFeeTwd,
    netCostToRecoverTwd,
    breakevenQuantity,
    salaryTargetQuantity,
    conclusion: `以單件毛利 ${unitGrossProfit.toDecimalPlaces(0)} 元計，至少需賣 ${breakevenQuantity} 件回本；達日薪目標需 ${salaryTargetQuantity} 件。`,
  };
}
