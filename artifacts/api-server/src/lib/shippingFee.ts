// 取貨方式 → 運費（NT$）。買家端 / 賣家新增訂單共用同一套費率，
// 與前端 artifacts/shop-app/src/lib/cvs711.ts 的 PICKUP_METHOD_SHIPPING_FEE 保持一致。
export const SHIPPING_FEE_MAP: Record<string, number> = {
  "面交": 0,
  "自取": 0,
  "其他": 0,
  "7-11 貨到付款": 60,
  "7-11 取貨（先付款）": 60,
  "全家貨到付款": 60,
  "全家取貨（先付款）": 60,
  "黑貓宅急便": 100,
  "郵局": 80,
  "郵局宅配": 80,
  // Deprecated (kept for backward compat with old orders)
  "宅配": 100,
  "OK Mart": 60,
  "萊爾富物流": 60,
};

export function getShippingFee(pickupMethod: string, overrideShippingFee?: number): number {
  if (overrideShippingFee !== undefined) return overrideShippingFee;
  return SHIPPING_FEE_MAP[pickupMethod] ?? 0;
}
