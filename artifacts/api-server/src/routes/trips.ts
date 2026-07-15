import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, tripsTable, tripRoutesTable } from "@workspace/db";
import { CreateTripBody, UpdateTripBody, CreateTripRouteBody, UpdateTripRouteBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// NOTE: trips/trip_routes have no store or merchant ownership column in the
// current schema (lib/db/src/schema/trips.ts) — any authenticated merchant
// can see and manage all trips. Scoping this to a single store/merchant would
// require a schema change, which is out of scope here.

router.get("/trips", requireAuth, async (_req: any, res) => {
  const trips = await db.select().from(tripsTable);
  const routes = await db.select().from(tripRoutesTable);
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
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const [trip] = await db
    .insert(tripsTable)
    .values({
      name: parsed.data.name,
      exchangeRate: parsed.data.exchangeRate != null ? String(parsed.data.exchangeRate) : null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  return res.status(201).json(formatTrip(trip));
});

router.patch("/trips/:tripId", requireAuth, async (req: any, res) => {
  const tripId = parseInt(req.params.tripId);
  if (isNaN(tripId)) return res.status(400).json({ error: "Invalid tripId" });

  const parsed = UpdateTripBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.exchangeRate !== undefined) {
    updateData.exchangeRate = parsed.data.exchangeRate != null ? String(parsed.data.exchangeRate) : null;
  }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [updated] = await db
    .update(tripsTable)
    .set(updateData)
    .where(eq(tripsTable.id, tripId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Trip not found" });
  return res.json(formatTrip(updated));
});

router.post("/trips/:tripId/routes", requireAuth, async (req: any, res) => {
  const tripId = parseInt(req.params.tripId);
  if (isNaN(tripId)) return res.status(400).json({ error: "Invalid tripId" });

  const parsed = CreateTripRouteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  try {
    const [route] = await db
      .insert(tripRoutesTable)
      .values({
        tripId,
        areaTitle: parsed.data.areaTitle,
        startPlace: parsed.data.startPlace,
        endPlace: parsed.data.endPlace,
        estQty: parsed.data.estQty,
        trainJpy: parsed.data.trainJpy != null ? String(parsed.data.trainJpy) : undefined,
        fuelJpy: parsed.data.fuelJpy != null ? String(parsed.data.fuelJpy) : undefined,
        parkingJpy: parsed.data.parkingJpy != null ? String(parsed.data.parkingJpy) : undefined,
        cardboardJpy: parsed.data.cardboardJpy != null ? String(parsed.data.cardboardJpy) : undefined,
        shippingJpy: parsed.data.shippingJpy != null ? String(parsed.data.shippingJpy) : undefined,
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

router.patch("/trips/:tripId/routes/:routeId", requireAuth, async (req: any, res) => {
  const tripId = parseInt(req.params.tripId);
  const routeId = parseInt(req.params.routeId);
  if (isNaN(tripId) || isNaN(routeId)) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateTripRouteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.areaTitle !== undefined) updateData.areaTitle = parsed.data.areaTitle;
  if (parsed.data.startPlace !== undefined) updateData.startPlace = parsed.data.startPlace;
  if (parsed.data.endPlace !== undefined) updateData.endPlace = parsed.data.endPlace;
  if (parsed.data.estQty !== undefined) updateData.estQty = parsed.data.estQty;
  if (parsed.data.trainJpy !== undefined) updateData.trainJpy = String(parsed.data.trainJpy);
  if (parsed.data.fuelJpy !== undefined) updateData.fuelJpy = String(parsed.data.fuelJpy);
  if (parsed.data.parkingJpy !== undefined) updateData.parkingJpy = String(parsed.data.parkingJpy);
  if (parsed.data.cardboardJpy !== undefined) updateData.cardboardJpy = String(parsed.data.cardboardJpy);
  if (parsed.data.shippingJpy !== undefined) updateData.shippingJpy = String(parsed.data.shippingJpy);
  if (parsed.data.parcelCount !== undefined) updateData.parcelCount = parsed.data.parcelCount;

  try {
    const [updated] = await db
      .update(tripRoutesTable)
      .set(updateData)
      .where(eq(tripRoutesTable.id, routeId))
      .returning();

    if (!updated || updated.tripId !== tripId) return res.status(404).json({ error: "Route not found" });
    return res.json(formatTripRoute(updated));
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "此行程已有相同名稱的路線" });
    }
    throw err;
  }
});

function formatTrip(t: any) {
  return {
    ...t,
    exchangeRate: t.exchangeRate != null ? parseFloat(t.exchangeRate) : null,
  };
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
    estQty: r.estQty,
    cardboardJpy: parseFloat(r.cardboardJpy),
    shippingJpy: parseFloat(r.shippingJpy),
    parcelCount: r.parcelCount,
    createdAt: r.createdAt,
  };
}

export default router;
