export const PUBLIC_CART_ITEM_RESPONSE_KEYS = [
  "productId",
  "productName",
  "productImageUrl",
  "specValues",
  "quantity",
  "unitPrice",
  "subtotal",
] as const;

export type PublicCartItemResponse = {
  productId: number;
  productName: string;
  productImageUrl: string | null;
  specValues: Record<string, string>;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeSpecValues(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;

  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => typeof entryValue !== "string"))
    return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function sanitizePublicCartItem(value: unknown): PublicCartItemResponse | null {
  if (!isRecord(value)) return null;

  const specValues = sanitizeSpecValues(value.specValues);
  const productImageUrl = value.productImageUrl ?? null;
  if (
    !Number.isInteger(value.productId) ||
    (value.productId as number) <= 0 ||
    typeof value.productName !== "string" ||
    (typeof productImageUrl !== "string" && productImageUrl !== null) ||
    specValues === null ||
    !Number.isInteger(value.quantity) ||
    (value.quantity as number) <= 0 ||
    typeof value.unitPrice !== "number" ||
    !Number.isFinite(value.unitPrice) ||
    value.unitPrice < 0 ||
    typeof value.subtotal !== "number" ||
    !Number.isFinite(value.subtotal) ||
    value.subtotal < 0
  ) {
    return null;
  }

  return {
    productId: value.productId as number,
    productName: value.productName,
    productImageUrl,
    specValues,
    quantity: value.quantity as number,
    unitPrice: value.unitPrice,
    subtotal: value.subtotal,
  };
}

/**
 * Builds the only cart-item shape allowed on public endpoints. Stored order items
 * intentionally retain their immutable profit snapshots; public responses never do.
 */
export function sanitizePublicCartItems(
  items: unknown,
): PublicCartItemResponse[] | null {
  if (items === null || items === undefined) return null;
  if (!Array.isArray(items)) return null;

  return items.flatMap((item) => {
    const sanitized = sanitizePublicCartItem(item);
    return sanitized === null ? [] : [sanitized];
  });
}
