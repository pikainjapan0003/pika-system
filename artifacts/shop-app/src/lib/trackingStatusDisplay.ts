/** A tracking number and a query timestamp are not proof of shipment. */
export function getTrackingBadge(order: {
  status: string;
  trackingCode?: string | null;
  latestTrackingStatus?: string | null;
}): { label: string; className: string } {
  if (order.status === "cancelled") {
    return { label: "已取消", className: "bg-gray-100 text-gray-600" };
  }
  switch (order.latestTrackingStatus) {
    case "delivered":
      return { label: "已送達", className: "bg-green-100 text-green-700" };
    case "picked_up":
      return { label: "已取貨", className: "bg-green-100 text-green-700" };
    case "arrived_store":
      return { label: "待取貨", className: "bg-blue-100 text-blue-700" };
    case "in_transit":
      return { label: "運送中", className: "bg-blue-100 text-blue-700" };
    case "pending":
      return { label: "待寄件", className: "bg-secondary text-muted-foreground" };
    case "returned":
    case "exception":
    case "unknown":
      return { label: "需店家確認", className: "bg-amber-100 text-amber-700" };
  }
  return { label: order.trackingCode ? "等待物流商更新" : "店家處理中",
    className: "bg-secondary text-muted-foreground" };
}
