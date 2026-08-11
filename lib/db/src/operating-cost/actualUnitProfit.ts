import {
  type DecimalInput,
  ExactDecimal,
  type QuantityInput,
} from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  OPERATING_COST_PENDING_LABEL,
  parseNonNegativeDecimal,
  parsePositiveQuantity,
  subtractDecimal,
} from "./exact.ts";

export type ActualUnitProfitPendingReason =
  | "missing_actual_quantity"
  | "missing_actual_exchange_rate"
  | "missing_product_cost_jpy"
  | "missing_unit_price_twd"
  | "missing_route_actual_cost";

export interface ReadyActualUnitProfit {
  status: "ready";
  routeActualUnitTransportCostTwd: ExactDecimal;
  allocatedActualUnitTransportCostTwd: ExactDecimal;
  productCostTwd: ExactDecimal;
  actualUnitProfitTwd: ExactDecimal;
}

export interface PendingActualUnitProfit {
  status: "pending_confirmation";
  label: typeof OPERATING_COST_PENDING_LABEL;
  reason: ActualUnitProfitPendingReason;
}

export type ActualUnitProfitResult =
  | ReadyActualUnitProfit
  | PendingActualUnitProfit;

function pending(
  reason: ActualUnitProfitPendingReason,
): PendingActualUnitProfit {
  return {
    status: "pending_confirmation",
    label: OPERATING_COST_PENDING_LABEL,
    reason,
  };
}

export function calculateActualUnitProfit(input: {
  unitPriceTwd?: DecimalInput;
  costJpy?: DecimalInput;
  actualExchangeRate?: DecimalInput;
  routeActualCostTwd?: DecimalInput;
  routeActualQuantity?: QuantityInput;
  isTransportCostExempt?: boolean;
}): ActualUnitProfitResult {
  const routeActualQuantity = parsePositiveQuantity(input.routeActualQuantity);
  if (routeActualQuantity === null) return pending("missing_actual_quantity");
  if (isMissingDecimal(input.actualExchangeRate)) {
    return pending("missing_actual_exchange_rate");
  }
  if (isMissingDecimal(input.costJpy)) {
    return pending("missing_product_cost_jpy");
  }
  if (isMissingDecimal(input.unitPriceTwd)) {
    return pending("missing_unit_price_twd");
  }
  if (isMissingDecimal(input.routeActualCostTwd)) {
    return pending("missing_route_actual_cost");
  }

  const actualExchangeRate = parseNonNegativeDecimal(
    input.actualExchangeRate,
    "actualExchangeRate",
  );
  const productCostTwd = parseNonNegativeDecimal(
    input.costJpy,
    "costJpy",
  ).multiply(actualExchangeRate);
  const routeActualUnitTransportCostTwd = parseNonNegativeDecimal(
    input.routeActualCostTwd,
    "routeActualCostTwd",
  ).divide(routeActualQuantity);
  const allocatedActualUnitTransportCostTwd = input.isTransportCostExempt
    ? ExactDecimal.zero()
    : routeActualUnitTransportCostTwd;
  const actualUnitProfitTwd = subtractDecimal(
    subtractDecimal(
      parseNonNegativeDecimal(input.unitPriceTwd, "unitPriceTwd"),
      productCostTwd,
    ),
    allocatedActualUnitTransportCostTwd,
  );

  return {
    status: "ready",
    routeActualUnitTransportCostTwd,
    allocatedActualUnitTransportCostTwd,
    productCostTwd,
    actualUnitProfitTwd,
  };
}
