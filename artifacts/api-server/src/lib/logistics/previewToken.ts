import { createHmac, timingSafeEqual } from "crypto";

/**
 * Step 7N-J2：manual-provider preview token（previewHash）。
 *
 * 用途：把 /preview 看到的查詢結果摘要簽成 token，未來 /commit（J3）必須帶回
 * 同一個 token 才允許正式寫入，確保「看到的 preview」與「要寫入的內容」一致，
 * 且 preview 在有效期內。HMAC-SHA256、stateless、無 DB table、10 分鐘過期。
 *
 * key 來源：以 SESSION_SECRET 衍生（HMAC(SESSION_SECRET, context)），不硬編、
 * 不印出 secret、不 log token 內容。SESSION_SECRET 不存在時回報 unavailable，
 * 由 route 降級（不回 hash），不可 throw 影響 preview 本體。
 */

const KEY_CONTEXT = "manual-provider-preview-v1";
export const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface PreviewTokenPayload {
  v: 1;
  purpose: "manual-provider-commit";
  storeId: number;
  trackingId: number;
  provider: string;
  trackingCode: string;
  latestStatusText: string | null;
  latestEventAt: string | null;
  expectedEventCount: number;
  normalizedStatus: string | null;
  expiresAt: string;
}

export function isPreviewTokenAvailable(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("PREVIEW_TOKEN_SECRET_UNAVAILABLE");
  return createHmac("sha256", secret).update(KEY_CONTEXT).digest();
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function signPreviewToken(
  payload: Omit<PreviewTokenPayload, "v" | "purpose" | "expiresAt">,
  now: Date = new Date(),
): { token: string; expiresAt: string } {
  const expiresAt = new Date(
    now.getTime() + PREVIEW_TOKEN_TTL_MS,
  ).toISOString();
  const full: PreviewTokenPayload = {
    v: 1,
    purpose: "manual-provider-commit",
    ...payload,
    expiresAt,
  };
  const payloadPart = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  const sig = createHmac("sha256", deriveKey()).update(payloadPart).digest();
  return { token: `${payloadPart}.${b64url(sig)}`, expiresAt };
}

export type VerifyPreviewTokenResult =
  | { ok: true; payload: PreviewTokenPayload }
  | { ok: false; errorCode: "PREVIEW_HASH_INVALID" | "PREVIEW_EXPIRED" };

export function verifyPreviewToken(
  token: string,
  now: Date = new Date(),
): VerifyPreviewTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, errorCode: "PREVIEW_HASH_INVALID" };
  }
  const expected = createHmac("sha256", deriveKey()).update(parts[0]).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, errorCode: "PREVIEW_HASH_INVALID" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, errorCode: "PREVIEW_HASH_INVALID" };
  }
  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, errorCode: "PREVIEW_HASH_INVALID" };
  }
  if (payload.v !== 1 || payload.purpose !== "manual-provider-commit") {
    return { ok: false, errorCode: "PREVIEW_HASH_INVALID" };
  }
  if (
    !payload.expiresAt ||
    new Date(payload.expiresAt).getTime() <= now.getTime()
  ) {
    return { ok: false, errorCode: "PREVIEW_EXPIRED" };
  }
  return { ok: true, payload };
}
