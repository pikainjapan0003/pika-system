import { displayOrderProfitSnapshotAmount } from "@workspace/db/order-profit-snapshot";

export interface CustomerOrderProfitInput {
  profitSnapshotStatus?: string | null;
  profitSnapshotUnitProfitTwd?: string | null;
  cartProfitSnapshotStatus?: string | null;
  cartProfitSnapshotTotalTwd?: string | null;
}

export type CustomerOrderProfitDisplay =
  | { status: "captured" | "exempt"; label: string; amountTwd: string; scope: "unit" | "order" }
  | { status: "pending" | "missing"; label: "待確認" | "尚無快照"; amountTwd: null; scope: "unit" | "order" };

/** Formats existing immutable snapshots only. It never recalculates live product cost or profit. */
export function formatCustomerOrderProfit(order: CustomerOrderProfitInput): CustomerOrderProfitDisplay {
  if (order.cartProfitSnapshotStatus !== undefined && order.cartProfitSnapshotStatus !== null) {
    if (order.cartProfitSnapshotStatus === "captured" && order.cartProfitSnapshotTotalTwd != null) {
      return {
        status: "captured",
        label: "定格整單毛利",
        amountTwd: displayOrderProfitSnapshotAmount(order.cartProfitSnapshotTotalTwd),
        scope: "order",
      };
    }
    return { status: "pending", label: "待確認", amountTwd: null, scope: "order" };
  }

  if (
    (order.profitSnapshotStatus === "captured" || order.profitSnapshotStatus === "exempt")
    && order.profitSnapshotUnitProfitTwd != null
  ) {
    return {
      status: order.profitSnapshotStatus,
      label: order.profitSnapshotStatus === "exempt" ? "免攤單件毛利" : "定格單件毛利",
      amountTwd: displayOrderProfitSnapshotAmount(order.profitSnapshotUnitProfitTwd),
      scope: "unit",
    };
  }
  if (order.profitSnapshotStatus === "pending") {
    return { status: "pending", label: "待確認", amountTwd: null, scope: "unit" };
  }
  return { status: "missing", label: "尚無快照", amountTwd: null, scope: "unit" };
}
