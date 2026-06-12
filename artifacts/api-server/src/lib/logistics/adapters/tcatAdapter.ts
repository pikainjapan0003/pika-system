/**
 * 黑貓宅急便貨態查詢 adapter（Step 7M POC）
 *
 * Endpoint（spike 已驗證，無 captcha / cookie / referer / UA 需求）：
 *   GET https://www.t-cat.com.tw/inquire/TraceDetail.aspx?BillID=<trackingCode>
 *
 * Response 為 HTML。主要貨態在 <table id="resultTable">，不在其他 table。
 * 第一列因 rowspan=5 包含貨號，其餘列只有貨態欄位。
 *
 * 本檔不寫 DB、不接 worker、不呼叫 /internal/agent/shipment-events。
 */

import type {
  NormalizedTrackingStatus,
  TrackingAdapterResult,
  TrackingEvent,
} from "./types.ts";

const BASE_URL = "https://www.t-cat.com.tw/inquire/TraceDetail.aspx";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type TcatTrackingResult = TrackingAdapterResult<"tcat">;

export interface TcatQueryInput {
  trackingCode: string;
  timeoutMs?: number;
}

export interface TcatDeps {
  fetchImpl?: typeof fetch;
}

export async function queryTcatTracking(
  input: TcatQueryInput,
  deps: TcatDeps = {},
): Promise<TcatTrackingResult> {
  const provider = "tcat" as const;
  const trackingCode = (input.trackingCode ?? "").trim();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const doFetch = deps.fetchImpl ?? fetch;

  const failure = (
    errorCode: Extract<TcatTrackingResult, { ok: false }>["errorCode"],
    message: string,
    retryable: boolean,
  ): TcatTrackingResult => ({
    ok: false,
    provider,
    trackingCode,
    errorCode,
    message,
    retryable,
  });

  if (!trackingCode) {
    return failure("INVALID_TRACKING_CODE", "Empty tracking code", false);
  }

  let res: Response;
  try {
    res = await doFetch(`${BASE_URL}?BillID=${encodeURIComponent(trackingCode)}`, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      return failure(
        "TIMEOUT",
        `Request timed out after ${timeoutMs}ms`,
        true,
      );
    }
    return failure("NETWORK_FAILED", msg, true);
  }

  if (!res.ok) {
    return failure("REMOTE_ERROR", `HTTP ${res.status}`, res.status >= 500);
  }

  const html = await res.text();

  // 防假成功：HTTP 200 不夠，response 必須含 trackingCode
  if (!html.includes(trackingCode)) {
    return failure(
      "EMPTY_LIST",
      `Response does not contain trackingCode ${trackingCode}`,
      false,
    );
  }

  // 鎖定 <table id="resultTable">，避免抓到頁面其他示範/噪音列
  const resultTableMatch = html.match(
    /<table[^>]*\bid="resultTable"[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!resultTableMatch) {
    // resultTable 不存在 → 可能是查無貨號或頁面改版
    if (html.includes("查無")) {
      return failure(
        "EMPTY_LIST",
        "resultTable not found; page indicates no result",
        false,
      );
    }
    return failure(
      "REMOTE_CHANGED",
      "resultTable element not found in response",
      false,
    );
  }

  const tableHtml = resultTableMatch[1];
  const events = parseResultTable(tableHtml, trackingCode);

  if (events.length === 0) {
    return failure(
      "EMPTY_LIST",
      "resultTable found but no events parsed",
      false,
    );
  }

  // Sort newest first by occurredAt
  events.sort((a, b) => {
    if (!a.occurredAt || !b.occurredAt) return 0;
    return a.occurredAt > b.occurredAt ? -1 : a.occurredAt < b.occurredAt ? 1 : 0;
  });

  const latest = events[0];

  return {
    ok: true,
    provider,
    trackingCode,
    normalizedStatus: normalizeTcatStatus(latest.eventStatus),
    latestStatusText: latest.eventStatus,
    latestEventAt: latest.occurredAt,
    events,
    rawSummary: { eventCount: events.length },
  };
}

const DATETIME_RE = /(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/;

/**
 * Parse <tr> elements inside resultTable.
 * First row has rowspan carrying the trackingCode; subsequent rows have 3 cells.
 * Each data row: [statusText | datetime | location]
 */
function parseResultTable(tableHtml: string, trackingCode: string): TrackingEvent[] {
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  const events: TrackingEvent[] = [];

  for (const row of rows) {
    // Skip header rows (th elements)
    if (/<th[^>]*>/i.test(row)) continue;

    const rawText = stripTags(row).replace(/\s+/g, " ").trim();
    if (!rawText) continue;

    const dtMatch = rawText.match(DATETIME_RE);
    if (!dtMatch) continue;

    const occurredAt = `${dtMatch[1]} ${dtMatch[2]}`;

    // Remove the tracking code from row text if present (first row rowspan)
    const textWithoutCode = rawText.replace(trackingCode, "").trim();
    const textWithoutDt = textWithoutCode.replace(occurredAt, "").trim();

    // Split remaining text into parts; first non-empty is status, last is location
    const parts = textWithoutDt.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);

    let statusText = "";
    let location: string | null = null;

    if (parts.length >= 2) {
      statusText = parts[0];
      location = parts[parts.length - 1];
      if (location === statusText) location = null;
    } else if (parts.length === 1) {
      statusText = parts[0];
    }

    if (!statusText) continue;

    events.push({
      eventStatus: statusText,
      eventDescription: statusText,
      eventLocation: location,
      occurredAt,
      rawData: { rawText },
    });
  }

  return events;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTcatStatus(
  statusText: string,
): NormalizedTrackingStatus {
  const s = statusText.trim();
  if (!s) return "unknown";
  if (/(順利送達|已送達|投遞成功)/.test(s)) return "delivered";
  if (/(退回|退件|退貨|取消)/.test(s)) return "returned";
  if (/(異常|未順利取件|遺失)/.test(s)) return "exception";
  if (/(配送中|運送中|轉運|已集貨)/.test(s)) return "in_transit";
  if (/(超商代收|收件|攬收)/.test(s)) return "pending";
  return "unknown";
}
