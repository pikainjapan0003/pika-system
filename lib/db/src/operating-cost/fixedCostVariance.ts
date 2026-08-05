import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";
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

export interface FixedCostVarianceRow {
  key: string;
  label: string;
  estimatedTwd: ExactDecimal | null;
  actualTwd: ExactDecimal | null;
  state: "matched" | "未發生" | "預算外";
  variance: ReadyVariance | null;
}

function entryKey(entry: FixedCostVarianceEntry): string {
  return entry.categoryId !== null && entry.categoryId !== undefined
    ? `category:${entry.categoryId}`
    : `custom:${entry.customLabel ?? ""}`;
}

function entryLabel(entry: FixedCostVarianceEntry): string {
  return entry.categoryName ?? entry.customLabel ?? "其他成本";
}

function amountTwd(entry: FixedCostVarianceEntry, exchangeRate: DecimalInput): ExactDecimal {
  const amount = ExactDecimal.from(entry.originalAmount as Exclude<DecimalInput, null | undefined>);
  return entry.currency === "JPY"
    ? amount.multiply(ExactDecimal.from(exchangeRate as Exclude<DecimalInput, null | undefined>))
    : amount;
}

export function compareFixedCostEntries(
  estimated: readonly FixedCostVarianceEntry[],
  actual: readonly FixedCostVarianceEntry[],
  exchangeRate: DecimalInput,
): FixedCostVarianceRow[] {
  const estimatedMap = new Map<string, { label: string; amount: ExactDecimal }>();
  const actualMap = new Map<string, { label: string; amount: ExactDecimal }>();
  for (const entry of estimated) {
    if (entry.status === "VOID") continue;
    const key = entryKey(entry);
    const existing = estimatedMap.get(key);
    const amount = amountTwd(entry, exchangeRate);
    estimatedMap.set(key, {
      label: existing?.label ?? entryLabel(entry),
      amount: (existing?.amount ?? ExactDecimal.zero()).add(amount),
    });
  }
  for (const entry of actual) {
    if (entry.status === "VOID") continue;
    const key = entryKey(entry);
    const existing = actualMap.get(key);
    const amount = amountTwd(entry, exchangeRate);
    actualMap.set(key, {
      label: existing?.label ?? entryLabel(entry),
      amount: (existing?.amount ?? ExactDecimal.zero()).add(amount),
    });
  }
  const keys = new Set([...estimatedMap.keys(), ...actualMap.keys()]);
  return [...keys].map((key) => {
    const estimate = estimatedMap.get(key);
    const actualValue = actualMap.get(key);
    if (!estimate) {
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
  });
}
