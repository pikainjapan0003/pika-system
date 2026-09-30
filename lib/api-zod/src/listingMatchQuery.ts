/** Accept only canonical positive integer pages; keep all keys for strict validation. */
export function preprocessListingMatchQuery(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const query = input as Record<string, unknown>;
  if (!Object.hasOwn(query, "page")) return input;
  const page = query.page;
  if (typeof page === "string" && page.trim() === page && /^[1-9]\d*$/.test(page)) {
    const value = Number(page);
    if (Number.isSafeInteger(value) && value <= 100000) return { ...query, page: value };
  }
  if (typeof page === "number" && Number.isInteger(page) && page >= 1 && page <= 100000) return input;
  return undefined;
}
