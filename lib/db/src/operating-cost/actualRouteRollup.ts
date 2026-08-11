import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  OPERATING_COST_PENDING_LABEL,
  parseNonNegativeDecimal,
} from "./exact.ts";

export const INCLUDED_ACTUAL_ORDER_STATUSES = [
  "awaiting_payment",
  "preparing",
  "shipped",
  "completed",
] as const;

export type IncludedActualOrderStatus =
  (typeof INCLUDED_ACTUAL_ORDER_STATUSES)[number];

export interface ActualCostEntryInput {
  tripRouteId?: number | null;
  mode: "ESTIMATE" | "ACTUAL";
  status: "ACTIVE" | "VOID";
  currency: "JPY" | "TWD";
  originalAmount: DecimalInput;
}

export interface ReadyActualRouteCostGroup {
  status: "ready";
  tripRouteId: number | null;
  originalJpyTotal: ExactDecimal;
  originalTwdTotal: ExactDecimal;
  convertedJpyTotalTwd: ExactDecimal;
  totalTwd: ExactDecimal;
}

export interface PendingActualRouteCostGroup {
  status: "pending_confirmation";
  label: typeof OPERATING_COST_PENDING_LABEL;
  reason: "missing_actual_exchange_rate";
  tripRouteId: number | null;
  originalJpyTotal: ExactDecimal;
  originalTwdTotal: ExactDecimal;
  convertedJpyTotalTwd: null;
  totalTwd: null;
}

export type ActualRouteCostGroup =
  | ReadyActualRouteCostGroup
  | PendingActualRouteCostGroup;

export interface ActualRouteCostRollup {
  status: "ready" | "pending_confirmation";
  groups: ActualRouteCostGroup[];
}

export interface ActualOrderQuantityInput {
  tripRouteId?: number | null;
  status: string;
  quantity: string | number | bigint;
}

export interface ActualRouteQuantity {
  tripRouteId: number;
  actualQuantity: bigint;
}

export interface ActualQuantityRollup {
  totalActualQuantity: bigint;
  routes: ActualRouteQuantity[];
}

type MutableCostGroup = {
  originalJpyTotal: ExactDecimal;
  originalTwdTotal: ExactDecimal;
};

function parseQuantity(value: string | number | bigint): bigint {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new RangeError("quantity must be a non-negative integer");
  }
  return BigInt(normalized);
}

function routeSortKey(tripRouteId: number | null): number {
  return tripRouteId ?? -1;
}

export function calculateActualRouteCostRollup(input: {
  entries: readonly ActualCostEntryInput[];
  actualExchangeRate?: DecimalInput;
}): ActualRouteCostRollup {
  const grouped = new Map<number | null, MutableCostGroup>();

  for (const entry of input.entries) {
    if (entry.mode !== "ACTUAL" || entry.status !== "ACTIVE") continue;
    const tripRouteId = entry.tripRouteId ?? null;
    const group = grouped.get(tripRouteId) ?? {
      originalJpyTotal: ExactDecimal.zero(),
      originalTwdTotal: ExactDecimal.zero(),
    };
    const amount = parseNonNegativeDecimal(
      entry.originalAmount as Exclude<DecimalInput, null | undefined>,
      "originalAmount",
    );
    if (entry.currency === "JPY") {
      group.originalJpyTotal = group.originalJpyTotal.add(amount);
    } else {
      group.originalTwdTotal = group.originalTwdTotal.add(amount);
    }
    grouped.set(tripRouteId, group);
  }

  const exchangeRate = isMissingDecimal(input.actualExchangeRate)
    ? null
    : parseNonNegativeDecimal(input.actualExchangeRate, "actualExchangeRate");
  const groups = [...grouped.entries()]
    .sort(([left], [right]) => routeSortKey(left) - routeSortKey(right))
    .map<ActualRouteCostGroup>(([tripRouteId, group]) => {
      if (
        exchangeRate === null &&
        !group.originalJpyTotal.equals(ExactDecimal.zero())
      ) {
        return {
          status: "pending_confirmation",
          label: OPERATING_COST_PENDING_LABEL,
          reason: "missing_actual_exchange_rate",
          tripRouteId,
          originalJpyTotal: group.originalJpyTotal,
          originalTwdTotal: group.originalTwdTotal,
          convertedJpyTotalTwd: null,
          totalTwd: null,
        };
      }
      const convertedJpyTotalTwd = group.originalJpyTotal.multiply(
        exchangeRate ?? ExactDecimal.zero(),
      );
      return {
        status: "ready",
        tripRouteId,
        originalJpyTotal: group.originalJpyTotal,
        originalTwdTotal: group.originalTwdTotal,
        convertedJpyTotalTwd,
        totalTwd: convertedJpyTotalTwd.add(group.originalTwdTotal),
      };
    });

  return {
    status: groups.some((group) => group.status !== "ready")
      ? "pending_confirmation"
      : "ready",
    groups,
  };
}

export function calculateActualQuantityRollup(
  rows: readonly ActualOrderQuantityInput[],
): ActualQuantityRollup {
  const includedStatuses = new Set<string>(INCLUDED_ACTUAL_ORDER_STATUSES);
  const byRoute = new Map<number, bigint>();

  for (const row of rows) {
    if (row.tripRouteId == null || !includedStatuses.has(row.status)) continue;
    const quantity = parseQuantity(row.quantity);
    byRoute.set(
      row.tripRouteId,
      (byRoute.get(row.tripRouteId) ?? 0n) + quantity,
    );
  }

  const routes = [...byRoute.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tripRouteId, actualQuantity]) => ({
      tripRouteId,
      actualQuantity,
    }));
  return {
    totalActualQuantity: routes.reduce(
      (total, route) => total + route.actualQuantity,
      0n,
    ),
    routes,
  };
}

export function emptyActualRouteCostGroup(
  tripRouteId: number | null,
): ReadyActualRouteCostGroup {
  return {
    status: "ready",
    tripRouteId,
    originalJpyTotal: ExactDecimal.zero(),
    originalTwdTotal: ExactDecimal.zero(),
    convertedJpyTotalTwd: ExactDecimal.zero(),
    totalTwd: ExactDecimal.zero(),
  };
}
