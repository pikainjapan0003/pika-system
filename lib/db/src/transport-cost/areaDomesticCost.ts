import {
  ExactDecimal,
  PENDING_CONFIRMATION_LABEL,
  type DecimalInput,
  type QuantityInput,
} from "./index.ts";

const AREA_DOMESTIC_PAYMENT_FEE_RATE = "0.015";

export interface AreaDomesticCostInput {
  cardboardUnitJpy: DecimalInput;
  shippingUnitJpy: DecimalInput;
  parcelCount: QuantityInput;
  estimatedItemQuantity: QuantityInput;
  exchangeRate: DecimalInput;
}

export interface ReadyAreaDomesticCost {
  status: "ready";
  fee1_5Pct: ExactDecimal;
  totalTwd: ExactDecimal;
  unitDomesticTwd: ExactDecimal;
}

export interface PendingAreaDomesticCost {
  status: "pending_confirmation";
  label: typeof PENDING_CONFIRMATION_LABEL;
  reason: "missing_estimated_item_quantity" | "missing_exchange_rate";
}

export type AreaDomesticCostResult =
  | ReadyAreaDomesticCost
  | PendingAreaDomesticCost;

function isMissingDecimal(value: DecimalInput): value is null | undefined | "" {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function parseNonNegativeDecimal(
  value: DecimalInput,
  fieldName: string,
): ExactDecimal {
  if (isMissingDecimal(value)) {
    throw new TypeError(`${fieldName} requires a decimal value`);
  }

  const parsed = ExactDecimal.from(value);
  if (parsed.isNegative()) {
    throw new RangeError(`${fieldName} cannot be negative`);
  }
  return parsed;
}

function parseInteger(value: QuantityInput): bigint | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    const normalized = value.toString();
    return /^[+-]?\d+$/.test(normalized) ? BigInt(normalized) : null;
  }

  const normalized = value.trim();
  return /^[+-]?\d+$/.test(normalized) ? BigInt(normalized) : null;
}

function parseNonNegativeQuantity(
  value: QuantityInput,
  fieldName: string,
): ExactDecimal {
  const parsed = parseInteger(value);
  if (parsed === null) {
    throw new TypeError(`${fieldName} requires an integer value`);
  }
  if (parsed < 0n) {
    throw new RangeError(`${fieldName} cannot be negative`);
  }
  return ExactDecimal.from(parsed);
}

function pending(
  reason: PendingAreaDomesticCost["reason"],
): PendingAreaDomesticCost {
  return {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason,
  };
}

export function calculateAreaDomesticCost(
  input: AreaDomesticCostInput,
): AreaDomesticCostResult {
  const estimatedItemQuantity = parseInteger(input.estimatedItemQuantity);
  if (estimatedItemQuantity === null || estimatedItemQuantity <= 0n) {
    return pending("missing_estimated_item_quantity");
  }
  if (isMissingDecimal(input.exchangeRate)) {
    return pending("missing_exchange_rate");
  }

  const cardboardUnitJpy = parseNonNegativeDecimal(
    input.cardboardUnitJpy,
    "cardboardUnitJpy",
  );
  const shippingUnitJpy = parseNonNegativeDecimal(
    input.shippingUnitJpy,
    "shippingUnitJpy",
  );
  const parcelCount = parseNonNegativeQuantity(
    input.parcelCount,
    "parcelCount",
  );
  const exchangeRate = parseNonNegativeDecimal(
    input.exchangeRate,
    "exchangeRate",
  );
  const perParcelJpy = cardboardUnitJpy.add(shippingUnitJpy);
  const fee1_5Pct = perParcelJpy.multiply(
    ExactDecimal.from(AREA_DOMESTIC_PAYMENT_FEE_RATE),
  );
  const totalTwd = perParcelJpy
    .add(fee1_5Pct)
    .multiply(parcelCount)
    .multiply(exchangeRate);

  return {
    status: "ready",
    fee1_5Pct,
    totalTwd,
    unitDomesticTwd: totalTwd.divide(ExactDecimal.from(estimatedItemQuantity)),
  };
}
