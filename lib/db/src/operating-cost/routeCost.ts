import { PAYMENT_FEE_RATE } from "../operating-settings/index.ts";
import {
  type DecimalInput,
  ExactDecimal,
  type QuantityInput,
} from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  parseNonNegativeDecimal,
  parsePositiveQuantity,
  pendingOperatingCost,
  type PendingOperatingCost,
} from "./exact.ts";

export interface RouteCostInput {
  fuelJpy?: DecimalInput;
  etcJpy?: DecimalInput;
  trainJpy?: DecimalInput;
  parkingJpy?: DecimalInput;
  exchangeRate?: DecimalInput;
  tripCount?: QuantityInput;
  regionalItemQuantity?: QuantityInput;
}

export interface ReadyRouteCost {
  status: "ready";
  subtotalJpy: ExactDecimal;
  subtotalTwdPerTrip: ExactDecimal;
  baseRouteCostTwd: ExactDecimal;
  paymentFeeTwd: ExactDecimal;
  totalRouteCostTwd: ExactDecimal;
  unitRouteCostTwd: ExactDecimal;
}

export type RouteCostResult = ReadyRouteCost | PendingOperatingCost;

export function calculateRouteCost(input: RouteCostInput): RouteCostResult {
  const tripCount = parsePositiveQuantity(input.tripCount);
  if (tripCount === null) {
    return pendingOperatingCost("缺少路線趟數");
  }
  const quantity = parsePositiveQuantity(input.regionalItemQuantity);
  if (quantity === null) {
    return pendingOperatingCost("缺少區域商品件數");
  }
  if (isMissingDecimal(input.exchangeRate)) {
    return pendingOperatingCost("缺少行程匯率");
  }

  const jpyInputs: Array<[string, DecimalInput]> = [
    ["fuelJpy", input.fuelJpy],
    ["etcJpy", input.etcJpy],
    ["trainJpy", input.trainJpy],
    ["parkingJpy", input.parkingJpy],
  ];
  if (jpyInputs.some(([, value]) => isMissingDecimal(value))) {
    return pendingOperatingCost("缺少路線成本資料");
  }

  const subtotalJpy = jpyInputs.reduce(
    (total, [fieldName, value]) =>
      total.add(
        parseNonNegativeDecimal(
          value as Exclude<DecimalInput, null | undefined>,
          fieldName,
        ),
      ),
    ExactDecimal.zero(),
  );
  const exchangeRate = parseNonNegativeDecimal(
    input.exchangeRate,
    "exchangeRate",
  );
  const subtotalTwdPerTrip = subtotalJpy.multiply(exchangeRate);
  const paymentFeePerTrip = subtotalTwdPerTrip.multiply(
    ExactDecimal.from(PAYMENT_FEE_RATE),
  );
  const baseRouteCostTwd = subtotalTwdPerTrip.multiply(tripCount);
  const paymentFeeTwd = paymentFeePerTrip.multiply(tripCount);
  const totalRouteCostTwd = baseRouteCostTwd.add(paymentFeeTwd);

  return {
    status: "ready",
    subtotalJpy,
    subtotalTwdPerTrip,
    baseRouteCostTwd,
    paymentFeeTwd,
    totalRouteCostTwd,
    unitRouteCostTwd: totalRouteCostTwd.divide(quantity),
  };
}
