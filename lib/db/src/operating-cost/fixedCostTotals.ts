import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  pendingOperatingCost,
  parseNonNegativeDecimal,
  type PendingOperatingCost,
} from "./exact.ts";

export interface FixedCostEntryInput {
  mode?: "ESTIMATE" | "ACTUAL";
  currency: "JPY" | "TWD";
  originalAmount: DecimalInput;
  status?: "ACTIVE" | "VOID";
}

export interface FixedCostTotalsInput {
  entries: readonly FixedCostEntryInput[];
  exchangeRate?: DecimalInput;
}

export interface ReadyFixedCostTotals {
  status: "ready";
  fixedCostJpyOriginTwd: ExactDecimal;
  fixedCostTwdDirectTwd: ExactDecimal;
  fixedCostTotalTwd: ExactDecimal;
}

export type FixedCostTotalsResult =
  | ReadyFixedCostTotals
  | PendingOperatingCost;

export function calculateFixedCostTotals(
  input: FixedCostTotalsInput,
): FixedCostTotalsResult {
  const activeEntries = input.entries.filter(
    (entry) => entry.status !== "VOID",
  );
  const jpyOrigin = activeEntries
    .filter((entry) => entry.currency === "JPY")
    .reduce(
      (total, entry) =>
        total.add(
          parseNonNegativeDecimal(
            entry.originalAmount as Exclude<DecimalInput, null | undefined>,
            "originalAmount",
          ),
        ),
      ExactDecimal.zero(),
    );
  const twdDirect = activeEntries
    .filter((entry) => entry.currency === "TWD")
    .reduce(
      (total, entry) =>
        total.add(
          parseNonNegativeDecimal(
            entry.originalAmount as Exclude<DecimalInput, null | undefined>,
            "originalAmount",
          ),
        ),
      ExactDecimal.zero(),
    );

  if (!jpyOrigin.equals(ExactDecimal.zero()) && isMissingDecimal(input.exchangeRate)) {
    return pendingOperatingCost("缺少匯率");
  }
  const exchangeRate = isMissingDecimal(input.exchangeRate)
    ? ExactDecimal.zero()
    : parseNonNegativeDecimal(input.exchangeRate, "exchangeRate");
  const fixedCostJpyOriginTwd = jpyOrigin.multiply(exchangeRate);
  return {
    status: "ready",
    fixedCostJpyOriginTwd,
    fixedCostTwdDirectTwd: twdDirect,
    fixedCostTotalTwd: fixedCostJpyOriginTwd.add(twdDirect),
  };
}
