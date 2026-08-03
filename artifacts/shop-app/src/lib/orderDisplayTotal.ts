import { formatMoneyForDisplay } from "./moneyPreview";

interface DisplayOrderAmount {
  payableAfterCredit?: number | string | null;
  orderTotal?: number | string | null;
  totalPrice?: number | string | null;
  shippingFee?: number | string | null;
}

/** Gross total used by existing list statistics without reading exact credit fields. */
export function resolveOrderGrossTotal(order: DisplayOrderAmount): number {
  return order.orderTotal == null
    ? Number(order.totalPrice ?? 0) + Number(order.shippingFee ?? 0)
    : Number(order.orderTotal);
}

/** Formats the frozen payable at the final display boundary without number coercion. */
export function resolveOrderDisplayTotal(order: DisplayOrderAmount): string {
  if (order.payableAfterCredit != null) {
    return formatMoneyForDisplay(order.payableAfterCredit);
  }
  return formatMoneyForDisplay(resolveOrderGrossTotal(order));
}
