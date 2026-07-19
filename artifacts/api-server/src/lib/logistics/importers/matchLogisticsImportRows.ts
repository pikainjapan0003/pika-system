import type {
  CandidateOrder,
  DryRunReport,
  LogisticsImportRow,
  LogisticsProvider,
  ParsedSpreadsheet,
  RowMatchResult,
} from "./types.ts";

// ---------- normalization ----------

export const normalizeStoreName = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/[\s　()（）【】\-–—]/g, "")
    .replace(/7-?11|統一超商|統一|全家便利商店|全家|FamilyMart/gi, "")
    .replace(/門市|店$/g, "")
    .replace(/店到店/g, "")
    .trim();

export const normalizePhone = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[-\s()]/g, "");

/** Taiwan mobile only: 09 + 8 digits. Landlines are never auto-matched. */
export const isTaiwanMobile = (s: string | null | undefined): boolean =>
  /^09\d{8}$/.test(normalizePhone(s));

/** Mask match: first and last visible chars must agree (高*庭 ↔ 高雅庭). */
export function nameMaskMatch(
  masked: string | null,
  full: string | null,
): boolean {
  if (!masked || !full) return false;
  const m = masked.trim();
  const f = full.trim();
  if (!m.includes("*")) return m === f;
  if (m.length < 2 || f.length < 2) return false;
  const first = m[0];
  const last = m[m.length - 1];
  return (
    (first === "*" || f[0] === first) &&
    (last === "*" || f[f.length - 1] === last)
  );
}

/** Masked phone match: same length, visible digit positions must agree. */
export function phoneMaskMatch(
  masked: string | null,
  full: string | null,
): boolean {
  if (!masked || !full) return false;
  const m = normalizePhone(masked);
  const f = normalizePhone(full);
  if (m.length !== f.length) return false;
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== "*" && m[i] !== f[i]) return false;
  }
  return true;
}

const maskName = (s: string): string =>
  s.length <= 1 ? "*" : s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
const maskPhone = (s: string): string => {
  const t = normalizePhone(s);
  return t.length <= 4
    ? "****"
    : t.slice(0, 2) + "*".repeat(t.length - 4) + t.slice(-2);
};
const remask = (
  s: string | null,
  masker: (v: string) => string,
): string | null => (s == null ? null : s.includes("*") ? s : masker(s));

// ---------- matching ----------

type Verdict = Pick<
  RowMatchResult,
  | "matchStatus"
  | "matchedOrderId"
  | "confidence"
  | "candidateCount"
  | "reasons"
  | "errorCode"
>;

function matchRow(
  provider: LogisticsProvider,
  row: LogisticsImportRow,
  orders: CandidateOrder[],
  usedTracking: Map<string, number>,
): Verdict {
  const reasons: string[] = [];
  if (!row.trackingCode)
    return {
      matchStatus: "invalid",
      errorCode: "MISSING_TRACKING_CODE",
      reasons,
    };
  if (!row.storeName)
    return { matchStatus: "invalid", errorCode: "MISSING_STORE_NAME", reasons };

  const rowStore = normalizeStoreName(row.storeName);
  let candidates = orders.filter((o) => {
    if (o.status === "completed" || o.status === "cancelled") return false;
    if (o.trackingCode && o.trackingCode !== row.trackingCode) return false;
    if (o.shippingMethod !== "convenience_store" && !o.cvsStoreName)
      return false;
    return true;
  });

  // store: exact normalized first; contains is candidate-only (→ needs_review)
  const storeExact = rowStore
    ? candidates.filter((o) => normalizeStoreName(o.cvsStoreName) === rowStore)
    : [];
  const storeContains = rowStore
    ? candidates.filter(
        (o) =>
          !storeExact.includes(o) &&
          normalizeStoreName(o.cvsStoreName).includes(rowStore),
      )
    : [];
  candidates = storeExact.length ? storeExact : storeContains;
  if (!candidates.length)
    return { matchStatus: "not_found", errorCode: "NO_STORE_MATCH", reasons };
  reasons.push(
    storeExact.length
      ? `store_exact_match:${rowStore}`
      : `store_contains_match:${rowStore}`,
  );

  // name: required for 7-11; for familymart it must match or at least not contradict
  const nameOf = (o: CandidateOrder) => o.recipientName || o.buyerName;
  let nameMatched = candidates.filter((o) =>
    nameMaskMatch(row.recipientName, nameOf(o)),
  );
  let nameReason = "name_mask_match:first_last";
  if (provider === "familymart" && !nameMatched.length && row.recipientPhone) {
    nameMatched = candidates; // phone+store may still carry, flagged below
    nameReason = "name_not_verified";
  }
  candidates = nameMatched;
  if (!candidates.length)
    return { matchStatus: "not_found", errorCode: "NO_NAME_MATCH", reasons };
  reasons.push(nameReason);

  // phone: familymart mandatory, Taiwan mobile (09xxxxxxxx) only
  if (provider === "familymart") {
    const mobileCandidates = candidates.filter((o) =>
      isTaiwanMobile(o.recipientPhone || o.buyerPhone),
    );
    if (!mobileCandidates.length)
      return {
        matchStatus: "not_found",
        errorCode: "PHONE_NOT_MOBILE",
        reasons,
      };
    candidates = mobileCandidates.filter((o) =>
      phoneMaskMatch(row.recipientPhone, o.recipientPhone || o.buyerPhone),
    );
    if (!candidates.length)
      return { matchStatus: "not_found", errorCode: "NO_PHONE_MATCH", reasons };
    reasons.push("phone_mask_match");
  }

  if (candidates.length > 1)
    return {
      matchStatus: "ambiguous",
      errorCode: "MULTIPLE_CANDIDATES",
      candidateCount: candidates.length,
      reasons,
    };

  const order = candidates[0];
  const trackingOwner = usedTracking.get(row.trackingCode);
  if (trackingOwner != null && trackingOwner !== order.id)
    return {
      matchStatus: "conflict",
      errorCode: "TRACKING_CODE_CONFLICT",
      reasons,
    };
  for (const [code, oid] of usedTracking) {
    if (oid === order.id && code !== row.trackingCode)
      return {
        matchStatus: "conflict",
        errorCode: "ORDER_ALREADY_MATCHED",
        reasons,
      };
  }
  usedTracking.set(row.trackingCode, order.id);
  reasons.push("unique_candidate");

  const containsOnly = reasons.some((r) =>
    r.startsWith("store_contains_match"),
  );
  const weakName = reasons.includes("name_not_verified");
  const matchStatus = containsOnly ? "needs_review" : "matched";
  const confidence =
    (containsOnly ? 70 : 95) +
    (provider === "familymart" && !weakName ? 5 : 0) -
    (weakName ? 15 : 0);
  return {
    matchStatus,
    matchedOrderId: order.id,
    confidence,
    reasons,
    errorCode: null,
  };
}

/**
 * Dry-run matcher: pairs parsed spreadsheet rows with candidate orders
 * deterministically. Pure function — never touches the database. The report
 * exposes masked PII only.
 */
export function matchLogisticsImportRows(
  sheet: ParsedSpreadsheet,
  orders: CandidateOrder[],
): DryRunReport {
  const usedTracking = new Map<string, number>();
  const rows: RowMatchResult[] = sheet.rows.map((row) => ({
    rowNumber: row.rowNumber,
    trackingCode: row.trackingCode,
    recipientNameMasked: remask(row.recipientName, maskName),
    recipientPhoneMasked: remask(row.recipientPhone, maskPhone),
    storeName: row.storeName,
    ...matchRow(sheet.provider, row, orders, usedTracking),
  }));
  const count = (s: RowMatchResult["matchStatus"]) =>
    rows.filter((r) => r.matchStatus === s).length;
  return {
    provider: sheet.provider,
    fileName: sheet.fileName,
    totalRows: rows.length,
    matchedRows: count("matched"),
    needsReviewRows: count("needs_review"),
    ambiguousRows: count("ambiguous"),
    notFoundRows: count("not_found"),
    conflictRows: count("conflict"),
    invalidRows: count("invalid"),
    rows,
  };
}
