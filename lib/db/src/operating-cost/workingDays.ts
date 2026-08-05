import { type QuantityInput } from "../transport-cost/index.ts";
import {
  parsePositiveQuantity,
  pendingOperatingCost,
  type PendingOperatingCost,
} from "./exact.ts";

export interface WorkingDaysInput {
  override?: QuantityInput;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ReadyWorkingDays {
  status: "ready";
  workingDays: bigint;
  source: "override" | "date_range";
}

export type WorkingDaysResult = ReadyWorkingDays | PendingOperatingCost;

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? timestamp
    : null;
}

export function resolveWorkingDays(input: WorkingDaysInput): WorkingDaysResult {
  if (input.override !== undefined && input.override !== null && input.override !== "") {
    const override = parsePositiveQuantity(input.override);
    return override === null
      ? pendingOperatingCost("工作天數必須是正整數")
      : { status: "ready", workingDays: BigInt(override.toDecimalPlaces(0)), source: "override" };
  }
  if (!input.startDate || !input.endDate) {
    return pendingOperatingCost("缺少行程日期");
  }
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  if (start === null || end === null || end < start) {
    return pendingOperatingCost("行程日期無效");
  }
  const millisecondsPerDay = 86_400_000;
  return {
    status: "ready",
    workingDays: BigInt(Math.floor((end - start) / millisecondsPerDay) + 1),
    source: "date_range",
  };
}
