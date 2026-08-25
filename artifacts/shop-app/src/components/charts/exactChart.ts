import { ExactDecimal } from "@workspace/db/transport-cost";

const NEGATIVE_ONE = ExactDecimal.from("-1");

export function exactDecimal(value: string): ExactDecimal | null {
  try {
    return ExactDecimal.from(value);
  } catch {
    return null;
  }
}

export function compareExact(
  leftDecimal: ExactDecimal,
  rightDecimal: ExactDecimal,
): -1 | 0 | 1 {
  const difference =
    leftDecimal.numerator * rightDecimal.denominator -
    rightDecimal.numerator * leftDecimal.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function exactPercent(
  valueDecimal: ExactDecimal,
  maximumDecimal: ExactDecimal,
): string | null {
  if (maximumDecimal.equals(ExactDecimal.zero())) return null;
  return valueDecimal
    .divide(maximumDecimal)
    .multiply(ExactDecimal.from("100"))
    .toDecimalPlaces(4);
}

export function exactPosition(
  valueDecimal: ExactDecimal,
  minimumDecimal: ExactDecimal,
  maximumDecimal: ExactDecimal,
): string {
  if (compareExact(minimumDecimal, maximumDecimal) === 0) return "50";

  const range = maximumDecimal.add(
    minimumDecimal.multiply(ExactDecimal.from("-1")),
  );
  const offset = valueDecimal.add(
    minimumDecimal.multiply(ExactDecimal.from("-1")),
  );
  return offset
    .divide(range)
    .multiply(ExactDecimal.from("100"))
    .toDecimalPlaces(4);
}

/**
 * KPI 圖表專用 TWD 顯示格式。金額全程保留 ExactDecimal，僅在最後顯示層
 * 四捨五入到兩位，並使用真正負號與不換行空白。
 */
export function formatChartTwd(value: string | null | undefined): string {
  if (value == null) return "待確認";
  const decimal = exactDecimal(value);
  if (decimal === null) return "待確認";

  const negative = decimal.isNegative();
  const magnitude = negative ? decimal.multiply(NEGATIVE_ONE) : decimal;
  const fixed = magnitude.toDecimalPlaces(2);
  const [integerPart, fractionPart = "00"] = fixed.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const displayNegative = negative && fixed !== "0.00";
  return `${displayNegative ? "−" : ""}NT$\u00a0${groupedInteger}.${fractionPart.padEnd(2, "0")}`;
}

export function chartTwdAriaLabel(value: string | null | undefined): string {
  const display = formatChartTwd(value);
  if (display === "待確認") return display;
  return display.startsWith("−")
    ? `負新台幣 ${display.slice(4).trimStart()} 元`
    : `新台幣 ${display.slice(3).trimStart()} 元`;
}
