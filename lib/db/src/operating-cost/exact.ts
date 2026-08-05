import {
  ExactDecimal,
  type DecimalInput,
  type QuantityInput,
} from "../transport-cost/index.ts";

export const OPERATING_COST_PENDING_LABEL = "待確認";

export interface PendingOperatingCost {
  status: "pending_confirmation";
  label: typeof OPERATING_COST_PENDING_LABEL;
  reason: string;
}

export function pendingOperatingCost(reason: string): PendingOperatingCost {
  return {
    status: "pending_confirmation",
    label: OPERATING_COST_PENDING_LABEL,
    reason,
  };
}

export function isMissingDecimal(
  value: DecimalInput,
): value is null | undefined | "" {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

export function parseNonNegativeDecimal(
  value: Exclude<DecimalInput, null | undefined>,
  fieldName: string,
): ExactDecimal {
  const parsed = ExactDecimal.from(value);
  if (parsed.isNegative()) {
    throw new RangeError(`${fieldName} cannot be negative`);
  }
  return parsed;
}

export function parsePositiveQuantity(
  value: QuantityInput,
): ExactDecimal | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let integer: bigint;
  if (typeof value === "bigint") {
    integer = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    integer = BigInt(value);
  } else if (/^\d+$/.test(value.trim())) {
    integer = BigInt(value.trim());
  } else {
    return null;
  }

  return integer > 0n ? ExactDecimal.from(integer) : null;
}

export function negateDecimal(value: ExactDecimal): ExactDecimal {
  return value.multiply(ExactDecimal.from("-1"));
}

export function subtractDecimal(
  left: ExactDecimal,
  right: ExactDecimal,
): ExactDecimal {
  return left.add(negateDecimal(right));
}

export function absoluteDecimal(value: ExactDecimal): ExactDecimal {
  return value.isNegative() ? negateDecimal(value) : value;
}

export function compareDecimals(
  left: ExactDecimal,
  right: ExactDecimal,
): -1 | 0 | 1 {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function ceilDecimal(value: ExactDecimal): bigint {
  const quotient = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  return remainder > 0n ? quotient + 1n : quotient;
}
