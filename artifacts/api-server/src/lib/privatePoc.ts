import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

// This opt-in deployment mode never discovers an owner from login or database order.
export function privatePocConfig() {
  if (process.env.PIKA_PRIVATE_POC !== "true") return null;
  const ownerId = process.env.PIKA_OWNER_CLERK_USER_ID;
  const storeId = Number(process.env.PIKA_OWNER_STORE_ID);
  if (!ownerId?.startsWith("user_") || !Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new Error("Private POC requires an explicit Clerk owner and store ID");
  }
  return { ownerId, storeId };
}

export function isPocStore(storeId: number) {
  const config = privatePocConfig();
  return !config || config.storeId === storeId;
}

// Only approved synthetic slices are enabled. Keep other modules/schema intact.
const permitted = [
  ["GET", /^\/api\/healthz$/],
  ["GET", /^\/api\/me\/store$/],
  ["GET", /^\/api\/poc\/catalog$/],
  ["GET", /^\/api\/poc\/images\/products\/\d+\/[^/]+$/],
  ["GET", /^\/api\/p\/[^/]+$/],
  ["POST", /^\/api\/p\/[^/]+\/orders$/],
  ["POST", /^\/api\/cart\/orders$/],
  ["GET", /^\/api\/orders\/track\/[^/]+$/],
  ["GET", /^\/api\/stores\/\d+\/(?:products|categories|orders|stats)$/],
  ["POST", /^\/api\/stores\/\d+\/products$/],
  ["POST", /^\/api\/stores\/\d+\/products\/image$/],
  ["GET", /^\/api\/stores\/\d+\/(?:products|orders)\/\d+$/],
  ["GET", /^\/api\/stores\/\d+\/orders\/(?:profit-summary|monthly-profit)$/],
  ["GET", /^\/api\/stores\/\d+\/customers(?:\/\d+(?:\/store-credit)?)?$/],
  ["GET", /^\/api\/stores\/\d+\/customers\/export$/],
  ["POST", /^\/api\/stores\/\d+\/customers\/\d+\/store-credit$/],
  ["PATCH", /^\/api\/stores\/\d+$/], // stores.ts limits this to the synthetic purchase rate.
  ["POST", /^\/api\/stores\/\d+\/customers$/],
  ["PATCH", /^\/api\/stores\/\d+\/customers\/\d+$/],
  ["GET", /^\/api\/trips$/],
  ["POST", /^\/api\/trips(?:\/\d+\/routes)?$/],
  ["PATCH", /^\/api\/trips\/\d+(?:\/routes\/\d+)?$/],
  ["POST", /^\/api\/stores\/\d+\/orders\/\d+\/logistics\/familymart$/],
  ["PATCH", /^\/api\/stores\/\d+\/products\/\d+$/],
  ["DELETE", /^\/api\/stores\/\d+\/products\/\d+$/],
  ["GET", /^\/api\/stores\/\d+\/invoice-ocr\/(?:test-cases(?:\/\d+(?:\/image)?)?|benchmark-summary|benchmark\.csv)$/],
  ["POST", /^\/api\/stores\/\d+\/invoice-ocr\/test-cases(?:\/\d+\/analyze)?$/],
  ["PATCH", /^\/api\/stores\/\d+\/invoice-ocr\/(?:test-cases\/\d+|runs\/\d+\/review)$/],
] as const;

export const privatePocBoundary: RequestHandler = (req, res, next) => {
  if (process.env.PIKA_PRIVATE_POC !== "true") return next();
  try {
    privatePocConfig();
    const secret = process.env.PIKA_POC_PROXY_SECRET;
    if (!secret || secret.length < 32) throw new Error("Missing POC proxy secret");
    const supplied = req.get("x-pika-poc-key") ?? "";
    const expectedBytes = Buffer.from(secret);
    const suppliedBytes = Buffer.from(supplied);
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      return res.status(403).json({ error: "Private POC gateway required" });
    }
    res.setHeader("Cache-Control", "no-store");
    if (!permitted.some(([method, path]) => method === req.method && path.test(req.path))) {
      return res.status(403).json({ error: "此功能尚未接入合成資料 POC", code: "POC_FEATURE_NOT_ENABLED" });
    }
    return next();
  } catch {
    return res.status(503).json({ error: "Private POC configuration unavailable" });
  }
};
