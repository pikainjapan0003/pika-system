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
  orderItems?: unknown;
  items?: unknown;
  itemCostTotalTwd?: string | null;
  itemProfitTotalTwd?: string | null;
}

function exportLines(order: OrderExportRecord) {
  const formal = Array.isArray(order.orderItems) && order.orderItems.length > 0;
  const raw = formal ? order.orderItems : order.items;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const lines = raw.map((item) => ({
    productName: formal ? item?.productNameSnapshot : item?.productName,
    quantity: item?.quantity,
    unitPrice: String((formal ? item?.unitPriceTwd : item?.unitPrice) ?? ""),
    subtotal: String((formal ? item?.subtotalTwd : item?.subtotal) ?? ""),
    specValues: item?.specValues ?? {},
  }));
  if (lines.some((line) => typeof line.productName !== "string" || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) return [];
  return lines;
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
      "品項明細",
      "整單完整成本",
      "整單完整淨利",
    ],
    ...orders.map((order) => { const lines = exportLines(order); return [
      order.id,
      lines.length > 1 ? lines.map((line) => `${line.productName} × ${line.quantity}`).join("；") : lines[0]?.productName ?? order.productName ?? "",
      mode === "masked" ? maskName(order.buyerName) : order.buyerName,
      mode === "masked" ? maskPhone(order.buyerPhone) : order.buyerPhone,
      order.pickupMethod,
      lines.length ? lines.reduce((sum, line) => sum + line.quantity, 0) : order.quantity,
      lines.length > 1 ? "多品項（見品項明細）" : lines[0]?.unitPrice ?? order.unitPrice,
      order.totalPrice,
      order.paymentLast5 ?? "",
      order.discountAmount ?? 0,
      mode === "masked" ? "" : (order.discountNote ?? ""),
      STATUS_LABELS[order.status] ?? order.status,
      lines.length > 1 ? JSON.stringify(lines.map((line) => ({productName:line.productName,specValues:line.specValues}))) : (lines[0]?.specValues ?? order.specValues) ? JSON.stringify(lines[0]?.specValues ?? order.specValues) : "",
      snapshotStatusLabel(order),
      singleSnapshotValue(order, order.profitSnapshotProductCostTwd),
      singleSnapshotValue(order, order.profitSnapshotTransportCostTwd),
      singleSnapshotValue(order, order.profitSnapshotUnitProfitTwd),
      singleSnapshotValue(order, order.profitSnapshotFullUnitProfitTwd),
      cartSnapshotValue(order),
      order.createdAt?.toISOString() ?? "",
      lines.length ? JSON.stringify(lines) : "",
      order.itemCostTotalTwd ?? (Array.isArray(order.orderItems) && order.orderItems.length ? "待確認" : ""),
      order.itemProfitTotalTwd ?? (Array.isArray(order.orderItems) && order.orderItems.length ? "待確認" : ""),
    ]; }),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
