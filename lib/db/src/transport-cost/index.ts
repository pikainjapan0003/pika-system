export type DecimalInput = string | bigint | null | undefined;
export type QuantityInput = string | bigint | number | null | undefined;

export const PENDING_CONFIRMATION_LABEL = "待確認";

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

/**
 * Exact base-10 input arithmetic backed by a reduced BigInt fraction.
 * No IEEE-754 number participates in monetary accumulation, and division
 * remains exact until a caller explicitly requests a display scale.
 */
export class ExactDecimal {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    if (denominator === 0n) {
      throw new RangeError("Decimal denominator cannot be zero");
    }

    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(numerator, denominator);
    this.numerator = (numerator / divisor) * sign;
    this.denominator = (denominator / divisor) * sign;
  }

  static from(value: Exclude<DecimalInput, null | undefined>): ExactDecimal {
    if (typeof value === "bigint") {
      return new ExactDecimal(value, 1n);
    }

    const normalized = value.trim();
    const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(normalized);
    if (!match) {
      throw new TypeError(`Invalid decimal value: ${value}`);
    }

    const fraction = match[3] ?? "";
    const denominator = 10n ** BigInt(fraction.length);
    const unsignedNumerator = BigInt(`${match[2]}${fraction}`);
    const numerator = match[1] === "-" ? -unsignedNumerator : unsignedNumerator;
    return new ExactDecimal(numerator, denominator);
  }

  static zero(): ExactDecimal {
    return new ExactDecimal(0n, 1n);
  }

  add(other: ExactDecimal): ExactDecimal {
    return new ExactDecimal(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: ExactDecimal): ExactDecimal {
    return new ExactDecimal(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: ExactDecimal): ExactDecimal {
    if (other.numerator === 0n) {
      throw new RangeError("Cannot divide a decimal by zero");
    }
    return new ExactDecimal(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  equals(other: ExactDecimal): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  isNegative(): boolean {
    return this.numerator < 0n;
  }

  /** Half-up rounding at the requested final/display scale. */
  toDecimalPlaces(scale: number): string {
    if (!Number.isSafeInteger(scale) || scale < 0) {
      throw new RangeError("Decimal scale must be a non-negative safe integer");
    }

    const negative = this.numerator < 0n;
    const absoluteNumerator = negative ? -this.numerator : this.numerator;
    const scaleFactor = 10n ** BigInt(scale);
    const scaledNumerator = absoluteNumerator * scaleFactor;
    let quotient = scaledNumerator / this.denominator;
    const remainder = scaledNumerator % this.denominator;

    if (remainder * 2n >= this.denominator) {
      quotient += 1n;
    }

    const digits = quotient.toString().padStart(scale + 1, "0");
    const unsigned = scale === 0
      ? digits
      : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    return negative && quotient !== 0n ? `-${unsigned}` : unsigned;
  }

  toFractionString(): string {
    return `${this.numerator}/${this.denominator}`;
  }
}

export interface ManualOverride {
  isOverridden: boolean;
  value?: DecimalInput;
}

export interface TransportCostOverrides {
  etcJpy?: ManualOverride;
  fee1_5Pct?: ManualOverride;
  totalJpy?: ManualOverride;
  domesticPerItem?: ManualOverride;
  transportPerItem?: ManualOverride;
  finalCostPerItem?: ManualOverride;
}

export interface TransportCostInput {
  estQty: QuantityInput;
  exchangeRate: DecimalInput;
  trainJpy?: DecimalInput;
  fuelJpy?: DecimalInput;
  parkingJpy?: DecimalInput;
  cardboardJpy?: DecimalInput;
  shippingJpy?: DecimalInput;
  overrides?: TransportCostOverrides;
}

export interface ReadyTransportCost {
  status: "ready";
  etcJpy: ExactDecimal;
  fee1_5Pct: ExactDecimal;
  totalJpy: ExactDecimal;
  domesticPerItem: ExactDecimal;
  transportPerItem: ExactDecimal;
  finalCostPerItem: ExactDecimal;
  displayFinalCostTwd: string;
}

export interface PendingTransportCost {
  status: "pending_confirmation";
  label: typeof PENDING_CONFIRMATION_LABEL;
  reason: "invalid_est_qty" | "missing_exchange_rate";
}

export type TransportCostResult = ReadyTransportCost | PendingTransportCost;

function parsePositiveQuantity(value: QuantityInput): bigint | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    parsed = BigInt(value);
  } else if (/^\d+$/.test(value.trim())) {
    parsed = BigInt(value.trim());
  } else {
    return null;
  }

  return parsed > 0n ? parsed : null;
}

function isEmptyDecimal(value: DecimalInput): value is null | undefined | "" {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function parseOptionalNonNegativeDecimal(value: DecimalInput, fieldName: string): ExactDecimal {
  const parsed = isEmptyDecimal(value) ? ExactDecimal.zero() : ExactDecimal.from(value);
  if (parsed.isNegative()) {
    throw new RangeError(`${fieldName} cannot be negative`);
  }
  return parsed;
}

function applyOverride(fieldName: string, calculated: ExactDecimal, override?: ManualOverride): ExactDecimal {
  if (!override?.isOverridden) {
    return calculated;
  }
  if (isEmptyDecimal(override.value)) {
    throw new TypeError(`${fieldName} override requires a decimal value`);
  }
  return parseOptionalNonNegativeDecimal(override.value, `${fieldName} override`);
}

export function calculateTransportCost(input: TransportCostInput): TransportCostResult {
  const estQty = parsePositiveQuantity(input.estQty);
  if (estQty === null) {
    return {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "invalid_est_qty",
    };
  }

  if (isEmptyDecimal(input.exchangeRate)) {
    return {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_exchange_rate",
    };
  }

  const exchangeRate = parseOptionalNonNegativeDecimal(input.exchangeRate, "exchangeRate");
  const quantity = ExactDecimal.from(estQty);
  const trainJpy = parseOptionalNonNegativeDecimal(input.trainJpy, "trainJpy");
  const fuelJpy = parseOptionalNonNegativeDecimal(input.fuelJpy, "fuelJpy");
  const parkingJpy = parseOptionalNonNegativeDecimal(input.parkingJpy, "parkingJpy");
  const cardboardJpy = parseOptionalNonNegativeDecimal(input.cardboardJpy, "cardboardJpy");
  const shippingJpy = parseOptionalNonNegativeDecimal(input.shippingJpy, "shippingJpy");

  const etcJpy = applyOverride(
    "etcJpy",
    ExactDecimal.from("30").multiply(quantity),
    input.overrides?.etcJpy,
  );
  const fee1_5Pct = applyOverride(
    "fee1_5Pct",
    cardboardJpy.add(shippingJpy).multiply(ExactDecimal.from("0.015")),
    input.overrides?.fee1_5Pct,
  );
  const totalJpy = applyOverride(
    "totalJpy",
    etcJpy
      .add(trainJpy)
      .add(fuelJpy)
      .add(parkingJpy)
      .add(cardboardJpy)
      .add(shippingJpy)
      .add(fee1_5Pct),
    input.overrides?.totalJpy,
  );
  const domesticPerItem = applyOverride(
    "domesticPerItem",
    cardboardJpy.add(shippingJpy).divide(quantity),
    input.overrides?.domesticPerItem,
  );
  const transportPerItem = applyOverride(
    "transportPerItem",
    etcJpy.add(trainJpy).add(fuelJpy).add(parkingJpy).add(fee1_5Pct).divide(quantity),
    input.overrides?.transportPerItem,
  );
  const finalCostPerItem = applyOverride(
    "finalCostPerItem",
    domesticPerItem.add(transportPerItem).multiply(exchangeRate),
    input.overrides?.finalCostPerItem,
  );

  return {
    status: "ready",
    etcJpy,
    fee1_5Pct,
    totalJpy,
    domesticPerItem,
    transportPerItem,
    finalCostPerItem,
    displayFinalCostTwd: finalCostPerItem.toDecimalPlaces(0),
  };
}
