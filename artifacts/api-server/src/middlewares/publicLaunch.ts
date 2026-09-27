import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { privatePocConfig } from "../lib/privatePoc.ts";
import { verifyStoreOwner } from "./auth.ts";

// Publishing the brand entrance does not publish synthetic engineering records.
// Keep these existing customer paths for the later approved real-data launch;
// for now only the designated owner can exercise their test records.
const syntheticCustomerPath = /^\/api\/(?:poc(?:\/|$)|p\/|cart\/orders$|orders\/track\/|cvs\/(?:regions|stores)$)/;

export const publicLaunchBoundary: RequestHandler = async (req, res, next) => {
  if (process.env.PIKA_PUBLIC_SHOP !== "true" || !syntheticCustomerPath.test(req.path)) return next();
  const config = privatePocConfig();
  if (!config) return res.status(503).json({ error: "Store configuration unavailable" });
  if (getAuth(req).userId !== config.ownerId) {
    return res.status(404).json({ error: "目前沒有可公開的商品或訂單" });
  }
  (req as typeof req & { userId: string }).userId = config.ownerId;
  if (!(await verifyStoreOwner(req, res, config.storeId))) return;
  next();
};
