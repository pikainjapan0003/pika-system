export type LogisticsProvider = "711" | "familymart";

export type MatchStatus =
  | "matched"
  | "needs_review"
  | "ambiguous"
  | "not_found"
  | "conflict"
  | "invalid";

export type ImportErrorCode =
  | "MISSING_TRACKING_CODE"
  | "MISSING_STORE_NAME"
  | "NO_STORE_MATCH"
  | "NO_NAME_MATCH"
  | "NO_PHONE_MATCH"
  | "PHONE_NOT_MOBILE"
  | "MULTIPLE_CANDIDATES"
  | "TRACKING_CODE_CONFLICT"
  | "ORDER_ALREADY_MATCHED"
  | null;

/** One parsed spreadsheet row. Name/phone values stay masked as exported by the platform. */
export interface LogisticsImportRow {
  rowNumber: number;
  recipientName: string | null;
  recipientPhone: string | null;
  trackingCode: string | null;
  storeName: string | null;
  externalOrderNo: string | null;
  productText?: string | null;
  status?: string | null;
  shippedAt?: string | null;
  pickedUpAt?: string | null;
}

export interface ParsedSpreadsheet {
  provider: LogisticsProvider;
  fileName: string;
  headerRow: number;
  /** field name -> spreadsheet column letter (debug only — matching never uses letters) */
  columnMapping: Record<string, string>;
  rows: LogisticsImportRow[];
}

/** Minimal order projection needed for matching. Caller selects these read-only. */
export interface CandidateOrder {
  id: number;
  status: string;
  shippingMethod: string | null;
  trackingCode: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  cvsStoreName: string | null;
}

export interface RowMatchResult {
  rowNumber: number;
  trackingCode: string | null;
  recipientNameMasked: string | null;
  recipientPhoneMasked: string | null;
  storeName: string | null;
  matchStatus: MatchStatus;
  matchedOrderId?: number;
  confidence?: number;
  candidateCount?: number;
  reasons: string[];
  errorCode: ImportErrorCode;
}

export interface DryRunReport {
  provider: LogisticsProvider;
  fileName: string;
  totalRows: number;
  matchedRows: number;
  needsReviewRows: number;
  ambiguousRows: number;
  notFoundRows: number;
  conflictRows: number;
  invalidRows: number;
  rows: RowMatchResult[];
}
