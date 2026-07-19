/**
 * 全家店到店貨態查詢 adapter（Step 7D productionize）
 *
 * Endpoint（spike 已驗證，無 captcha / cookie / referer）：
 *   POST https://ecfme.fme.com.tw/FMEDCFPWebV2_II/list.aspx/GetOrderDetail
 *   body: { EC_ORDER_NO, ORDER_NO, RCV_USER_NAME: null }
 *
 * Response 為 ASP.NET 包裝：{ "d": "<JSON string>" }，內層：
 *   { ErrorCode: "000", ErrorMessage, List: [{ STATUS_D, ORDER_DATE_R, RCV_STORE_NAME, ... }] }
 *   List 為最新在前（仍以日期排序防順序改版）。
 *   查無資料時 ErrorCode = "999" + List: []。
 *
 * 本檔不寫 DB、不接 worker。事件 rawData 只含物流節點欄位（門市資訊），
 * 不含客人姓名 / 電話 / 地址。
 */

import type {
  NormalizedTrackingStatus,
  TrackingAdapterResult,
  TrackingEvent,
} from "./types.ts";

const ENDPOINT =
  "https://ecfme.fme.com.tw/FMEDCFPWebV2_II/list.aspx/GetOrderDetail";

export type FamilyMartTrackingResult = TrackingAdapterResult<"familymart">;

export interface FamilyMartQueryInput {
  trackingCode: string;
  timeoutMs?: number;
}

export interface FamilyMartDeps {
  fetchImpl?: typeof fetch;
}

interface FamiRawEvent {
  STATUS_D?: string;
  ORDER_DATE_R?: string | null;
  ORDER_DATE?: string;
  ORDER_TIME?: string;
  ORDER_STATUS?: string;
  RCV_STORE_NAME?: string | null;
  SEND_STORE_NAME?: string | null;
}

export async function queryFamilyMartTracking(
  input: FamilyMartQueryInput,
  deps: FamilyMartDeps = {},
): Promise<FamilyMartTrackingResult> {
  const provider = "familymart" as const;
  const trackingCode = (input.trackingCode ?? "").trim();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const doFetch = deps.fetchImpl ?? fetch;

  const failure = (
    errorCode: Extract<FamilyMartTrackingResult, { ok: false }>["errorCode"],
    message: string,
    retryable: boolean,
  ): FamilyMartTrackingResult => ({
    ok: false,
    provider,
    trackingCode,
    errorCode,
    message,
    retryable,
  });

  // 全家店到店單號為純數字（實測 11 碼）；保守允許 8–20 碼數字。
  if (!/^\d{8,20}$/.test(trackingCode)) {
    return failure(
      "INVALID_TRACKING_CODE",
      `Invalid tracking code format (len=${trackingCode.length})`,
      false,
    );
  }

  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        EC_ORDER_NO: trackingCode,
        ORDER_NO: trackingCode,
        RCV_USER_NAME: null,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      return failure("TIMEOUT", `Request timed out after ${timeoutMs}ms`, true);
    }
    return failure("NETWORK_FAILED", msg, true);
  }

  if (!res.ok) {
    return failure("REMOTE_ERROR", `HTTP ${res.status}`, res.status >= 500);
  }

  // 防 schema 改版：外層 { d: string }，內層 JSON string。
  let inner: {
    ErrorCode?: string;
    ErrorMessage?: string;
    List?: FamiRawEvent[];
  };
  try {
    const text = await res.text();
    const outer = JSON.parse(text);
    if (typeof outer?.d !== "string") {
      return failure(
        "REMOTE_CHANGED",
        "Missing 'd' wrapper in response",
        false,
      );
    }
    inner = JSON.parse(outer.d);
  } catch {
    return failure(
      "PARSER_FAILED",
      "Response is not the expected JSON shape",
      false,
    );
  }

  if (
    typeof inner?.ErrorCode !== "string" ||
    !Array.isArray(inner?.List ?? [])
  ) {
    return failure(
      "REMOTE_CHANGED",
      "Inner payload missing ErrorCode/List",
      false,
    );
  }

  if (inner.ErrorCode !== "000") {
    // 實測查無資料：ErrorCode "999" + 查無訂單資料
    const msg =
      `ErrorCode=${inner.ErrorCode} ${inner.ErrorMessage ?? ""}`.trim();
    if (inner.ErrorCode === "999" || (inner.List ?? []).length === 0) {
      return failure("NO_RESULT", msg, false);
    }
    return failure("REMOTE_ERROR", msg, true);
  }

  const list = inner.List ?? [];
  if (list.length === 0) {
    return failure("NO_RESULT", "ErrorCode 000 but empty List", false);
  }

  const events = list.map(toEvent);
  // 實測 List 最新在前；仍以 occurredAt 排序（舊→新）防順序改版。日期全 parse 失敗時保留原順序反轉。
  const sortable = events.every((e) => e.occurredAt !== null);
  const ordered = sortable
    ? [...events].sort((a, b) =>
        a.occurredAt! < b.occurredAt!
          ? -1
          : a.occurredAt! > b.occurredAt!
            ? 1
            : 0,
      )
    : [...events].reverse();
  const latest = ordered[ordered.length - 1];

  return {
    ok: true,
    provider,
    trackingCode,
    normalizedStatus: normalizeStatus(latest.eventStatus),
    latestStatusText: latest.eventStatus,
    latestEventAt: latest.occurredAt,
    events: ordered,
    rawSummary: {
      errorCode: inner.ErrorCode,
      errorMessage: inner.ErrorMessage ?? null,
      eventCount: ordered.length,
      sortedByDate: sortable,
    },
  };
}

function toEvent(raw: FamiRawEvent): TrackingEvent {
  const status = (raw.STATUS_D ?? "").trim();
  const occurredAt =
    (raw.ORDER_DATE_R ?? "").trim() ||
    [raw.ORDER_DATE, raw.ORDER_TIME].filter(Boolean).join(" ").trim() ||
    null;
  return {
    eventStatus: status || "unknown",
    eventDescription: status || "unknown",
    eventLocation: raw.RCV_STORE_NAME?.trim() || null,
    occurredAt:
      occurredAt && /^\d{4}\/\d{2}\/\d{2}/.test(occurredAt) ? occurredAt : null,
    // 僅物流節點欄位（狀態碼、門市名），不含客人個資。
    rawData: {
      orderStatus: raw.ORDER_STATUS ?? null,
      statusD: status || null,
      orderDateR: raw.ORDER_DATE_R ?? null,
      sendStoreName: raw.SEND_STORE_NAME ?? null,
      rcvStoreName: raw.RCV_STORE_NAME ?? null,
    },
  };
}

/**
 * 保守 mapping：全家「已完成寄件」是寄件人完成寄件（剛收件），不是配達 —
 * 歸 in_transit。配達取件店舖 → arrived_store；取件完成字樣才標 picked_up。
 */
export function normalizeStatus(statusText: string): NormalizedTrackingStatus {
  const s = statusText.trim();
  if (!s) return "unknown";
  if (/(取件完成|完成取件|已取件|已取貨)/.test(s)) return "picked_up";
  if (/(配達取件店舖|到達取件店|到店|貨件配達)/.test(s)) return "arrived_store";
  if (/(退回|退件|退貨)/.test(s)) return "returned";
  if (/(異常|遺失|取消|逾期)/.test(s)) return "exception";
  if (/(已完成寄件|完成寄件|前往物流中心|物流中心|配送中|轉運|運送)/.test(s))
    return "in_transit";
  if (/(訂單成立|未寄件)/.test(s)) return "pending";
  return "unknown";
}
