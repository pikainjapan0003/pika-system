interface DisplayOrderAmount {
  orderTotal?: number | string | null;
  totalPrice?: number | string | null;
  shippingFee?: number | string | null;
}

/** Existing order-list display fallback, shared without changing write-time totals. */
export function resolveOrderDisplayTotal(order: DisplayOrderAmount): number {
  return order.orderTotal == null
    ? Number(order.totalPrice ?? 0) + Number(order.shippingFee ?? 0)
    : Number(order.orderTotal);
}
