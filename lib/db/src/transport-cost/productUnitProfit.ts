import { ExactDecimal, PENDING_CONFIRMATION_LABEL } from "./index.ts";
import type { DecimalInput } from "./index.ts";
import { resolveProductTransportCost } from "./productTransportCost.ts";
import type {
  ProductTransportCostResult,
  ResolveProductTransportCostInput,
} from "./productTransportCost.ts";

export const TRANSPORT_EXEMPT_LABEL = "免攤";

type PendingTransportReason = Extract<
  ProductTransportCostResult,
  { status: "pending_confirmation" }
>["reason"];

export interface CalculateProductUnitProfitInput {
  unitPriceTwd: DecimalInput;
  costJpy: DecimalInput;
  storePurchaseExchangeRate: DecimalInput;
  isTransportCostExempt: boolean;
  transport: ResolveProductTransportCostInput;
}

interface ProductUnitProfitValues {
  productCostTwd: ExactDecimal;
  unitTransportCostTwd: ExactDecimal;
  unitProfitTwd: ExactDecimal;
  fullUnitProfitTwd: ExactDecimal;
  displayProductCostTwd: string;
  displayUnitTransportCostTwd: string;
  displayUnitProfitTwd: string;
  displayFullUnitProfitTwd: string;
}

export interface ReadyProductUnitProfit extends ProductUnitProfitValues {
  status: "ready";
  transportStatus: "allocated";
}

export interface TransportExemptProductUnitProfit extends ProductUnitProfitValues {
  status: "ready";
  transportStatus: "exempt";
  label: typeof TRANSPORT_EXEMPT_LABEL;
}

export interface PendingProductUnitProfit {
  status: "pending_confirmation";
  label: typeof PENDING_CONFIRMATION_LABEL;
  reason:
    | "missing_product_cost_jpy"
    | "missing_store_purchase_exchange_rate"
    | "transport_pending_confirmation";
  transportReason?: PendingTransportReason;
}

export type ProductUnitProfitResult =
  | ReadyProductUnitProfit
  | TransportExemptProductUnitProfit
  | PendingProductUnitProfit;

function isEmptyDecimal(value: DecimalInput): value is null | undefined | "" {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function parseRequiredNonNegativeDecimal(
  value: DecimalInput,
  fieldName: string,
): ExactDecimal {
  if (isEmptyDecimal(value)) {
    throw new TypeError(`${fieldName} requires a decimal value`);
  }

  const parsed = ExactDecimal.from(value);
  if (parsed.isNegative()) {
    throw new RangeError(`${fieldName} cannot be negative`);
  }
  return parsed;
}

function subtract(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return left.add(right.multiply(ExactDecimal.from("-1")));
}

function values(
  productCostTwd: ExactDecimal,
  unitTransportCostTwd: ExactDecimal,
  fullUnitProfitTwd: ExactDecimal,
): ProductUnitProfitValues {
  const unitProfitTwd = subtract(fullUnitProfitTwd, unitTransportCostTwd);
  return {
    productCostTwd,
    unitTransportCostTwd,
    unitProfitTwd,
    fullUnitProfitTwd,
    displayProductCostTwd: productCostTwd.toDecimalPlaces(0),
    displayUnitTransportCostTwd: unitTransportCostTwd.toDecimalPlaces(0),
    displayUnitProfitTwd: unitProfitTwd.toDecimalPlaces(0),
    displayFullUnitProfitTwd: fullUnitProfitTwd.toDecimalPlaces(0),
  };
}

/**
 * Calculates current per-unit profit with exact decimal arithmetic.
 * Purchase cost uses the store rate (Q65); transport cost remains delegated
 * to resolveProductTransportCost and therefore uses the parent trip rate (Q61/Q62).
 */
export function calculateProductUnitProfit(
  input: CalculateProductUnitProfitInput,
): ProductUnitProfitResult {
  if (isEmptyDecimal(input.costJpy)) {
    return {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_product_cost_jpy",
    };
  }
  if (isEmptyDecimal(input.storePurchaseExchangeRate)) {
    return {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_store_purchase_exchange_rate",
    };
  }

  const unitPriceTwd = parseRequiredNonNegativeDecimal(
    input.unitPriceTwd,
    "unitPriceTwd",
  );
  const costJpy = parseRequiredNonNegativeDecimal(input.costJpy, "costJpy");
  const storeRate = parseRequiredNonNegativeDecimal(
    input.storePurchaseExchangeRate,
    "storePurchaseExchangeRate",
  );
  const productCostTwd = costJpy.multiply(storeRate);
  const fullUnitProfitTwd = subtract(unitPriceTwd, productCostTwd);

  if (input.isTransportCostExempt) {
    return {
      status: "ready",
      transportStatus: "exempt",
      label: TRANSPORT_EXEMPT_LABEL,
      ...values(productCostTwd, ExactDecimal.zero(), fullUnitProfitTwd),
    };
  }

  const transport = resolveProductTransportCost(input.transport);
  if (transport.status === "pending_confirmation") {
    return {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "transport_pending_confirmation",
      transportReason: transport.reason,
    };
  }

  return {
    status: "ready",
    transportStatus: "allocated",
    ...values(productCostTwd, transport.finalCostPerItem, fullUnitProfitTwd),
  };
}
