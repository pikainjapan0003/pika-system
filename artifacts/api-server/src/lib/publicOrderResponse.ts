import { ExactDecimal } from "@workspace/db/transport-cost";

export const PUBLIC_ORDER_CREATED_RESPONSE_KEYS = [
  "publicToken",
  "productName",
  "quantity",
  "unitPrice",
  "shippingFee",
  "totalPrice",
  "orderTotal",
  "pickupMethod",
  "specValues",
  "status",
  "statusLabel",
  "cvsStoreId",
  "cvsStoreName",
  "cvsStoreAddress",
  "cvsStorePhone",
  "createdAt",
] as const;

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

export interface PublicOrderCreatedSource {
  publicToken: string;
  productName: string | null;
  quantity: number;
  unitPrice: string;
  shippingFee: string;
  totalPrice: string;
  pickupMethod: string;
  specValues: unknown;
  status: string;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  createdAt: Date | string;
}

export function formatPublicOrderCreatedResponse(
  order: PublicOrderCreatedSource,
) {
  const unitPrice = ExactDecimal.from(order.unitPrice);
  const shippingFee = ExactDecimal.from(order.shippingFee);
  const totalPrice = ExactDecimal.from(order.totalPrice);
  const orderTotal = totalPrice.add(shippingFee);

  return {
    publicToken: order.publicToken,
    productName: order.productName,
    quantity: order.quantity,
    unitPrice: Number(unitPrice.toDecimalPlaces(2)),
    shippingFee: Number(shippingFee.toDecimalPlaces(2)),
    totalPrice: Number(totalPrice.toDecimalPlaces(2)),
    orderTotal: Number(orderTotal.toDecimalPlaces(2)),
    pickupMethod: order.pickupMethod,
    specValues: order.specValues ?? {},
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
    cvsStoreId: order.cvsStoreId,
    cvsStoreName: order.cvsStoreName,
    cvsStoreAddress: order.cvsStoreAddress,
    cvsStorePhone: order.cvsStorePhone,
    createdAt:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : order.createdAt,
  };
}
