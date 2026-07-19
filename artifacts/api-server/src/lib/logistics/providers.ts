/**
 * Logistics provider registry（Step 7H-B）— provider metadata 唯一真值來源。
 *
 * Canonical tracking provider code：711 / familymart / tcat / postoffice。
 * 注意：cvsStores.provider（seven | family）是「門市資料庫」語境，與本檔的
 * tracking provider 是不同 enum context，僅透過 CVS_PROVIDER_TO_TRACKING 單向對應。
 *
 * frontend mirror：artifacts/shop-app/src/lib/logisticsProviders.ts
 * 修改 provider metadata 時兩邊要同步。
 */

export type CanonicalTrackingProvider =
  | "711"
  | "familymart"
  | "tcat"
  | "postoffice";

export type LogisticsProviderMeta = {
  code: CanonicalTrackingProvider;
  displayName: string;
  shortName: string;
  fulfillmentType: "cvs_pickup" | "address_delivery";
  supportsStorePickup: boolean;
  supportsAddressDelivery: boolean;
  supportsExcelImport: boolean;
  supportsAutoSync: boolean;
  aliases: string[];
  cvsStoreProvider?: "seven" | "family";
};

export const LOGISTICS_PROVIDERS: readonly LogisticsProviderMeta[] = [
  {
    code: "711",
    displayName: "7-11",
    shortName: "7-11",
    fulfillmentType: "cvs_pickup",
    supportsStorePickup: true,
    supportsAddressDelivery: false,
    supportsExcelImport: true,
    supportsAutoSync: false,
    aliases: ["711", "7-11", "seven", "seven_eleven"],
    cvsStoreProvider: "seven",
  },
  {
    code: "familymart",
    displayName: "全家",
    shortName: "全家",
    fulfillmentType: "cvs_pickup",
    supportsStorePickup: true,
    supportsAddressDelivery: false,
    supportsExcelImport: true,
    supportsAutoSync: true,
    aliases: ["familymart", "family", "全家"],
    cvsStoreProvider: "family",
  },
  {
    code: "tcat",
    displayName: "黑貓宅急便",
    shortName: "黑貓",
    fulfillmentType: "address_delivery",
    supportsStorePickup: false,
    supportsAddressDelivery: true,
    supportsExcelImport: false,
    supportsAutoSync: false,
    aliases: ["tcat", "blackcat", "黑貓", "黑貓宅急便"],
  },
  {
    code: "postoffice",
    displayName: "中華郵政",
    shortName: "郵局",
    fulfillmentType: "address_delivery",
    supportsStorePickup: false,
    supportsAddressDelivery: true,
    supportsExcelImport: false,
    supportsAutoSync: false,
    aliases: ["postoffice", "post", "郵局", "郵局宅配"],
  },
] as const;

// alias（trim + lowercase 後）→ canonical code。
// 刻意不收錄：「宅配」（語意歧義，不可斷定黑貓或郵局）、home_delivery / other（是配送方式
// /fallback，不是物流商）。未知值一律回 null，不要默默轉 other。
const PROVIDER_ALIASES: Record<string, CanonicalTrackingProvider> =
  Object.fromEntries(
    LOGISTICS_PROVIDERS.flatMap((p) =>
      p.aliases.map((a) => [a.toLowerCase(), p.code]),
    ),
  );

const PROVIDER_BY_CODE: Record<
  CanonicalTrackingProvider,
  LogisticsProviderMeta
> = Object.fromEntries(LOGISTICS_PROVIDERS.map((p) => [p.code, p])) as Record<
  CanonicalTrackingProvider,
  LogisticsProviderMeta
>;

export function normalizeTrackingProvider(
  raw: string | null | undefined,
): CanonicalTrackingProvider | null {
  if (!raw) return null;
  return PROVIDER_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function getProviderMeta(
  raw: string | null | undefined,
): LogisticsProviderMeta | null {
  const code = normalizeTrackingProvider(raw);
  return code ? PROVIDER_BY_CODE[code] : null;
}

export function getProviderDisplayName(
  raw: string | null | undefined,
): string | null {
  return getProviderMeta(raw)?.displayName ?? null;
}

export function getProviderShortName(
  raw: string | null | undefined,
): string | null {
  return getProviderMeta(raw)?.shortName ?? null;
}

export function getSupportedAutoSyncProviders(): CanonicalTrackingProvider[] {
  return LOGISTICS_PROVIDERS.filter((p) => p.supportsAutoSync).map(
    (p) => p.code,
  );
}

export function getUnsupportedAutoSyncProviders(): CanonicalTrackingProvider[] {
  return LOGISTICS_PROVIDERS.filter((p) => !p.supportsAutoSync).map(
    (p) => p.code,
  );
}

export function getExcelImportProviders(): CanonicalTrackingProvider[] {
  return LOGISTICS_PROVIDERS.filter((p) => p.supportsExcelImport).map(
    (p) => p.code,
  );
}

/** cvsStores.provider（門市語境）→ tracking provider（貨態語境）單向對應 */
export const CVS_PROVIDER_TO_TRACKING: Record<
  string,
  CanonicalTrackingProvider
> = {
  seven: "711",
  family: "familymart",
};

/**
 * 批次匯入路由（orders/tracking-import）允許值。
 * home_delivery / other 為 legacy 過渡值（與 openapi TrackingProvider enum 同步），
 * 不是 canonical provider；enum 擴充屬 Step 7H-F，本常數僅集中既有白名單來源。
 */
export const TRACKING_IMPORT_ALLOWED_PROVIDERS = [
  ...getExcelImportProviders(),
  "home_delivery",
  "other",
] as const;
