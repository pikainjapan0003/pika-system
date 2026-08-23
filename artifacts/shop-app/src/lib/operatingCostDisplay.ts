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
/**
 * 顯示層專用（O-1）：去除金額字串無意義的尾隨小數零。
 *
 * 純字串處理、不經 Number／parseFloat／toFixed，值本身不變：
 *   "0.000000000000"     → "0"
 *   "6000.000000000000"  → "6000"
 *   "123.450000"         → "123.45"
 *   "0.10"               → "0.1"
 *   "6000."（打字中途）  → "6000."（保留小數點，不干擾輸入）
 *   ""                   → ""
 *
 * ⛔ 只用於 render 的顯示值；送出給後端的字串維持原狀。
 */
export function trimAmountForDisplay(value: string): string {
  const dot = value.indexOf(".");
  if (dot === -1) return value;
  const fraction = value.slice(dot + 1);
  if (fraction === "") return value;
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed === ""
    ? value.slice(0, dot)
    : `${value.slice(0, dot)}.${trimmed}`;
}

/** 解析為整數／小數部件（小數尾零去除）；不符後端文法（^\d+(?:\.\d+)?$）回 null。 */
function parseDecimalParts(
  value: string,
): { int: string; frac: string } | null {
  const v = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(v)) return null;
  const [intPart, fracPart = ""] = v.split(".");
  const int = intPart.replace(/^0+(?=\d)/, "");
  return { int: int === "" ? "0" : int, frac: fracPart.replace(/0+$/, "") };
}

/**
 * 字串級「上界檢查」（O-2 輸入合理性上限的比較核心）。
 * 整數部件先比位數、再比字典序；整數相等時小數部件逐位比較（缺位視為 0）。
 * 全程不引入 Number／parseFloat。
 * 輸入為空或不符合後端文法時回 true（交由後端既有的 400 判定，不在此攔截）。
 */
export function decimalStringAtMost(value: string, max: string): boolean {
  const a = parseDecimalParts(value);
  const b = parseDecimalParts(max);
  if (a === null || b === null) return true;
  if (a.int.length !== b.int.length) return a.int.length < b.int.length;
  if (a.int !== b.int) return a.int < b.int;
  const digits = Math.max(a.frac.length, b.frac.length);
  for (let index = 0; index < digits; index += 1) {
    const da = index < a.frac.length ? a.frac.charCodeAt(index) : 48;
    const db = index < b.frac.length ? b.frac.charCodeAt(index) : 48;
    if (da !== db) return da < db;
  }
  return true; // 相等亦屬「未超過上限」
}
