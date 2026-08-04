import { type DecimalInput, ExactDecimal } from "../transport-cost/index.ts";
import {
  absoluteDecimal,
  compareDecimals,
  isMissingDecimal,
  pendingOperatingCost,
  subtractDecimal,
  type PendingOperatingCost,
} from "./exact.ts";

export type VarianceMetricKind = "income" | "profit" | "cost";
export type VarianceDirection = "favorable" | "unfavorable" | "neutral";

export interface VarianceInput {
  estimated?: DecimalInput;
  actual?: DecimalInput;
  metricKind: VarianceMetricKind;
}

export interface ReadyVariance {
  status: "ready";
  difference: ExactDecimal;
  percent: ExactDecimal | null;
  direction: VarianceDirection;
}

export type VarianceResult = ReadyVariance | PendingOperatingCost;

export function calculateVariance(input: VarianceInput): VarianceResult {
  if (isMissingDecimal(input.estimated) || isMissingDecimal(input.actual)) {
    return pendingOperatingCost("缺少預估或實際資料");
  }

  const estimated = ExactDecimal.from(input.estimated);
  const actual = ExactDecimal.from(input.actual);
  const difference = subtractDecimal(actual, estimated);
  const comparison = compareDecimals(difference, ExactDecimal.zero());
  const direction: VarianceDirection =
    comparison === 0
      ? "neutral"
      : input.metricKind === "cost"
        ? comparison < 0
          ? "favorable"
          : "unfavorable"
        : comparison > 0
          ? "favorable"
          : "unfavorable";

  return {
    status: "ready",
    difference,
    percent: estimated.equals(ExactDecimal.zero())
      ? null
      : difference.divide(absoluteDecimal(estimated)),
    direction,
  };
}
