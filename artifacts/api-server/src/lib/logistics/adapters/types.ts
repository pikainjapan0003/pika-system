/**
 * 共用 adapter 型別（Step 7D）— 最小集合，新 adapter 沿用此格式。
 * sevenElevenAdapter（POC）暫保留自有型別，待 worker 整合時再統一。
 */

export type NormalizedTrackingStatus =
  | "pending"
  | "in_transit"
  | "arrived_store"
  | "picked_up"
  | "delivered"
  | "returned"
  | "exception"
  | "unknown";

export interface TrackingEvent {
  eventStatus: string;
  eventDescription: string;
  eventLocation: string | null;
  occurredAt: string | null;
  rawData: Record<string, unknown>;
}

export type TrackingAdapterErrorCode =
  | "INVALID_TRACKING_CODE"
  | "NO_RESULT"
  | "EMPTY_LIST"
  | "REMOTE_ERROR"
  | "NETWORK_FAILED"
  | "TIMEOUT"
  | "PARSER_FAILED"
  | "HTML_PARSE_FAILED"
  | "REMOTE_CHANGED"
  | "CAPTCHA_REQUIRED"
  | "OCR_FAILED"
  | "VERIFY_FAILED"
  | "BLOCKED"
  | "UNKNOWN_ERROR";

export type TrackingAdapterResult<P extends string> =
  | {
      ok: true;
      provider: P;
      trackingCode: string;
      normalizedStatus: NormalizedTrackingStatus;
      latestStatusText: string;
      latestEventAt: string | null;
      events: TrackingEvent[];
      rawSummary: Record<string, unknown>;
    }
  | {
      ok: false;
      provider: P;
      trackingCode: string;
      errorCode: TrackingAdapterErrorCode;
      message: string;
      retryable: boolean;
    };
