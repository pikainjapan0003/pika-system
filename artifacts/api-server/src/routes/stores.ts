import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { CreateStoreBody, UpdateStoreBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/me/store", requireAuth, async (req: any, res) => {
  try {
    const store = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.merchantId, req.userId))
      .limit(1);

    if (store.length === 0) {
      return res.status(404).json({ error: "No store found" });
    }
    return res.json(store[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get store");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/stores", requireAuth, async (req: any, res) => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const existing = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.merchantId, req.userId))
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({ error: "Store already exists" });
  }

  try {
    const [store] = await db
      .insert(storesTable)
      .values({ ...parsed.data, merchantId: req.userId })
      .returning();
    return res.status(201).json(store);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Slug already taken" });
    }
    req.log.error({ err }, "Failed to create store");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/stores/:storeId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const store = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);

  if (store.length === 0) return res.status(404).json({ error: "Store not found" });
  if (store[0].merchantId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  const [updated] = await db
    .update(storesTable)
    .set(parsed.data)
    .where(eq(storesTable.id, storeId))
    .returning();
  return res.json(updated);
});

router.get("/stores/:storeId/stats", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  const store = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (store.length === 0) return res.status(404).json({ error: "Store not found" });
  if (store[0].merchantId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.storeId, storeId));

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const totalRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + parseFloat(o.totalPrice as string), 0);

  const statusMap: Record<string, number> = {};
  for (const o of orders) {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1;
  }
  const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  return res.json({ totalOrders, pendingOrders, totalRevenue, statusBreakdown });
});

export default router;
