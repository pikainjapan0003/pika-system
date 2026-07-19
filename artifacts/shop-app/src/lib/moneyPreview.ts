import { ExactDecimal } from "@workspace/db/transport-cost";

export type MoneyPreviewInput = string | number | bigint | null | undefined;

export interface MoneyPreviewLine {
  unitPrice: MoneyPreviewInput;
  quantity: number;
}

export interface MoneyPreview {
  unitPrice: string;
  itemSubtotal: string;
  shippingFee: string;
  discountAmount: string;
  orderTotal: string;
  paidAmount: string;
  remainingAmount: string;
  hasDiscount: boolean;
  discountExceedsGross: boolean;
}

const NEGATIVE_ONE = ExactDecimal.from("-1");

function parseNonNegativeMoney(value: MoneyPreviewInput): ExactDecimal {
  if (value === null || value === undefined || String(value).trim() === "") {
    return ExactDecimal.zero();
  }

  try {
    const parsed = ExactDecimal.from(String(value));
    return parsed.isNegative() ? ExactDecimal.zero() : parsed;
  } catch {
    return ExactDecimal.zero();
  }
}

function parseQuantity(value: number): ExactDecimal {
  return Number.isSafeInteger(value) && value > 0
    ? ExactDecimal.from(String(value))
    : ExactDecimal.zero();
}

function subtract(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return left.add(right.multiply(NEGATIVE_ONE));
}

function clampToZero(value: ExactDecimal): ExactDecimal {
  return value.isNegative() ? ExactDecimal.zero() : value;
}

function formatExactTwd(value: ExactDecimal): string {
  const fixed = value.toDecimalPlaces(2);
  const [integerPart, fractionPart = ""] = fixed.split(".");
  const sign = integerPart.startsWith("-") ? "-" : "";
  const unsignedInteger = sign ? integerPart.slice(1) : integerPart;
  const groupedInteger = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFraction = fractionPart.replace(/0+$/, "");
  return `${sign}${groupedInteger}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

/**
 * Display-only money preview. All accumulation stays in ExactDecimal and is
 * rounded half-up only at the final two-decimal display boundary.
 */
export function calculateMoneyPreview(input: {
  lines: readonly MoneyPreviewLine[];
  shippingFee?: MoneyPreviewInput;
  discountAmount?: MoneyPreviewInput;
  paidAmount?: MoneyPreviewInput;
}): MoneyPreview {
  const subtotal = input.lines.reduce(
    (sum, line) =>
      sum.add(
        parseNonNegativeMoney(line.unitPrice).multiply(
          parseQuantity(line.quantity),
        ),
      ),
    ExactDecimal.zero(),
  );
  const shippingFee = parseNonNegativeMoney(input.shippingFee);
  const discountAmount = parseNonNegativeMoney(input.discountAmount);
  const paidAmount = parseNonNegativeMoney(input.paidAmount);
  const gross = subtotal.add(shippingFee);
  const discountDelta = subtract(discountAmount, gross);
  const orderTotal = clampToZero(subtract(gross, discountAmount));
  const remainingAmount = clampToZero(subtract(orderTotal, paidAmount));

  return {
    // A cart has no single canonical unit price, so its summary intentionally
    // exposes "0" here; callers must use each line or itemSubtotal instead.
    unitPrice: formatExactTwd(
      input.lines.length === 1
        ? parseNonNegativeMoney(input.lines[0]?.unitPrice)
        : ExactDecimal.zero(),
    ),
    itemSubtotal: formatExactTwd(subtotal),
    shippingFee: formatExactTwd(shippingFee),
    discountAmount: formatExactTwd(discountAmount),
    orderTotal: formatExactTwd(orderTotal),
    paidAmount: formatExactTwd(paidAmount),
    remainingAmount: formatExactTwd(remainingAmount),
    hasDiscount: !discountAmount.equals(ExactDecimal.zero()),
    discountExceedsGross:
      !discountDelta.isNegative() && !discountDelta.equals(ExactDecimal.zero()),
  };
}
