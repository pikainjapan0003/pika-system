const PENDING_REASON_COPY: Record<string, string> = {
  invalid_est_qty: "預估件數格式不正確",
  missing_estimated_item_quantity: "尚未填寫預估件數",
  missing_exchange_rate: "尚未填寫預估匯率",
  missing_actual_exchange_rate: "尚未填寫實際匯率",
  missing_etc_jpy: "尚未填寫 ETC 費用",
  missing_fuel_jpy: "尚未填寫燃油費",
  missing_trip_area: "路線尚未連結大區",
  missing_trip_area_cost: "大區成本資料尚未完成",
  missing_trip_route_attachment: "商品尚未連結路線",
  missing_trip_route: "找不到商品所連結的路線",
  missing_trip: "找不到路線所屬行程",
  missing_hep_item_quantity: "有 HEP 成本但缺少商品總件數",
  missing_actual_quantity: "尚無納入計算的實際商品件數",
  missing_product_cost_jpy: "商品日圓成本尚未完成",
  missing_unit_price_twd: "商品台幣售價尚未完成",
  missing_route_actual_cost: "路線實際成本尚未完成",
  missing_store_purchase_exchange_rate: "商店採購匯率尚未完成",
};

export function chartPendingReason(reason: string | null | undefined): string {
  if (!reason) return "後端未提供待確認原因";
  const normalized = reason.trim();
  if (PENDING_REASON_COPY[normalized]) return PENDING_REASON_COPY[normalized];
  return /^[a-z][a-z0-9_]*$/.test(normalized)
    ? "後端回報資料尚未完成"
    : normalized;
}
