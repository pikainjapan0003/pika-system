import { ExactDecimal } from "./index.ts";
import {
  createInitialOrderProfitSnapshot,
  ORDER_PROFIT_SNAPSHOT_SCALE,
} from "./orderProfitSnapshot.ts";
import type {
  InitialOrderProfitSnapshot,
  OrderProfitSnapshotStatus,
} from "./orderProfitSnapshot.ts";
import type { CalculateProductUnitProfitInput } from "./productUnitProfit.ts";

export interface CartProfitSnapshotJson {
  profitSnapshotCostJpy: string | null;
  profitSnapshotExchangeRate: string | null;
  profitSnapshotProductCostTwd: string | null;
  profitSnapshotTransportCostTwd: string | null;
  profitSnapshotUnitProfitTwd: string | null;
  profitSnapshotFullUnitProfitTwd: string | null;
  profitSnapshotStatus: OrderProfitSnapshotStatus;
  profitSnapshotCapturedAt: string;
  profitSnapshotBackfilledAt: string | null;
}

export interface CartSnapshotCalculationItem<T> {
  item: T;
  quantity: number;
  snapshotInput: CalculateProductUnitProfitInput;
}

export interface CapturedCartSnapshotItem<T> {
  item: T;
  quantity: number;
  profitSnapshot: CartProfitSnapshotJson;
}

export interface CartOrderProfitSnapshot<T> {
  items: Array<CapturedCartSnapshotItem<T>>;
  cartProfitSnapshotTotalTwd: string | null;
  cartProfitSnapshotStatus: "captured" | "pending";
}

export type BackfillCartOrderProfitSnapshotResult<T> =
  | { outcome: "backfilled"; snapshot: CartOrderProfitSnapshot<T> }
  | { outcome: "still_pending" }
  | { outcome: "rejected"; reason: "snapshot_not_pending" };

function toJsonSnapshot(
  snapshot: InitialOrderProfitSnapshot,
  backfilledAt: Date | null,
): CartProfitSnapshotJson {
  return {
    profitSnapshotCostJpy: snapshot.profitSnapshotCostJpy,
    profitSnapshotExchangeRate: snapshot.profitSnapshotExchangeRate,
    profitSnapshotProductCostTwd: snapshot.profitSnapshotProductCostTwd,
    profitSnapshotTransportCostTwd: snapshot.profitSnapshotTransportCostTwd,
    profitSnapshotUnitProfitTwd: snapshot.profitSnapshotUnitProfitTwd,
    profitSnapshotFullUnitProfitTwd: snapshot.profitSnapshotFullUnitProfitTwd,
    profitSnapshotStatus: snapshot.profitSnapshotStatus,
    profitSnapshotCapturedAt: snapshot.profitSnapshotCapturedAt.toISOString(),
    profitSnapshotBackfilledAt: backfilledAt?.toISOString() ?? null,
  };
}

export function createCartOrderProfitSnapshot<T>(
  inputs: Array<CartSnapshotCalculationItem<T>>,
  capturedAt: Date,
  backfilledAt: Date | null = null,
): CartOrderProfitSnapshot<T> {
  const items = inputs.map(({ item, quantity, snapshotInput }) => ({
    item,
    quantity,
    profitSnapshot: toJsonSnapshot(
      createInitialOrderProfitSnapshot(snapshotInput, capturedAt),
      backfilledAt,
    ),
  }));

  if (
    items.some(
      ({ profitSnapshot }) => profitSnapshot.profitSnapshotStatus === "pending",
    )
  ) {
    return {
      items,
      cartProfitSnapshotTotalTwd: null,
      cartProfitSnapshotStatus: "pending",
    };
  }

  const total = items.reduce((sum, { quantity, profitSnapshot }) => {
    const unitProfit = ExactDecimal.from(
      profitSnapshot.profitSnapshotUnitProfitTwd!,
    );
    return sum.add(unitProfit.multiply(ExactDecimal.from(String(quantity))));
  }, ExactDecimal.zero());

  return {
    items,
    cartProfitSnapshotTotalTwd: total.toDecimalPlaces(
      ORDER_PROFIT_SNAPSHOT_SCALE,
    ),
    cartProfitSnapshotStatus: "captured",
  };
}

export function backfillPendingCartOrderProfitSnapshot<T>(
  currentStatus: string | null,
  inputs: Array<CartSnapshotCalculationItem<T>>,
  backfilledAt: Date,
): BackfillCartOrderProfitSnapshotResult<T> {
  if (currentStatus !== "pending" && currentStatus !== null) {
    return { outcome: "rejected", reason: "snapshot_not_pending" };
  }

  const snapshot = createCartOrderProfitSnapshot(
    inputs,
    backfilledAt,
    backfilledAt,
  );
  if (snapshot.cartProfitSnapshotStatus === "pending") {
    return { outcome: "still_pending" };
  }
  return { outcome: "backfilled", snapshot };
}
