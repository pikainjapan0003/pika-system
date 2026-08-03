import { Router } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, storesTable, tripsTable, tripRoutesTable } from "@workspace/db";
import {
  CreateTripBody,
  UpdateTripBody,
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

router.post("/trips/:tripId/routes", requireAuth, async (req: any, res) => {
  const storeId = await resolveOwnedStoreId(req, res);
  if (storeId === null) return;

  const tripId = parseInt(req.params.tripId);
  if (isNaN(tripId)) return res.status(400).json({ error: "Invalid tripId" });

  const parsed = CreateTripRouteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
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

  try {
    const [route] = await db
      .insert(tripRoutesTable)
      .values({
        storeId,
        tripId,
        areaTitle: parsed.data.areaTitle,
        startPlace: parsed.data.startPlace,
        endPlace: parsed.data.endPlace,
        estQty: parsed.data.estQty,
        trainJpy:
          parsed.data.trainJpy != null
            ? String(parsed.data.trainJpy)
            : undefined,
        fuelJpy:
          parsed.data.fuelJpy != null ? String(parsed.data.fuelJpy) : undefined,
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
    if (parsed.data.fuelJpy !== undefined)
      updateData.fuelJpy = String(parsed.data.fuelJpy);
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
    areaTitle: r.areaTitle,
    startPlace: r.startPlace,
    endPlace: r.endPlace,
    trainJpy: parseFloat(r.trainJpy),
    fuelJpy: parseFloat(r.fuelJpy),
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
