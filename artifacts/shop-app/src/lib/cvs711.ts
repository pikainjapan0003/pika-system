export interface CvsStore {
  provider?: "seven" | "family";
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone?: string | null;
}

export const SEVEN_ELEVEN_PICKUP_METHODS = ["7-11 貨到付款", "7-11 取貨（先付款）"] as const;
export type SevenElevenMethod = typeof SEVEN_ELEVEN_PICKUP_METHODS[number];

export const FAMILY_MART_PICKUP_METHODS = ["全家取貨（先付款）", "全家貨到付款"] as const;
export type FamilyMartMethod = typeof FAMILY_MART_PICKUP_METHODS[number];

export const PICKUP_METHOD_SHIPPING_FEE: Record<string, number> = {
  "面交": 0,
  "7-11 貨到付款": 60,
  "7-11 取貨（先付款）": 60,
  "全家貨到付款": 60,
  "全家取貨（先付款）": 60,
  "黑貓宅急便": 100,
  "郵局": 80,
  // Legacy mappings
  "自取": 0,
  "其他": 0,
  // Deprecated (kept for backward compat with old orders)
  "宅配": 100,
  "OK Mart": 60,
  "萊爾富物流": 60,
};

export function isSevenElevenMethod(method: string): boolean {
  return SEVEN_ELEVEN_PICKUP_METHODS.includes(method as SevenElevenMethod);
}

export function isFamilyMartMethod(method: string): boolean {
  return FAMILY_MART_PICKUP_METHODS.includes(method as FamilyMartMethod);
}

export function isStorePickupMethod(method: string): boolean {
  return isSevenElevenMethod(method) || isFamilyMartMethod(method);
}

export function getPickupProvider(method: string): "seven" | "family" {
  return isFamilyMartMethod(method) ? "family" : "seven";
}

export function getShippingFee(pickupMethod: string): number {
  return PICKUP_METHOD_SHIPPING_FEE[pickupMethod] ?? 0;
}

const CVS_STORAGE_KEY_PREFIX = "cvs711_store_";

export function saveCvsStore(key: string, store: CvsStore): void {
  try {
    localStorage.setItem(
      CVS_STORAGE_KEY_PREFIX + key,
      JSON.stringify({ ...store, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore storage errors
  }
}

export function loadCvsStore(key: string): CvsStore | null {
  try {
    const raw = localStorage.getItem(CVS_STORAGE_KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CvsStore;
  } catch {
    return null;
  }
}

export function clearCvsStore(key: string): void {
  try {
    localStorage.removeItem(CVS_STORAGE_KEY_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Parse multiple possible 7-11 emap callback param name variations */
export function parseCvsParamsFromUrl(params: URLSearchParams): CvsStore | null {
  const storeId =
    params.get("CVSStoreID") ??
    params.get("StoreID") ??
    params.get("storeid") ??
    params.get("store_id") ??
    params.get("stno") ??
    "";

  const storeName =
    params.get("CVSStoreName") ??
    params.get("StoreName") ??
    params.get("storename") ??
    params.get("store_name") ??
    params.get("stname") ??
    "";

  const storeAddress =
    params.get("CVSAddress") ??
    params.get("StoreAddress") ??
    params.get("storeaddress") ??
    params.get("store_address") ??
    params.get("addr") ??
    "";

  const storePhone =
    params.get("CVSTelephone") ??
    params.get("StorePhone") ??
    params.get("store_phone") ??
    params.get("tel") ??
    null;

  if (!storeId) return null;

  return { storeId, storeName, storeAddress, storePhone };
}

export interface OpenSevenElevenMapOptions {
  returnPath: string;
  source: "customer" | "admin";
  orderId?: number;
  shareToken?: string;
}

export interface OpenCvsMapOptions extends OpenSevenElevenMapOptions {
  provider: "seven" | "family";
}

/** Navigate to the self-hosted CVS store picker at /cvs/711/select */
export function openCvsStoreMap(options: OpenCvsMapOptions): void {
  const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

  const selectParams = new URLSearchParams({
    provider: options.provider,
    source: options.source,
    returnTo: options.returnPath,
    ...(options.orderId != null ? { orderId: String(options.orderId) } : {}),
    ...(options.shareToken ? { shareToken: options.shareToken } : {}),
  });

  window.location.href = `${basePath}/cvs/711/select?${selectParams.toString()}`;
}

/** @deprecated Use openCvsStoreMap with provider:"seven" */
export function openSevenElevenMap(options: OpenSevenElevenMapOptions): void {
  openCvsStoreMap({ ...options, provider: "seven" });
}

/** Open official 7-11 E-Map in a new tab (auxiliary / reference only) */
export function openOfficialEmap(): void {
  window.open("https://emap.pcsc.com.tw/mobilemap/default.aspx", "_blank");
}
