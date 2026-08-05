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

export interface HepCostInput {
  hepTotalJpy?: DecimalInput;
  totalItemQuantity?: QuantityInput;
  exchangeRate?: DecimalInput;
}

export interface ReadyHepCost {
  status: "ready";
  unitHepCostTwd: ExactDecimal;
}

export type HepCostResult = ReadyHepCost | PendingOperatingCost;

export function calculateHepCost(input: HepCostInput): HepCostResult {
  const quantity = parsePositiveQuantity(input.totalItemQuantity);
  if (quantity === null) {
    return pendingOperatingCost("缺少商品件數");
  }
  if (isMissingDecimal(input.hepTotalJpy)) {
    return pendingOperatingCost("缺少 HEP 總額");
  }
  if (isMissingDecimal(input.exchangeRate)) {
    return pendingOperatingCost("缺少行程匯率");
  }

  const hepTotalJpy = parseNonNegativeDecimal(input.hepTotalJpy, "hepTotalJpy");
  const exchangeRate = parseNonNegativeDecimal(
    input.exchangeRate,
    "exchangeRate",
  );

  return {
    status: "ready",
    unitHepCostTwd: hepTotalJpy.divide(quantity).multiply(exchangeRate),
  };
}
