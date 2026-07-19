// Canonical pickup-method fees in TWD. Both the API write path and UI previews import this table.
export const PICKUP_METHOD_SHIPPING_FEE: Readonly<Record<string, number>> = {
  面交: 0,
  自取: 0,
  其他: 0,
  "7-11 貨到付款": 60,
  "7-11 取貨（先付款）": 60,
  全家貨到付款: 60,
  "全家取貨（先付款）": 60,
  黑貓宅急便: 100,
  郵局: 80,
  郵局宅配: 80,
  // Deprecated aliases kept for existing orders.
  宅配: 100,
  "OK Mart": 60,
  萊爾富物流: 60,
};

export function getShippingFee(pickupMethod: string): number {
  return PICKUP_METHOD_SHIPPING_FEE[pickupMethod] ?? 0;
}

export function formatShippingFeeLabel(pickupMethod: string): string {
  const fee = getShippingFee(pickupMethod);
  return fee === 0 ? "免運" : `+ NT$${fee}`;
}
