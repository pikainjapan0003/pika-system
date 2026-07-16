import { maskName, maskPhone } from "@workspace/privacy";

import type { CustomerExportMode as OrderExportMode } from "./customerExport.ts";

export interface OrderExportRecord {
  id: number;
  productName: string | null;
  buyerName: string;
  buyerPhone: string;
  pickupMethod: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  paymentLast5: string | null;
  discountAmount: number | null;
  discountNote: string | null;
  status: string;
  specValues: unknown;
  createdAt: Date | null;
  profitSnapshotProductCostTwd: string | null;
  profitSnapshotTransportCostTwd: string | null;
  profitSnapshotUnitProfitTwd: string | null;
  profitSnapshotFullUnitProfitTwd: string | null;
  profitSnapshotStatus: string | null;
  cartProfitSnapshotTotalTwd: string | null;
  cartProfitSnapshotStatus: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function singleSnapshotValue(
  order: OrderExportRecord,
  value: string | null,
): string {
  if (order.cartProfitSnapshotStatus != null) return "不適用（購物車）";
  if (
    (order.profitSnapshotStatus === "captured" ||
      order.profitSnapshotStatus === "exempt") &&
    value != null
  ) {
    return value;
  }
  return "待確認";
}

function cartSnapshotValue(order: OrderExportRecord): string {
  if (order.cartProfitSnapshotStatus == null) return "不適用（單品）";
  if (
    (order.cartProfitSnapshotStatus === "captured" ||
      order.cartProfitSnapshotStatus === "exempt") &&
    order.cartProfitSnapshotTotalTwd != null
  ) {
    return order.cartProfitSnapshotTotalTwd;
  }
  return "待確認";
}

function snapshotStatusLabel(order: OrderExportRecord): string {
  const status =
    order.cartProfitSnapshotStatus ?? order.profitSnapshotStatus ?? "pending";
  if (status === "captured") return "已定格";
  if (status === "exempt") return "免攤";
  return "待確認";
}

export function formatOrderExportCsv(
  orders: readonly OrderExportRecord[],
  mode: OrderExportMode,
): string {
  const rows = [
    [
      "訂單編號",
      "商品名稱",
      "買家姓名",
      "買家電話",
      "取貨方式",
      "數量",
      "成交單價",
      "商品總額",
      "付款末五碼",
      "折讓金額",
      "折讓備註",
      "訂單狀態",
      "規格",
      "快照狀態",
      "單件台幣成本快照",
      "單件交通成本快照",
      "單件毛利快照",
      "單件全毛利快照",
      "購物車整單毛利快照",
      "下單時間",
    ],
    ...orders.map((order) => [
      order.id,
      order.productName ?? "",
      mode === "masked" ? maskName(order.buyerName) : order.buyerName,
      mode === "masked" ? maskPhone(order.buyerPhone) : order.buyerPhone,
      order.pickupMethod,
      order.quantity,
      order.unitPrice,
      order.totalPrice,
      order.paymentLast5 ?? "",
      order.discountAmount ?? 0,
      mode === "masked" ? "" : (order.discountNote ?? ""),
      STATUS_LABELS[order.status] ?? order.status,
      order.specValues ? JSON.stringify(order.specValues) : "",
      snapshotStatusLabel(order),
      singleSnapshotValue(order, order.profitSnapshotProductCostTwd),
      singleSnapshotValue(order, order.profitSnapshotTransportCostTwd),
      singleSnapshotValue(order, order.profitSnapshotUnitProfitTwd),
      singleSnapshotValue(order, order.profitSnapshotFullUnitProfitTwd),
      cartSnapshotValue(order),
      order.createdAt?.toISOString() ?? "",
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
