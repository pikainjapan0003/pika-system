/** Preserve the preview path's canonical spelling before Zod numeric coercion. */
export function preprocessPreviewPricingParams(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const storeId = (input as Record<string, unknown>).storeId;
  // Keep number/range validation in the generated schema. Do not coerce other types.
  if (typeof storeId === "number") return input;
  // trim equality also rejects the final newline that JavaScript's $ anchor permits.
  if (typeof storeId === "string" && /^[1-9]\d*$/.test(storeId) && storeId.trim() === storeId) return input;
  // Returning an invalid schema input makes safeParse fail, without throwing a 500.
  return undefined;
}
