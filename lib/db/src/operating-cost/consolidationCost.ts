import { PAYMENT_FEE_RATE } from "../operating-settings/index.ts";
import {
  type DecimalInput,
  type ExactDecimal,
  type QuantityInput,
} from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  parseNonNegativeDecimal,
  parsePositiveQuantity,
  pendingOperatingCost,
  type PendingOperatingCost,
} from "./exact.ts";

export interface ConsolidationCostInput {
  totalWeightKg?: DecimalInput;
  rateJpyPerKg?: DecimalInput;
  exchangeRate?: DecimalInput;
  totalItemQuantity?: QuantityInput;
}

export interface ReadyConsolidationCost {
  status: "ready";
  baseJpy: ExactDecimal;
  paymentFeeJpy: ExactDecimal;
  baseCostTwd: ExactDecimal;
  paymentFeeTwd: ExactDecimal;
  totalCostTwd: ExactDecimal;
  unitCostTwd: ExactDecimal;
}

export type ConsolidationCostResult =
  | ReadyConsolidationCost
  | PendingOperatingCost;

export function calculateConsolidationCost(
  input: ConsolidationCostInput,
): ConsolidationCostResult {
  const quantity = parsePositiveQuantity(input.totalItemQuantity);
  if (quantity === null) {
    return pendingOperatingCost("缺少商品件數");
  }
  if (
    isMissingDecimal(input.totalWeightKg) ||
    isMissingDecimal(input.rateJpyPerKg) ||
    isMissingDecimal(input.exchangeRate)
  ) {
    return pendingOperatingCost("缺少合併運費資料");
  }

  const totalWeightKg = parseNonNegativeDecimal(
    input.totalWeightKg,
    "totalWeightKg",
  );
  const rateJpyPerKg = parseNonNegativeDecimal(
    input.rateJpyPerKg,
    "rateJpyPerKg",
  );
  const exchangeRate = parseNonNegativeDecimal(
    input.exchangeRate,
    "exchangeRate",
  );
  const baseJpy = totalWeightKg.multiply(rateJpyPerKg);
  const paymentFeeJpy = baseJpy.multiply(
    parseNonNegativeDecimal(PAYMENT_FEE_RATE, "paymentFeeRate"),
  );
  const baseCostTwd = baseJpy.multiply(exchangeRate);
  const paymentFeeTwd = paymentFeeJpy.multiply(exchangeRate);
  const totalCostTwd = baseCostTwd.add(paymentFeeTwd);

  return {
    status: "ready",
    baseJpy,
    paymentFeeJpy,
    baseCostTwd,
    paymentFeeTwd,
    totalCostTwd,
    unitCostTwd: totalCostTwd.divide(quantity),
  };
}
