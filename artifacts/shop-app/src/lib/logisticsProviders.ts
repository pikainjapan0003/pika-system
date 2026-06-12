/**
 * Logistics provider label registry — frontend mirror（Step 7H-B）。
 *
 * server 真值來源在：artifacts/api-server/src/lib/logistics/providers.ts
 * 若修改 provider metadata，兩邊要同步。
 *
 * Canonical tracking provider code：711 / familymart / tcat / postoffice。
 * 未知值一律回 null，不要默默轉 other；「宅配」「home_delivery」「other」
 * 刻意不收錄為別名。
 */

export type CanonicalTrackingProvider = "711" | "familymart" | "tcat" | "postoffice";

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

const PROVIDER_ALIASES: Record<string, CanonicalTrackingProvider> = Object.fromEntries(
  LOGISTICS_PROVIDERS.flatMap((p) => p.aliases.map((a) => [a.toLowerCase(), p.code])),
);

const PROVIDER_BY_CODE = Object.fromEntries(
  LOGISTICS_PROVIDERS.map((p) => [p.code, p]),
) as Record<CanonicalTrackingProvider, LogisticsProviderMeta>;

export function normalizeTrackingProvider(
  raw: string | null | undefined,
): CanonicalTrackingProvider | null {
  if (!raw) return null;
  return PROVIDER_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function getProviderMeta(raw: string | null | undefined): LogisticsProviderMeta | null {
  const code = normalizeTrackingProvider(raw);
  return code ? PROVIDER_BY_CODE[code] : null;
}

export function getProviderDisplayName(raw: string | null | undefined): string | null {
  return getProviderMeta(raw)?.displayName ?? null;
}

export function getProviderShortName(raw: string | null | undefined): string | null {
  return getProviderMeta(raw)?.shortName ?? null;
}

/** 該 provider 是否支援自動同步；未知 provider 回 false（誠實預設） */
export function getProviderSyncSupport(raw: string | null | undefined): boolean {
  return getProviderMeta(raw)?.supportsAutoSync ?? false;
}

export function getSupportedAutoSyncProviders(): CanonicalTrackingProvider[] {
  return LOGISTICS_PROVIDERS.filter((p) => p.supportsAutoSync).map((p) => p.code);
}

export function getUnsupportedAutoSyncProviders(): CanonicalTrackingProvider[] {
  return LOGISTICS_PROVIDERS.filter((p) => !p.supportsAutoSync).map((p) => p.code);
}
