import { Router } from "express";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { db, ordersTable, cvsStoresTable } from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";

const CITY_ORDER = [
  "台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣",
  "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣",
  "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

const router = Router();

/** GET /cvs/regions — return available cities and their districts */
router.get("/cvs/regions", async (req, res) => {
  const provider = typeof req.query.provider === "string" ? req.query.provider : "seven";

  try {
    const rows = await db
      .selectDistinct({ city: cvsStoresTable.city, district: cvsStoresTable.district })
      .from(cvsStoresTable)
      .where(and(eq(cvsStoresTable.provider, provider), eq(cvsStoresTable.isActive, true)))
      .orderBy(cvsStoresTable.district);

    const cityMap = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.city) continue;
      if (!cityMap.has(row.city)) cityMap.set(row.city, []);
      if (row.district) cityMap.get(row.city)!.push(row.district);
    }

    const cities = [...cityMap.entries()]
      .sort(([a], [b]) => {
        const ai = CITY_ORDER.indexOf(a);
        const bi = CITY_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b, "zh");
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([city, districts]) => ({ city, districts }));

    return res.json({ cities });
  } catch {
    return res.status(500).json({ cities: [], error: "地區查詢暫時無法使用" });
  }
});

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

/**
 * POST /cvs/711/import-from-emap — query 7-11 EmapSDK and upsert one store into cvs_stores
 *
 * Auth: requireAuth (any authenticated user).
 * DISABLED (Step 6C-0c): adopted option C from Step 6C-0b.
 * This endpoint is temporarily disabled pending:
 *   1. Confirmation that use of emap.pcsc.com.tw/EmapSDK.aspx is legally authorised.
 *   2. A product/engineering decision on access scope (storeId-scoped owner, admin role, etc.).
 * The emap fetch and cvs_stores upsert logic below is preserved for when it is re-enabled.
 * To re-enable: remove the early-return block and resolve the two items above.
 */
router.post("/cvs/711/import-from-emap", requireAuth, async (req: any, res) => {
  // DISABLED — see comment above. Return 403 without touching emap or cvs_stores.
  return res.status(403).json({
    error: "This operation is temporarily unavailable. Please contact the administrator.",
  });

  const rawQuery = req.body?.query;
  if (!rawQuery || typeof rawQuery !== "string") {
    return res.status(400).json({ error: "query 必填" });
  }
  const query = rawQuery.trim().slice(0, 50);
  if (!query) {
    return res.status(400).json({ error: "query 不可為空" });
  }

  // Call 7-11 EmapSDK
  let xmlText: string;
  try {
    const formBody = new URLSearchParams({ commandid: "SearchStore", StoreName: query });
    const resp = await fetch("https://emap.pcsc.com.tw/EmapSDK.aspx", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      return res.status(502).json({ error: "查詢 7-11 電子地圖失敗，請稍後再試" });
    }
    xmlText = await resp.text();
  } catch {
    return res.status(502).json({ error: "查詢 7-11 電子地圖失敗，請稍後再試" });
  }

  // Simple tag extractor (no external XML parser needed)
  const getTag = (xml: string, tag: string): string => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

  const geoMatch = xmlText.match(/<GeoPosition>([\s\S]*?)<\/GeoPosition>/i);
  if (!geoMatch) {
    return res.status(404).json({ error: "找不到符合的 7-11 門市" });
  }

  const geo = geoMatch?.[1] ?? "";
  const storeId = getTag(geo, "POIID");
  if (!storeId) {
    return res.status(404).json({ error: "找不到符合的 7-11 門市" });
  }

  const poiName = getTag(geo, "POIName");
  const address = getTag(geo, "Address");
  const telno = getTag(geo, "Telno");
  const opTime = getTag(geo, "OP_TIME");
  const xRaw = getTag(geo, "X");
  const yRaw = getTag(geo, "Y");

  // Append 門市 if not already present
  const storeName = poiName.endsWith("門市") ? poiName : `${poiName}門市`;

  // Coordinates: 7-11 uses integer form (multiply by 1,000,000)
  let latitude: string | null = null;
  let longitude: string | null = null;
  if (xRaw && yRaw) {
    const xNum = parseFloat(xRaw);
    const yNum = parseFloat(yRaw);
    if (!isNaN(xNum) && !isNaN(yNum) && xNum > 0 && yNum > 0) {
      longitude = (xNum / 1_000_000).toFixed(7);
      latitude = (yNum / 1_000_000).toFixed(7);
    }
  }

  const [upserted] = await db
    .insert(cvsStoresTable)
    .values({
      provider: "seven",
      storeId,
      storeName,
      storeAddress: address,
      storePhone: telno || null,
      businessHours: opTime || null,
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
      isActive: true,
      source: "emap_sdk",
      sourceUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [cvsStoresTable.provider, cvsStoresTable.storeId],
      set: {
        storeName: sql`excluded.store_name`,
        storeAddress: sql`excluded.store_address`,
        storePhone: sql`excluded.store_phone`,
        businessHours: sql`excluded.business_hours`,
        latitude: sql`excluded.latitude`,
        longitude: sql`excluded.longitude`,
        source: sql`excluded.source`,
        sourceUpdatedAt: sql`excluded.source_updated_at`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return res.json({
    store: {
      provider: upserted.provider,
      storeId: upserted.storeId,
      storeName: upserted.storeName,
      storeAddress: upserted.storeAddress,
      storePhone: upserted.storePhone ?? null,
      businessHours: upserted.businessHours ?? null,
      source: upserted.source,
    },
  });
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
