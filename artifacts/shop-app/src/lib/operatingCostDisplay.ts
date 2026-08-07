import { ExactDecimal } from "@workspace/db/transport-cost";
import { formatMoneyForDisplay } from "./moneyPreview";

export type OperatingCostCurrency = "JPY" | "TWD";

export const OPERATING_COST_PENDING_LABEL = "待確認";

function parseNonNegativeDecimal(value: string): ExactDecimal | null {
  const normalized = value.trim();
  if (!normalized) return null;

  try {
    const decimal = ExactDecimal.from(normalized);
    return decimal.isNegative() ? null : decimal;
  } catch {
    return null;
  }
}

function formatTwoDecimalPlaces(value: ExactDecimal): string {
  const fixed = value.toDecimalPlaces(2);
  const [integerPart, fractionPart = "00"] = fixed.split(".");
  return `${formatMoneyForDisplay(integerPart)}.${fractionPart.padEnd(2, "0")}`;
}

/**
 * Formats an original-currency operating cost for display only. Invalid,
 * negative, or unconvertible values fail closed instead of looking like zero.
 */
export function formatConvertedAmount(
  originalAmount: string,
  currency: OperatingCostCurrency,
  exchangeRate: string,
): string {
  const amount = parseNonNegativeDecimal(originalAmount);
  if (amount === null) return OPERATING_COST_PENDING_LABEL;

  if (currency === "TWD") {
    return `NT$${formatMoneyForDisplay(amount.toDecimalPlaces(12))}`;
  }

  const rate = parseNonNegativeDecimal(exchangeRate);
  if (rate === null) return OPERATING_COST_PENDING_LABEL;

  return `≈ NT$${formatTwoDecimalPlaces(amount.multiply(rate))}`;
}

export function formatApiTwd(value: string | null | undefined): string {
  if (value == null) return OPERATING_COST_PENDING_LABEL;
  try {
    const parsed = ExactDecimal.from(value);
    const negative = parsed.isNegative();
    const magnitude = negative
      ? parsed.multiply(ExactDecimal.from("-1"))
      : parsed;
    return `NT$${negative ? "-" : ""}${formatMoneyForDisplay(
      magnitude.toDecimalPlaces(12),
    )}`;
  } catch {
    return OPERATING_COST_PENDING_LABEL;
  }
}
