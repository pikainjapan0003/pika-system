import {
  getShippingFee as getCanonicalShippingFee,
  PICKUP_METHOD_SHIPPING_FEE,
} from "@workspace/shipping";

export const SHIPPING_FEE_MAP = PICKUP_METHOD_SHIPPING_FEE;

export function getShippingFee(pickupMethod: string, overrideShippingFee?: number): number {
  if (overrideShippingFee !== undefined) return overrideShippingFee;
  return getCanonicalShippingFee(pickupMethod);
}
