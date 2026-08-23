import { Router } from "express";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  storesTable,
  tripAreaCostsTable,
  tripAreasTable,
  tripsTable,
  tripRoutesTable,
} from "@workspace/db";
import {
  CreateTripBody,
  CreateTripAreaBody,
  UpdateTripBody,
  UpdateTripAreaBody,
  CreateTripRouteBody,
  UpdateTripRouteBody,
} from "@workspace/api-zod";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";

const router = Router();

router.get("/trips", requireAuth, async (req: any, res) => {
  const storeId = await resolveOwnedStoreId(req, res);
  if (storeId === null) return;

  const trips = await db
    .select()
    .from(tripsTable)
    .where(ownedOrAwaitingBackfill(tripsTable.storeId, storeId));
  const routes = await db
    .select()
    .from(tripRoutesTable)
    .where(ownedOrAwaitingBackfill(tripRoutesTable.storeId, storeId));
  const routesByTrip = new Map<number, typeof routes>();
  for (const route of routes) {
    const list = routesByTrip.get(route.tripId) ?? [];
    list.push(route);
    routesByTrip.set(route.tripId, list);
  }
  return res.json(
    trips.map((t) => ({
      ...formatTrip(t),
      routes: (routesByTrip.get(t.id) ?? []).map(formatTripRoute),
    })),
  );
});

// Dashboard KPI board（useTripProfitBoard）以「前端實際行為」固定抓取此網址；
// 上一批審計發現後端與 openapi 皆缺此端點 → KPI 板永遠「尚無行程」。
// 與 GET /trips?storeId= 同形（含 routes），並以商店主權驗證。
router.get("/stores/:storeId/trips", requireAuth, async (req: any, res) => {
  const storeId = positiveId(req.params.storeId);
  if (storeId === null) {
    return res.status(400).json({ error: "Invalid store id" });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const trips = await db
    .select()
    .from(tripsTable)
    .where(ownedOrAwaitingBackfill(tripsTable.storeId, storeId));
  const routes = await db
    .select()
    .from(tripRoutesTable)
    .where(ownedOrAwaitingBackfill(tripRoutesTable.storeId, storeId));
  const routesByTrip = new Map<number, typeof routes>();
  for (const route of routes) {
    const list = routesByTrip.get(route.tripId) ?? [];
    list.push(route);
    routesByTrip.set(route.tripId, list);
  }
  return res.json(
    trips.map((t) => ({
      ...formatTrip(t),
      routes: (routesByTrip.get(t.id) ?? []).map(formatTripRoute),
    })),
  );
});

router.post("/trips", requireAuth, async (req: any, res) => {
  const storeId = await resolveOwnedStoreId(req, res);
  if (storeId === null) return;

  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const [trip] = await db
    .insert(tripsTable)
    .values({
      storeId,
      name: parsed.data.name,
      exchangeRate:
        parsed.data.exchangeRate != null
          ? String(parsed.data.exchangeRate)
          : null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  return res.status(201).json(formatTrip(trip));
});

router.patch("/trips/:tripId", requireAuth, async (req: any, res) => {
  const storeId = await resolveOwnedStoreId(req, res);
  if (storeId === null) return;

  const tripId = parseInt(req.params.tripId);
  if (isNaN(tripId)) return res.status(400).json({ error: "Invalid tripId" });

  const parsed = UpdateTripBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.exchangeRate !== undefined) {
    updateData.exchangeRate =
      parsed.data.exchangeRate != null
        ? String(parsed.data.exchangeRate)
        : null;
  }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [existing] = await db
    .select({ storeId: tripsTable.storeId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Trip not found" });
  if (existing.storeId !== null && existing.storeId !== storeId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const [updated] = await db
    .update(tripsTable)
    .set({ ...updateData, storeId })
    .where(
      and(
        eq(tripsTable.id, tripId),
        ownedOrAwaitingBackfill(tripsTable.storeId, storeId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Trip not found" });
  return res.json(formatTrip(updated));
});

router.get(
  "/stores/:storeId/trips/:tripId/areas",
  requireAuth,
  async (req: any, res) => {
    const access = await loadStoreScopedTrip(req, res);
    if (!access) return;

    const areas = await db
      .select()
      .from(tripAreasTable)
      .where(
        and(
          eq(tripAreasTable.tripId, access.tripId),
          ownedOrAwaitingBackfill(tripAreasTable.storeId, access.storeId),
        ),
      )
      .orderBy(asc(tripAreasTable.id));
    const areaIds = areas.map((area) => area.id);
    const costs =
      areaIds.length === 0
        ? []
        : await db
            .select()
            .from(tripAreaCostsTable)
            .where(inArray(tripAreaCostsTable.tripAreaId, areaIds))
            .orderBy(asc(tripAreaCostsTable.id));
    const costsByArea = new Map<number, typeof costs>();
    for (const cost of costs) {
      const list = costsByArea.get(cost.tripAreaId) ?? [];
      list.push(cost);
      costsByArea.set(cost.tripAreaId, list);
    }

    return res.json(
      areas.map((area) => formatTripArea(area, costsByArea.get(area.id) ?? [])),
    );
  },
);

router.post(
  "/stores/:storeId/trips/:tripId/areas",
  requireAuth,
  async (req: any, res) => {
    const access = await loadStoreScopedTrip(req, res);
    if (!access) return;
    const parsed = CreateTripAreaBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    if (!hasSafeTripAreaCostIntegers(parsed.data)) {
      return res.status(400).json({
        error: "parcelCount and estimatedItemQuantity must be safe integers",
      });
    }
    const areaName = parsed.data.name.trim();
    if (areaName === "") {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [area] = await tx
          .insert(tripAreasTable)
          .values({
            storeId: access.storeId,
            tripId: access.tripId,
            name: areaName,
          })
          .returning();
        const [cost] = await tx
          .insert(tripAreaCostsTable)
          .values({
            tripAreaId: area.id,
            ...tripAreaCostValues(parsed.data),
          })
          .returning();
        return { area, cost };
      });
      return res.status(201).json(formatTripArea(result.area, [result.cost]));
    } catch (error: any) {
      if ((error?.cause?.code ?? error?.code) === "23505") {
        return res.status(409).json({ error: "Trip area name already exists" });
      }
      throw error;
    }
  },
);

router.patch(
  "/stores/:storeId/trips/:tripId/areas/:areaId",
  requireAuth,
  async (req: any, res) => {
    const access = await loadStoreScopedTrip(req, res);
    if (!access) return;
    const areaId = positiveId(req.params.areaId);
    if (areaId === null) {
      return res.status(400).json({ error: "Invalid area id" });
    }
    const parsed = UpdateTripAreaBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    if (!hasSafeTripAreaCostIntegers(parsed.data)) {
      return res.status(400).json({
        error: "parcelCount and estimatedItemQuantity must be safe integers",
      });
    }
    const areaName = parsed.data.name?.trim();
    if (areaName === "") {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }

    const [existing] = await db
      .select()
      .from(tripAreasTable)
      .where(
        and(
          eq(tripAreasTable.id, areaId),
          eq(tripAreasTable.tripId, access.tripId),
          ownedOrAwaitingBackfill(tripAreasTable.storeId, access.storeId),
        ),
      )
      .limit(1);
    if (!existing)
      return res.status(404).json({ error: "Trip area not found" });

    try {
      const result = await db.transaction(async (tx) => {
        const [area] = await tx
          .update(tripAreasTable)
          .set({
            storeId: access.storeId,
            ...(areaName === undefined ? {} : { name: areaName }),
          })
          .where(eq(tripAreasTable.id, areaId))
          .returning();
        await tx
          .insert(tripAreaCostsTable)
          .values({ tripAreaId: areaId, ...tripAreaCostValues(parsed.data) })
          .onConflictDoUpdate({
            target: [tripAreaCostsTable.tripAreaId, tripAreaCostsTable.mode],
            set: { ...tripAreaCostValues(parsed.data), updatedAt: new Date() },
          })
          .returning();
        const costs = await tx
          .select()
          .from(tripAreaCostsTable)
          .where(eq(tripAreaCostsTable.tripAreaId, areaId))
          .orderBy(asc(tripAreaCostsTable.id));
        return { area, costs };
      });
      return res.json(formatTripArea(result.area, result.costs));
    } catch (error: any) {
      if ((error?.cause?.code ?? error?.code) === "23505") {
        return res.status(409).json({ error: "Trip area name already exists" });
      }
      throw error;
    }
  },
);

router.delete(
  "/stores/:storeId/trips/:tripId/areas/:areaId",
  requireAuth,
  async (req: any, res) => {
    const access = await loadStoreScopedTrip(req, res);
    if (!access) return;
    const areaId = positiveId(req.params.areaId);
    if (areaId === null) {
      return res.status(400).json({ error: "Invalid area id" });
    }
    const deleted = await db
      .delete(tripAreasTable)
      .where(
        and(
          eq(tripAreasTable.id, areaId),
          eq(tripAreasTable.tripId, access.tripId),
          ownedOrAwaitingBackfill(tripAreasTable.storeId, access.storeId),
        ),
      )
      .returning({ id: tripAreasTable.id });
    if (deleted.length === 0) {
      return res.status(404).json({ error: "Trip area not found" });
    }
    return res.status(204).send();
  },
);

router.post("/trips/:tripId/routes", requireAuth, async (req: any, res) => {
  const storeId = await resolveOwnedStoreId(req, res);
  if (storeId === null) return;

  const tripId = parseInt(req.params.tripId);
  if (isNaN(tripId)) return res.status(400).json({ error: "Invalid tripId" });

  const parsed = CreateTripRouteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const tripAreaId = parsed.data.tripAreaId ?? null;
  if (tripAreaId !== null && !Number.isSafeInteger(tripAreaId)) {
    return res.status(400).json({ error: "tripAreaId must be a safe integer" });
  }

  const [trip] = await db
    .select({ id: tripsTable.id, storeId: tripsTable.storeId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId))
    .limit(1);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  if (trip.storeId !== null && trip.storeId !== storeId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (
    tripAreaId !== null &&
    !(await tripAreaBelongsToTrip(tripAreaId, tripId, storeId))
  ) {
    return res.status(400).json({ error: "Invalid tripAreaId" });
  }

  try {
    const [route] = await db
      .insert(tripRoutesTable)
      .values({
        storeId,
        tripId,
        tripAreaId,
        areaTitle: parsed.data.areaTitle,
        startPlace: parsed.data.startPlace,
        endPlace: parsed.data.endPlace,
        estQty: parsed.data.estQty,
        trainJpy:
          parsed.data.trainJpy != null
            ? String(parsed.data.trainJpy)
            : undefined,
        fuelJpy:
          parsed.data.fuelJpy == null ? null : String(parsed.data.fuelJpy),
        parkingJpy:
          parsed.data.parkingJpy != null
            ? String(parsed.data.parkingJpy)
            : undefined,
        etcJpy: String(parsed.data.etcJpy),
        cardboardJpy:
          parsed.data.cardboardJpy != null
            ? String(parsed.data.cardboardJpy)
            : undefined,
        shippingJpy:
          parsed.data.shippingJpy != null
            ? String(parsed.data.shippingJpy)
            : undefined,
        parcelCount: parsed.data.parcelCount ?? undefined,
      })
      .returning();
    return res.status(201).json(formatTripRoute(route));
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "此行程已有相同名稱的路線" });
    }
    throw err;
  }
});

router.patch(
  "/trips/:tripId/routes/:routeId",
  requireAuth,
  async (req: any, res) => {
    const storeId = await resolveOwnedStoreId(req, res);
    if (storeId === null) return;

    const tripId = parseInt(req.params.tripId);
    const routeId = parseInt(req.params.routeId);
    if (isNaN(tripId) || isNaN(routeId))
      return res.status(400).json({ error: "Invalid id" });

    const parsed = UpdateTripRouteBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    if (
      parsed.data.tripAreaId !== undefined &&
      parsed.data.tripAreaId !== null &&
      !Number.isSafeInteger(parsed.data.tripAreaId)
    ) {
      return res
        .status(400)
        .json({ error: "tripAreaId must be a safe integer" });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.areaTitle !== undefined)
      updateData.areaTitle = parsed.data.areaTitle;
    if (parsed.data.startPlace !== undefined)
      updateData.startPlace = parsed.data.startPlace;
    if (parsed.data.endPlace !== undefined)
      updateData.endPlace = parsed.data.endPlace;
    if (parsed.data.estQty !== undefined)
      updateData.estQty = parsed.data.estQty;
    if (parsed.data.trainJpy !== undefined)
      updateData.trainJpy = String(parsed.data.trainJpy);
    if (parsed.data.fuelJpy !== undefined) {
      updateData.fuelJpy =
        parsed.data.fuelJpy == null ? null : String(parsed.data.fuelJpy);
    }
    if (parsed.data.parkingJpy !== undefined)
      updateData.parkingJpy = String(parsed.data.parkingJpy);
    if (parsed.data.etcJpy !== undefined) {
      updateData.etcJpy =
        parsed.data.etcJpy == null ? null : String(parsed.data.etcJpy);
    }
    if (parsed.data.cardboardJpy !== undefined)
      updateData.cardboardJpy = String(parsed.data.cardboardJpy);
    if (parsed.data.shippingJpy !== undefined)
      updateData.shippingJpy = String(parsed.data.shippingJpy);
    if (parsed.data.parcelCount !== undefined)
      updateData.parcelCount = parsed.data.parcelCount;
    if (parsed.data.tripAreaId !== undefined)
      updateData.tripAreaId = parsed.data.tripAreaId;

    const [existing] = await db
      .select({
        tripId: tripRoutesTable.tripId,
        storeId: tripRoutesTable.storeId,
      })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeId))
      .limit(1);
    if (!existing || existing.tripId !== tripId) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (existing.storeId !== null && existing.storeId !== storeId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (
      parsed.data.tripAreaId !== undefined &&
      parsed.data.tripAreaId !== null &&
      !(await tripAreaBelongsToTrip(parsed.data.tripAreaId, tripId, storeId))
    ) {
      return res.status(400).json({ error: "Invalid tripAreaId" });
    }

    try {
      const [updated] = await db
        .update(tripRoutesTable)
        .set({ ...updateData, storeId })
        .where(
          and(
            eq(tripRoutesTable.id, routeId),
            eq(tripRoutesTable.tripId, tripId),
            ownedOrAwaitingBackfill(tripRoutesTable.storeId, storeId),
          ),
        )
        .returning();

      if (!updated) return res.status(404).json({ error: "Route not found" });
      return res.json(formatTripRoute(updated));
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ error: "此行程已有相同名稱的路線" });
      }
      throw err;
    }
  },
);

function positiveId(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function tripAreaCostValues(input: {
  mode: "ESTIMATE" | "ACTUAL";
  cardboardUnitJpy: number;
  shippingUnitJpy: number;
  parcelCount: number;
  estimatedItemQuantity: number | null;
}) {
  return {
    mode: input.mode,
    cardboardUnitJpy: String(input.cardboardUnitJpy),
    shippingUnitJpy: String(input.shippingUnitJpy),
    parcelCount: input.parcelCount,
    estimatedItemQuantity: input.estimatedItemQuantity,
  };
}

function hasSafeTripAreaCostIntegers(input: {
  parcelCount: number;
  estimatedItemQuantity: number | null;
}) {
  return (
    Number.isSafeInteger(input.parcelCount) &&
    (input.estimatedItemQuantity === null ||
      Number.isSafeInteger(input.estimatedItemQuantity))
  );
}

async function loadStoreScopedTrip(req: any, res: any) {
  const storeId = positiveId(req.params.storeId);
  const tripId = positiveId(req.params.tripId);
  if (storeId === null || tripId === null) {
    res.status(400).json({ error: "Invalid store or trip id" });
    return null;
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return null;
  const [trip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.storeId, storeId)))
    .limit(1);
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return null;
  }
  return { storeId, tripId };
}

async function tripAreaBelongsToTrip(
  tripAreaId: number,
  tripId: number,
  storeId: number,
) {
  const [area] = await db
    .select({ id: tripAreasTable.id })
    .from(tripAreasTable)
    .where(
      and(
        eq(tripAreasTable.id, tripAreaId),
        eq(tripAreasTable.tripId, tripId),
        ownedOrAwaitingBackfill(tripAreasTable.storeId, storeId),
      ),
    )
    .limit(1);
  return area !== undefined;
}

function formatTrip(t: any) {
  return {
    id: t.id,
    name: t.name,
    exchangeRate: t.exchangeRate != null ? parseFloat(t.exchangeRate) : null,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function formatTripArea(area: any, costs: any[]) {
  return {
    id: area.id,
    tripId: area.tripId,
    name: area.name,
    costs: costs.map((cost) => ({
      id: cost.id,
      tripAreaId: cost.tripAreaId,
      mode: cost.mode,
      cardboardUnitJpy: parseFloat(cost.cardboardUnitJpy),
      shippingUnitJpy: parseFloat(cost.shippingUnitJpy),
      parcelCount: cost.parcelCount,
      estimatedItemQuantity: cost.estimatedItemQuantity,
      createdAt: cost.createdAt,
      updatedAt: cost.updatedAt,
    })),
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
  };
}

function ownedOrAwaitingBackfill(column: any, storeId: number) {
  // Nullable rows are transitional and remain visible until the production
  // backfill has been applied and reviewed.
  return or(eq(column, storeId), isNull(column))!;
}

async function resolveOwnedStoreId(req: any, res: any): Promise<number | null> {
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.merchantId, req.userId))
    .limit(1);
  if (!store) {
    res.status(404).json({ error: "No store found" });
    return null;
  }
  if (!(await verifyStoreOwner(req, res, store.id))) return null;
  return store.id;
}

function formatTripRoute(r: any) {
  return {
    id: r.id,
    tripId: r.tripId,
    tripAreaId: r.tripAreaId,
    areaTitle: r.areaTitle,
    startPlace: r.startPlace,
    endPlace: r.endPlace,
    trainJpy: parseFloat(r.trainJpy),
    fuelJpy: r.fuelJpy != null ? parseFloat(r.fuelJpy) : null,
    parkingJpy: parseFloat(r.parkingJpy),
    etcJpy: r.etcJpy != null ? parseFloat(r.etcJpy) : null,
    estQty: r.estQty,
    cardboardJpy: parseFloat(r.cardboardJpy),
    shippingJpy: parseFloat(r.shippingJpy),
    parcelCount: r.parcelCount,
    createdAt: r.createdAt,
  };
}

export default router;
