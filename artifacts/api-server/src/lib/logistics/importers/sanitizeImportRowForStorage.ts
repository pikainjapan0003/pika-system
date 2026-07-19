import type { LogisticsImportRow } from "./types.ts";

const maskName = (s: string): string =>
  s.length <= 1 ? "*" : s[0] + "*".repeat(s.length - 2) + s[s.length - 1];

const maskPhone = (s: string): string => {
  const t = s.replace(/[-\s()]/g, "");
  return t.length <= 4
    ? "****"
    : t.slice(0, 2) + "*".repeat(t.length - 4) + t.slice(-2);
};

const ensureMasked = (
  value: string | null | undefined,
  masker: (v: string) => string,
): string | null =>
  value == null ? null : value.includes("*") ? value : masker(value);

/**
 * PII-safe snapshot of a parsed spreadsheet row for persisting into
 * logistics_import_rows (recipient_name_masked / recipient_phone_masked /
 * raw_row_json). Names and phones that are not already masked by the source
 * platform get masked here; full addresses are never included. Every write to
 * logistics_import_rows MUST go through this function.
 */
export function sanitizeImportRowForStorage(row: LogisticsImportRow): {
  recipientNameMasked: string | null;
  recipientPhoneMasked: string | null;
  rawRowJson: Record<string, unknown>;
} {
  const recipientNameMasked = ensureMasked(row.recipientName, maskName);
  const recipientPhoneMasked = ensureMasked(row.recipientPhone, maskPhone);
  return {
    recipientNameMasked,
    recipientPhoneMasked,
    rawRowJson: {
      rowNumber: row.rowNumber,
      trackingCode: row.trackingCode,
      recipientNameMasked,
      recipientPhoneMasked,
      storeName: row.storeName,
      externalOrderNo: row.externalOrderNo,
      productText: row.productText ?? null,
      status: row.status ?? null,
      shippedAt: row.shippedAt ?? null,
      pickedUpAt: row.pickedUpAt ?? null,
    },
  };
}
