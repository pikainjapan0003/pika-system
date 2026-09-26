import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";
import { privatePocConfig, isPocStore } from "../lib/privatePoc.ts";

export const requireAuth = async (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const config = privatePocConfig();
  const userId = config ? auth?.userId : auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (config && userId !== config.ownerId) {
    return res.status(403).json({ error: "Only the designated owner may manage this POC" });
  }
  req.userId = userId;
  if (config && !(await verifyStoreOwner(req, res, config.storeId))) return;
  next();
};

// Returns true if req.userId owns storeId; otherwise sends 404/403 and returns false.
export const verifyStoreOwner = async (
  req: any,
  res: any,
  storeId: number,
): Promise<boolean> => {
  if (!isPocStore(storeId)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  const store = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  if (store.length === 0) {
    res.status(404).json({ error: "Store not found" });
    return false;
  }
  if (store[0].merchantId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
};
