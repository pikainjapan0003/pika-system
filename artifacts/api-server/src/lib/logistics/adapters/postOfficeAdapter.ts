/**
 * 中華郵政貨態查詢 adapter（Step 7M POC）
 *
 * Endpoint（spike EB500100 已驗證，無 captcha / cookie / session）：
 *   POST https://postserv.post.gov.tw/pstmail/EsoafDispatcher
 *   header.TxnCode = EB500100, header.BizCode = query2
 *   body: { MAILNO: trackingCode, uuid: randomUUID() }
 *
 * Response path: [0].body.host_rs.ITEM
 * Fields: DATIME (14-digit yyyyMMddHHmmss → YYYY/MM/DD HH:mm:ss), STATUS (trim), BRHNC (trim)
 *
 * 本檔不寫 DB、不接 worker、不呼叫 /internal/agent/shipment-events。
 */

import { randomUUID } from "node:crypto";
import type {
  NormalizedTrackingStatus,
  TrackingAdapterResult,
  TrackingEvent,
} from "./types.ts";

const ENDPOINT =
  "https://postserv.post.gov.tw/pstmail/EsoafDispatcher";
const REFERER =
  "https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type PostOfficeTrackingResult = TrackingAdapterResult<"postoffice">;

export interface PostOfficeQueryInput {
  trackingCode: string;
  timeoutMs?: number;
}

export interface PostOfficeDeps {
  fetchImpl?: typeof fetch;
}

interface EsoafItem {
  MAILNO?: string;
  DATIME?: string;
  STATUS?: string;
  BRHNC?: string;
  EVCODE?: string;
  [key: string]: unknown;
}

export async function queryPostOfficeTracking(
  input: PostOfficeQueryInput,
  deps: PostOfficeDeps = {},
): Promise<PostOfficeTrackingResult> {
  const provider = "postoffice" as const;
  const trackingCode = (input.trackingCode ?? "").trim();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const doFetch = deps.fetchImpl ?? fetch;

  const failure = (
    errorCode: Extract<PostOfficeTrackingResult, { ok: false }>["errorCode"],
    message: string,
    retryable: boolean,
  ): PostOfficeTrackingResult => ({
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

  const uuid = randomUUID();
  const payload = {
    header: {
      InputVOClass:
        "com.systex.jbranch.app.server.post.vo.EB500100InputVO",
      TxnCode: "EB500100",
      BizCode: "query2",
      StampTime: true,
      SupvPwd: "",
      TXN_DATA: {},
      SupvID: "",
      CustID: "",
      REQUEST_ID: "",
      ApplicationID: "",
      BranchID: "",
      TlrID: "",
      WsID: "",
      ClientTransaction: true,
      DevMode: false,
      SectionID: "esoaf",
    },
    body: {
      MAILNO: trackingCode.toUpperCase(),
      uuid,
    },
  };

  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: REFERER,
        Origin: "https://postserv.post.gov.tw",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(payload),
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

  let rawData: unknown;
  try {
    const text = await res.text();
    rawData = JSON.parse(text.trim());
  } catch {
    return failure("PARSER_FAILED", "Response is not valid JSON", false);
  }

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return failure(
      "REMOTE_CHANGED",
      "Response is not a non-empty array",
      false,
    );
  }

  const arr = rawData as Array<Record<string, unknown>>;

  const screenItem = arr.find(
    (item) =>
      (item?.header as Record<string, unknown>)?.OutputType === "Screen",
  );

  if (!screenItem) {
    const msgItem = arr.find(
      (item) =>
        (item?.header as Record<string, unknown>)?.OutputType === "Message",
    );
    const msgData = (msgItem?.body as Record<string, unknown>)?.msgData;
    return failure(
      "REMOTE_CHANGED",
      `No Screen response${msgData ? `: ${msgData}` : ""}`,
      false,
    );
  }

  const screenBody = screenItem.body as Record<string, unknown>;

  // cptCheck=true means server triggered captcha/session verification
  if (screenBody?.cptCheck === true) {
    return failure(
      "VERIFY_FAILED",
      "Server returned cptCheck=true: captcha or session validation required",
      false,
    );
  }

  const hostRs = screenBody?.host_rs as Record<string, unknown> | undefined;

  if (!hostRs) {
    return failure("REMOTE_CHANGED", "Missing host_rs in Screen body", false);
  }

  const items = hostRs.ITEM;
  if (!Array.isArray(items)) {
    return failure(
      "REMOTE_CHANGED",
      "host_rs.ITEM is not an array",
      false,
    );
  }
  if (items.length === 0) {
    return failure("EMPTY_LIST", "host_rs.ITEM is empty", false);
  }

  const upperCode = trackingCode.toUpperCase();
  const matched = (items as EsoafItem[]).filter(
    (item) => (item.MAILNO ?? "").toUpperCase() === upperCode,
  );
  if (matched.length === 0) {
    return failure(
      "REMOTE_CHANGED",
      `No ITEM with MAILNO matching ${trackingCode}`,
      false,
    );
  }

  const events = matched.map(toEvent);
  // Sort newest first by occurredAt string (ISO-comparable after formatting)
  events.sort((a, b) => {
    if (!a.occurredAt || !b.occurredAt) return 0;
    return a.occurredAt > b.occurredAt ? -1 : a.occurredAt < b.occurredAt ? 1 : 0;
  });

  const latest = events[0];

  return {
    ok: true,
    provider,
    trackingCode,
    normalizedStatus: normalizePostOfficeStatus(latest.eventStatus),
    latestStatusText: latest.eventStatus,
    latestEventAt: latest.occurredAt,
    events,
    rawSummary: {
      itemCount: matched.length,
      uuid,
    },
  };
}

function parseDatime(datime: string): string | null {
  const s = (datime ?? "").trim();
  if (s.length === 14 && /^\d{14}$/.test(s)) {
    return (
      `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)} ` +
      `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
    );
  }
  return null;
}

function toEvent(item: EsoafItem): TrackingEvent {
  const status = (item.STATUS ?? "").trim();
  return {
    eventStatus: status || "unknown",
    eventDescription: status || "unknown",
    eventLocation: (item.BRHNC ?? "").trim() || null,
    occurredAt: parseDatime(item.DATIME ?? ""),
    rawData: {
      mailNo: item.MAILNO ?? null,
      evCode: item.EVCODE ?? null,
      datime: item.DATIME ?? null,
    },
  };
}

export function normalizePostOfficeStatus(
  statusText: string,
): NormalizedTrackingStatus {
  const s = statusText.trim();
  if (!s) return "unknown";
  if (/(投遞成功|送達|簽收)/.test(s)) return "delivered";
  if (/(退回|退件|退貨)/.test(s)) return "returned";
  if (/(異常|遺失|查無)/.test(s)) return "exception";
  if (/(投遞中|配送中|運輸途中|郵件轉運|轉運)/.test(s)) return "in_transit";
  if (/(交寄|寄件|收件)/.test(s)) return "pending";
  return "unknown";
}
