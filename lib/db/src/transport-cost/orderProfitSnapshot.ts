import { ExactDecimal } from "./index.ts";
import type { DecimalInput } from "./index.ts";
import {
  calculateProductUnitProfit,
} from "./productUnitProfit.ts";
import type {
  CalculateProductUnitProfitInput,
  PendingProductUnitProfit,
  ProductUnitProfitResult,
} from "./productUnitProfit.ts";

export { calculateProductUnitProfit } from "./productUnitProfit.ts";
export type {
  CalculateProductUnitProfitInput,
  ProductUnitProfitResult,
} from "./productUnitProfit.ts";

export const ORDER_PROFIT_SNAPSHOT_SCALE = 12;

export type OrderProfitSnapshotStatus = "captured" | "pending" | "exempt";

export interface OrderProfitSnapshotValues {
  profitSnapshotCostJpy: string | null;
  profitSnapshotExchangeRate: string | null;
  profitSnapshotProductCostTwd: string | null;
  profitSnapshotTransportCostTwd: string | null;
  profitSnapshotUnitProfitTwd: string | null;
  profitSnapshotFullUnitProfitTwd: string | null;
  profitSnapshotStatus: OrderProfitSnapshotStatus;
}

export interface InitialOrderProfitSnapshot extends OrderProfitSnapshotValues {
  profitSnapshotCapturedAt: Date;
  profitSnapshotBackfilledAt: null;
}

export type BackfillOrderProfitSnapshotResult =
  | {
    outcome: "backfilled";
    values: OrderProfitSnapshotValues;
    profitSnapshotBackfilledAt: Date;
  }
  | {
    outcome: "still_pending";
    reason: PendingProductUnitProfit["reason"];
  }
  | {
    outcome: "rejected";
    reason: "snapshot_not_pending";
  };

function isEmpty(value: DecimalInput): value is null | undefined | "" {
  return value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "");
}

function captureInputDecimal(value: DecimalInput): string | null {
  if (isEmpty(value)) return null;
  return ExactDecimal.from(value).toDecimalPlaces(ORDER_PROFIT_SNAPSHOT_SCALE);
}

/**
 * Q69 terminal capture boundary: calculate at full ExactDecimal precision,
 * then persist each snapshot numeric at 12 decimal places using the existing
 * half-up converter. Snapshot values are terminal records, never inputs to the
 * live cost calculation.
 */
export function calculateOrderProfitSnapshot(
  input: CalculateProductUnitProfitInput,
): OrderProfitSnapshotValues {
  const result = calculateProductUnitProfit(input);
  return snapshotValuesFromResult(input, result);
}

function snapshotValuesFromResult(
  input: CalculateProductUnitProfitInput,
  result: ProductUnitProfitResult,
): OrderProfitSnapshotValues {
  const inputValues = {
    profitSnapshotCostJpy: captureInputDecimal(input.costJpy),
    profitSnapshotExchangeRate: captureInputDecimal(input.storePurchaseExchangeRate),
  };

  if (result.status === "pending_confirmation") {
    return {
      ...inputValues,
      profitSnapshotProductCostTwd: null,
      profitSnapshotTransportCostTwd: null,
      profitSnapshotUnitProfitTwd: null,
      profitSnapshotFullUnitProfitTwd: null,
      profitSnapshotStatus: "pending",
    };
  }

  return {
    ...inputValues,
    profitSnapshotProductCostTwd: result.productCostTwd.toDecimalPlaces(ORDER_PROFIT_SNAPSHOT_SCALE),
    profitSnapshotTransportCostTwd: result.unitTransportCostTwd.toDecimalPlaces(ORDER_PROFIT_SNAPSHOT_SCALE),
    profitSnapshotUnitProfitTwd: result.unitProfitTwd.toDecimalPlaces(ORDER_PROFIT_SNAPSHOT_SCALE),
    profitSnapshotFullUnitProfitTwd: result.fullUnitProfitTwd.toDecimalPlaces(ORDER_PROFIT_SNAPSHOT_SCALE),
    profitSnapshotStatus: result.transportStatus === "exempt" ? "exempt" : "captured",
  };
}

export function createInitialOrderProfitSnapshot(
  input: CalculateProductUnitProfitInput,
  capturedAt: Date,
): InitialOrderProfitSnapshot {
  return {
    ...calculateOrderProfitSnapshot(input),
    profitSnapshotCapturedAt: capturedAt,
    profitSnapshotBackfilledAt: null,
  };
}

export function backfillPendingOrderProfitSnapshot(
  currentStatus: string | null,
  input: CalculateProductUnitProfitInput,
  backfilledAt: Date,
): BackfillOrderProfitSnapshotResult {
  if (currentStatus !== "pending" && currentStatus !== null) {
    return { outcome: "rejected", reason: "snapshot_not_pending" };
  }

  const result = calculateProductUnitProfit(input);
  if (result.status === "pending_confirmation") {
    return { outcome: "still_pending", reason: result.reason };
  }
  const values = snapshotValuesFromResult(input, result);

  return {
    outcome: "backfilled",
    values,
    profitSnapshotBackfilledAt: backfilledAt,
  };
}

export function displayOrderProfitSnapshotAmount(value: string | null): string | null {
  return value === null ? null : ExactDecimal.from(value).toDecimalPlaces(0);
}
