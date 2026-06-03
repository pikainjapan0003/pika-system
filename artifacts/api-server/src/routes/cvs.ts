import { Router } from "express";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { db, ordersTable, cvsStoresTable } from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";

const router = Router();

/** GET /cvs/stores — search CVS stores */
router.get("/cvs/stores", async (req, res) => {
  const provider = typeof req.query.provider === "string" ? req.query.provider : "seven";
  const rawQ = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  const district = typeof req.query.district === "string" ? req.query.district.trim() : "";
  const limit = Math.min(
    parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10) || 20,
    50
  );

  try {
    const conditions = [
      eq(cvsStoresTable.provider, provider),
      eq(cvsStoresTable.isActive, true),
    ];

    if (city) conditions.push(ilike(cvsStoresTable.city, `%${city}%`));
    if (district) conditions.push(ilike(cvsStoresTable.district, `%${district}%`));

    let rows;
    if (rawQ) {
      // search across storeId, storeName, storeAddress, city, district
      const qPattern = `%${rawQ}%`;
      rows = await db
        .select()
        .from(cvsStoresTable)
        .where(
          and(
            ...conditions,
            or(
              ilike(cvsStoresTable.storeId, qPattern),
              ilike(cvsStoresTable.storeName, qPattern),
              ilike(cvsStoresTable.storeAddress, qPattern),
              ilike(cvsStoresTable.city, qPattern),
              ilike(cvsStoresTable.district, qPattern),
            )
          )
        )
        .orderBy(sql`(${cvsStoresTable.storeId} = ${rawQ}) DESC`, cvsStoresTable.storeName)
        .limit(limit);
    } else {
      rows = await db
        .select()
        .from(cvsStoresTable)
        .where(and(...conditions))
        .orderBy(cvsStoresTable.sourceUpdatedAt, cvsStoresTable.storeName)
        .limit(limit);
    }

    return res.json({
      stores: rows.map(formatCvsStore),
    });
  } catch {
    return res.status(500).json({ stores: [], error: "門市查詢暫時無法使用" });
  }
});

function formatCvsStore(r: any) {
  return {
    provider: r.provider,
    storeId: r.storeId,
    storeName: r.storeName,
    storeAddress: r.storeAddress,
    storePhone: r.storePhone ?? null,
    city: r.city ?? null,
    district: r.district ?? null,
    businessHours: r.businessHours ?? null,
    deliveryStatus: r.deliveryStatus ?? null,
    sourceUpdatedAt: r.sourceUpdatedAt?.toISOString() ?? null,
  };
}

interface UpdateOrderCvsData {
  cvsStoreId: string;
  cvsStoreName?: string;
  cvsStoreAddress?: string;
  cvsStorePhone?: string | null;
  storeSelectedBy?: "customer" | "admin" | "system";
}

function parseUpdateOrderCvsBody(body: any): { ok: true; data: UpdateOrderCvsData } | { ok: false; error: string } {
  if (!body?.cvsStoreId || typeof body.cvsStoreId !== "string") {
    return { ok: false, error: "cvsStoreId is required" };
  }
  const validSelectedBy = ["customer", "admin", "system"];
  if (body.storeSelectedBy && !validSelectedBy.includes(body.storeSelectedBy)) {
    return { ok: false, error: "Invalid storeSelectedBy value" };
  }
  return {
    ok: true,
    data: {
      cvsStoreId: body.cvsStoreId,
      cvsStoreName: typeof body.cvsStoreName === "string" ? body.cvsStoreName : undefined,
      cvsStoreAddress: typeof body.cvsStoreAddress === "string" ? body.cvsStoreAddress : undefined,
      cvsStorePhone: body.cvsStorePhone ?? null,
      storeSelectedBy: body.storeSelectedBy ?? "admin",
    },
  };
}

/** PATCH /orders/:orderId/cvs — admin updates CVS store for an existing order */
router.patch("/orders/:orderId/cvs", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const parsed = parseUpdateOrderCvsBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  const { cvsStoreId, cvsStoreName, cvsStoreAddress, cvsStorePhone, storeSelectedBy } = parsed.data;

  const [updated] = await db
    .update(ordersTable)
    .set({
      cvsStoreId,
      cvsStoreName: cvsStoreName ?? null,
      cvsStoreAddress: cvsStoreAddress ?? null,
      cvsStorePhone: cvsStorePhone ?? null,
      storeSelectedBy: storeSelectedBy ?? "admin",
      storeSelectedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId))
    .returning();

  return res.json(formatOrderCvs(updated));
});

function formatOrderCvs(o: any) {
  return {
    id: o.id,
    cvsStoreId: o.cvsStoreId,
    cvsStoreName: o.cvsStoreName,
    cvsStoreAddress: o.cvsStoreAddress,
    cvsStorePhone: o.cvsStorePhone,
    storeSelectedBy: o.storeSelectedBy,
    storeSelectedAt: o.storeSelectedAt?.toISOString() ?? null,
  };
}

export default router;
