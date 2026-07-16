import { ExactDecimal } from "../../../../lib/db/src/transport-cost/index.ts";

export interface ProfitSummaryOrder {
  quantity: number;
  items?: unknown;
  profitSnapshotStatus?: string | null;
  profitSnapshotUnitProfitTwd?: string | null;
  cartProfitSnapshotStatus?: string | null;
  cartProfitSnapshotTotalTwd?: string | null;
}

export interface OrderProfitSummary {
  capturedProfitSubtotalTwd: string;
  capturedProfitSubtotalDisplayTwd: string;
  pendingOrderCount: number;
  missingSnapshotOrderCount: number;
}

export function summarizeOrderProfits(
  orders: ProfitSummaryOrder[],
): OrderProfitSummary {
  let total = ExactDecimal.zero();
  let pendingOrderCount = 0;
  let missingSnapshotOrderCount = 0;

  for (const order of orders) {
    if (Array.isArray(order.items)) {
      if (order.cartProfitSnapshotStatus === "pending") {
        pendingOrderCount += 1;
      } else if (
        order.cartProfitSnapshotStatus === null ||
        order.cartProfitSnapshotStatus === undefined
      ) {
        missingSnapshotOrderCount += 1;
      } else if (
        order.cartProfitSnapshotStatus === "captured" &&
        order.cartProfitSnapshotTotalTwd !== null &&
        order.cartProfitSnapshotTotalTwd !== undefined
      ) {
        total = total.add(ExactDecimal.from(order.cartProfitSnapshotTotalTwd));
      }
      continue;
    }

    if (order.profitSnapshotStatus === "pending") {
      pendingOrderCount += 1;
    } else if (
      order.profitSnapshotStatus === null ||
      order.profitSnapshotStatus === undefined
    ) {
      missingSnapshotOrderCount += 1;
    } else if (
      (order.profitSnapshotStatus === "captured" ||
        order.profitSnapshotStatus === "exempt") &&
      order.profitSnapshotUnitProfitTwd !== null &&
      order.profitSnapshotUnitProfitTwd !== undefined
    ) {
      total = total.add(
        ExactDecimal.from(order.profitSnapshotUnitProfitTwd).multiply(
          ExactDecimal.from(String(order.quantity)),
        ),
      );
    }
  }

  return {
    capturedProfitSubtotalTwd: total.toDecimalPlaces(12),
    capturedProfitSubtotalDisplayTwd: total.toDecimalPlaces(0),
    pendingOrderCount,
    missingSnapshotOrderCount,
  };
}
