export interface CustomerCvsDefaults {
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
}

export interface ExplicitCvsSelection {
  storeCode?: string | null;
  storeName?: string | null;
  cvsStoreAddress?: string | null;
  cvsStorePhone?: string | null;
}

export interface ResolvedCvsSelection {
  storeCode: string | null;
  storeName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  usedCustomerDefault: boolean;
}

export function parseOptionalCustomerId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError("customerId must be a positive integer");
  }
  return parsed;
}

export function resolveCustomerCvsDefaults(
  explicit: ExplicitCvsSelection,
  customer: CustomerCvsDefaults | null,
): ResolvedCvsSelection {
  const hasExplicit = Boolean(
    explicit.storeCode
    || explicit.storeName
    || explicit.cvsStoreAddress
    || explicit.cvsStorePhone,
  );
  if (hasExplicit || !customer) {
    return {
      storeCode: explicit.storeCode ?? null,
      storeName: explicit.storeName ?? null,
      cvsStoreAddress: explicit.cvsStoreAddress ?? null,
      cvsStorePhone: explicit.cvsStorePhone ?? null,
      usedCustomerDefault: false,
    };
  }
  return {
    storeCode: customer.cvsStoreId,
    storeName: customer.cvsStoreName,
    cvsStoreAddress: customer.cvsStoreAddress,
    cvsStorePhone: customer.cvsStorePhone,
    usedCustomerDefault: Boolean(
      customer.cvsStoreId
      || customer.cvsStoreName
      || customer.cvsStoreAddress
      || customer.cvsStorePhone,
    ),
  };
}
