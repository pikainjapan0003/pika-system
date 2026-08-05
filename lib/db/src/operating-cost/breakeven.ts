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
  fixedCostJpyOriginTwd?: DecimalInput;
  fixedCostTwdDirectTwd?: DecimalInput;
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
  const splitFixedCost =
    input.fixedCostJpyOriginTwd !== undefined ||
    input.fixedCostTwdDirectTwd !== undefined;
  if (
    (splitFixedCost
      ? isMissingDecimal(input.fixedCostJpyOriginTwd) ||
        isMissingDecimal(input.fixedCostTwdDirectTwd)
      : isMissingDecimal(input.fixedCostTotalTwd)) ||
    isMissingDecimal(input.variableCostBaseTotalTwd) ||
    isMissingDecimal(input.creditCardRebateTwd) ||
    isMissingDecimal(input.unitGrossProfitTwd) ||
    isMissingDecimal(input.salaryTargetTwd)
  ) {
    return pendingOperatingCost("缺少損益平衡資料");
  }

  const fixedCostJpyOriginTwd = splitFixedCost
    ? parseNonNegativeDecimal(input.fixedCostJpyOriginTwd, "fixedCostJpyOriginTwd")
    : ExactDecimal.zero();
  const fixedCostTwdDirectTwd = splitFixedCost
    ? parseNonNegativeDecimal(input.fixedCostTwdDirectTwd, "fixedCostTwdDirectTwd")
    : parseNonNegativeDecimal(input.fixedCostTotalTwd, "fixedCostTotalTwd");
  const legacyFixedCostForFee = splitFixedCost
    ? fixedCostJpyOriginTwd
    : fixedCostTwdDirectTwd;
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

  const feeBase = legacyFixedCostForFee.add(variableCost);
  const costBase = feeBase.add(
    splitFixedCost ? fixedCostTwdDirectTwd : ExactDecimal.zero(),
  );
  const paymentFeeTwd = feeBase.multiply(ExactDecimal.from(PAYMENT_FEE_RATE));
  const netCostToRecoverTwd = subtractDecimal(
    costBase.add(paymentFeeTwd),
    rebate,
  );
  const rawBreakevenQuantity = ceilDecimal(
    netCostToRecoverTwd.divide(unitGrossProfit),
  );
  const rawSalaryTargetQuantity = ceilDecimal(
    netCostToRecoverTwd.add(salaryTarget).divide(unitGrossProfit),
  );
  const breakevenQuantity =
    rawBreakevenQuantity < 0n ? 0n : rawBreakevenQuantity;
  const salaryTargetQuantity =
    rawSalaryTargetQuantity < 0n ? 0n : rawSalaryTargetQuantity;

  return {
    status: "ready",
    paymentFeeTwd,
    netCostToRecoverTwd,
    breakevenQuantity,
    salaryTargetQuantity,
    conclusion: `以單件毛利 ${unitGrossProfit.toDecimalPlaces(2)} 元計，至少需賣 ${breakevenQuantity} 件回本；達日薪目標需 ${salaryTargetQuantity} 件。`,
  };
}
