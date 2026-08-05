import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  pendingOperatingCost,
  type PendingOperatingCost,
} from "./exact.ts";
import { calculateVariance, type ReadyVariance } from "./variance.ts";

export interface FixedCostVarianceEntry {
  mode: "ESTIMATE" | "ACTUAL";
  currency: "JPY" | "TWD";
  originalAmount: DecimalInput;
  categoryId?: number | null;
  categoryName?: string | null;
  customLabel?: string | null;
  status?: "ACTIVE" | "VOID";
}

export type FixedCostExchangeRates =
  | DecimalInput
  | { estimated?: DecimalInput; actual?: DecimalInput };

export interface FixedCostVarianceRow {
  key: string;
  label: string;
  estimatedTwd: ExactDecimal | null;
  actualTwd: ExactDecimal | null;
  state: "matched" | "未發生" | "預算外";
  variance: ReadyVariance | null;
}

export interface ReadyFixedCostVariance {
  status: "ready";
  rows: FixedCostVarianceRow[];
}

export type FixedCostVarianceResult =
  | ReadyFixedCostVariance
  | PendingOperatingCost;

function entryKey(entry: FixedCostVarianceEntry): string {
  return entry.categoryId !== null && entry.categoryId !== undefined
    ? `category:${entry.categoryId}`
    : `custom:${entry.customLabel ?? ""}`;
}

function entryLabel(entry: FixedCostVarianceEntry): string {
  return entry.categoryName ?? entry.customLabel ?? "其他成本";
}

function amountTwd(
  entry: FixedCostVarianceEntry,
  exchangeRate: DecimalInput,
): ExactDecimal {
  const amount = ExactDecimal.from(entry.originalAmount as Exclude<DecimalInput, null | undefined>);
  if (entry.currency === "TWD") return amount;
  if (isMissingDecimal(exchangeRate)) {
    throw new Error("fixed-cost exchange-rate invariant failed");
  }
  return amount.multiply(ExactDecimal.from(exchangeRate));
}

export function compareFixedCostEntries(
  estimated: readonly FixedCostVarianceEntry[],
  actual: readonly FixedCostVarianceEntry[],
  exchangeRates: FixedCostExchangeRates,
): FixedCostVarianceResult {
  let estimatedExchangeRate: DecimalInput;
  let actualExchangeRate: DecimalInput;
  if (typeof exchangeRates === "object" && exchangeRates !== null) {
    estimatedExchangeRate = exchangeRates.estimated;
    actualExchangeRate = exchangeRates.actual;
  } else {
    estimatedExchangeRate = exchangeRates;
    actualExchangeRate = exchangeRates;
  }
  const activeEstimated = estimated.filter((entry) => entry.status !== "VOID");
  const activeActual = actual.filter((entry) => entry.status !== "VOID");
  if (
    (activeEstimated.some((entry) => entry.currency === "JPY") &&
      isMissingDecimal(estimatedExchangeRate)) ||
    (activeActual.some((entry) => entry.currency === "JPY") &&
      isMissingDecimal(actualExchangeRate))
  ) {
    return pendingOperatingCost("缺少匯率");
  }

  const estimatedMap = new Map<string, { label: string; amount: ExactDecimal }>();
  const actualMap = new Map<string, { label: string; amount: ExactDecimal }>();
  for (const entry of activeEstimated) {
    const key = entryKey(entry);
    const existing = estimatedMap.get(key);
    const amount = amountTwd(entry, estimatedExchangeRate);
    estimatedMap.set(key, {
      label: existing?.label ?? entryLabel(entry),
      amount: (existing?.amount ?? ExactDecimal.zero()).add(amount),
    });
  }
  for (const entry of activeActual) {
    const key = entryKey(entry);
    const existing = actualMap.get(key);
    const amount = amountTwd(entry, actualExchangeRate);
    actualMap.set(key, {
      label: existing?.label ?? entryLabel(entry),
      amount: (existing?.amount ?? ExactDecimal.zero()).add(amount),
    });
  }
  const keys = new Set([...estimatedMap.keys(), ...actualMap.keys()]);
  return {
    status: "ready",
    rows: [...keys].map((key) => {
    const estimate = estimatedMap.get(key);
    const actualValue = actualMap.get(key);
    if (!estimate) {
      if (!actualValue) {
        throw new Error(`fixed-cost variance invariant failed for ${key}`);
      }
      return {
        key,
        label: actualValue.label,
        estimatedTwd: null,
        actualTwd: actualValue.amount,
        state: "預算外",
        variance: null,
      };
    }
    if (!actualValue) {
      return {
        key,
        label: estimate.label,
        estimatedTwd: estimate.amount,
        actualTwd: null,
        state: "未發生",
        variance: null,
      };
    }
    const variance = calculateVariance({
      estimated: estimate.amount.toDecimalPlaces(12),
      actual: actualValue.amount.toDecimalPlaces(12),
      metricKind: "cost",
    });
    return {
      key,
      label: estimate.label,
      estimatedTwd: estimate.amount,
      actualTwd: actualValue.amount,
      state: "matched",
      variance: variance.status === "ready" ? variance : null,
    };
    }),
  };
}
