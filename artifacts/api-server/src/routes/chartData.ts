import { Router } from "express";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  calculateActualQuantityRollup,
  calculateActualRouteCostRollup,
  calculateActualUnitProfit,
  costEntriesTable,
  db,
  emptyActualRouteCostGroup,
  ExactDecimal,
  INCLUDED_ACTUAL_ORDER_STATUSES,
  ordersTable,
  productsTable,
  resolveProductTransportCost,
  tripAreaCostsTable,
  tripAreasTable,
  tripRoutesTable,
  tripsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { positiveId } from "./fixedCosts.ts";

const router = Router();

const SENSITIVITY_SWEEP_MAX = 20;

function ownedOrAwaitingBackfill(column: any, storeId: number) {
  // Nullable rows are transitional and remain visible until the production
  // backfill has been applied and reviewed (same rule as GET /trips).
  return or(eq(column, storeId), isNull(column))!;
}

function serializeDecimal(value: any): string {
  return value.toDecimalPlaces(12);
}

function compareExactDescending(
  left: ExactDecimal,
  right: ExactDecimal,
): number {
  const leftProduct = left.numerator * right.denominator;
  const rightProduct = right.numerator * left.denominator;
  return leftProduct > rightProduct ? -1 : leftProduct < rightProduct ? 1 : 0;
}

// ---------------------------------------------------------------------------
// E · 路線單件成本排行
// Each route's unit cost is produced by the existing transport-cost pipeline
// (resolveProductTransportCost, the same chain order-profit snapshots use).
// Missing inputs fail closed with the pipeline's own pending reason.
// ---------------------------------------------------------------------------
router.get(
  "/stores/:storeId/charts/route-cost-ranking",
  requireAuth,
  async (req: any, res) => {
    const storeId = positiveId(req.params.storeId);
    if (storeId === null) {
      return res.status(400).json({ error: "Invalid store id" });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const [trips, routes, areas] = await Promise.all([
      db
        .select()
        .from(tripsTable)
        .where(ownedOrAwaitingBackfill(tripsTable.storeId, storeId)),
      db
        .select()
        .from(tripRoutesTable)
        .where(ownedOrAwaitingBackfill(tripRoutesTable.storeId, storeId)),
      db
        .select()
        .from(tripAreasTable)
        .where(ownedOrAwaitingBackfill(tripAreasTable.storeId, storeId)),
    ]);
    const areaIds = [
      ...new Set(
        routes
          .map((route) => route.tripAreaId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const areaCosts =
      areaIds.length === 0
        ? []
        : await db
            .select()
            .from(tripAreaCostsTable)
            .where(
              and(
                eq(tripAreaCostsTable.mode, "ESTIMATE"),
                inArray(tripAreaCostsTable.tripAreaId, areaIds),
              ),
            );
    const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
    const areasById = new Map(areas.map((area) => [area.id, area]));
    const areaCostByAreaId = new Map<number, (typeof areaCosts)[number]>();
    for (const cost of areaCosts) {
      if (!areaCostByAreaId.has(cost.tripAreaId)) {
        areaCostByAreaId.set(cost.tripAreaId, cost);
      }
    }

    const ranked: Array<{
      routeId: number;
      tripId: number;
      name: string;
      tripName: string | null;
      unitCostTwd: string | null;
      status: "ready" | "pending_confirmation";
      reason: string | null;
      value: ExactDecimal | null;
    }> = routes.map((route) => {
      const trip = tripsById.get(route.tripId) ?? null;
      const area =
        route.tripAreaId === null
          ? null
          : (areasById.get(route.tripAreaId) ?? null);
      const result = resolveProductTransportCost({
        product: { tripRouteId: route.id },
        route: route as any,
        trip: trip as any,
        area: area === null ? null : { id: area.id, tripId: area.tripId },
        areaCost:
          area === null ? null : (areaCostByAreaId.get(area.id) ?? null),
      });
      if (result.status === "ready") {
        return {
          routeId: route.id,
          tripId: route.tripId,
          name: route.areaTitle,
          tripName: trip?.name ?? null,
          unitCostTwd: serializeDecimal(result.finalCostPerItem),
          status: "ready" as const,
          reason: null,
          value: result.finalCostPerItem,
        };
      }
      return {
        routeId: route.id,
        tripId: route.tripId,
        name: route.areaTitle,
        tripName: trip?.name ?? null,
        unitCostTwd: null,
        status: "pending_confirmation" as const,
        reason: result.reason,
        value: null,
      };
    });

    ranked.sort((left, right) => {
      if (left.value !== null && right.value !== null) {
        return compareExactDescending(left.value, right.value);
      }
      if (left.value !== null) return -1;
      if (right.value !== null) return 1;
      return left.routeId - right.routeId;
    });

    return res.json({
      status: ranked.some((item) => item.status !== "ready")
        ? "pending_confirmation"
        : "ready",
      items: ranked.map(({ value: _value, ...item }) => item),
    });
  },
);

// ---------------------------------------------------------------------------
// F · 地區商品表現散點
// Aggregates ACTUAL order performance per trip-area name across the store's
// trips. Item quantities reuse calculateActualQuantityRollup; per-product unit
// profits reuse calculateActualUnitProfit; revenues are exact sums of order
// totals. Any incomplete area fails closed as pending_confirmation.
// ---------------------------------------------------------------------------
router.get(
  "/stores/:storeId/charts/area-scatter",
  requireAuth,
  async (req: any, res) => {
    const storeId = positiveId(req.params.storeId);
    if (storeId === null) {
      return res.status(400).json({ error: "Invalid store id" });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const [areas, routes, trips] = await Promise.all([
      db
        .select()
        .from(tripAreasTable)
        .where(ownedOrAwaitingBackfill(tripAreasTable.storeId, storeId)),
      db
        .select()
        .from(tripRoutesTable)
        .where(
          and(
            ownedOrAwaitingBackfill(tripRoutesTable.storeId, storeId),
            isNotNull(tripRoutesTable.tripAreaId),
          ),
        ),
      db
        .select()
        .from(tripsTable)
        .where(ownedOrAwaitingBackfill(tripsTable.storeId, storeId)),
    ]);
    const routeIds = routes.map((route) => route.id);
    const products =
      routeIds.length === 0
        ? []
        : await db
            .select()
            .from(productsTable)
            .where(
              and(
                eq(productsTable.storeId, storeId),
                isNotNull(productsTable.tripRouteId),
                inArray(productsTable.tripRouteId, routeIds),
              ),
            );
    const productIds = products.map((product) => product.id);
    const orders =
      productIds.length === 0
        ? []
        : await db
            .select()
            .from(ordersTable)
            .where(
              and(
                eq(ordersTable.storeId, storeId),
                inArray(ordersTable.productId, productIds),
                inArray(ordersTable.status, [
                  ...INCLUDED_ACTUAL_ORDER_STATUSES,
                ]),
              ),
            );
    const entries =
      routeIds.length === 0
        ? []
        : await db
            .select()
            .from(costEntriesTable)
            .where(
              and(
                eq(costEntriesTable.storeId, storeId),
                eq(costEntriesTable.mode, "ACTUAL"),
                isNotNull(costEntriesTable.tripRouteId),
              ),
            );

    const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
    const routesById = new Map(routes.map((route) => [route.id, route]));
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const areasById = new Map(areas.map((area) => [area.id, area]));

    // Actual cost rollup per trip (each trip has its own actual exchange rate),
    // then map route id -> cost group (reuses calculateActualRouteCostRollup).
    const entriesByTrip = new Map<number, (typeof entries)[number][]>();
    for (const entry of entries) {
      const route =
        entry.tripRouteId === null ? null : routesById.get(entry.tripRouteId);
      if (!route) continue;
      const list = entriesByTrip.get(route.tripId) ?? [];
      list.push(entry);
      entriesByTrip.set(route.tripId, list);
    }
    const costsByRoute = new Map<
      number,
      ReturnType<typeof calculateActualRouteCostRollup>["groups"][number]
    >();
    for (const [tripId, tripEntries] of entriesByTrip) {
      const trip = tripsById.get(tripId);
      const rollup = calculateActualRouteCostRollup({
        entries: tripEntries.map((entry) => ({
          tripRouteId: entry.tripRouteId,
          mode: entry.mode,
          status: entry.status,
          currency: entry.currency,
          originalAmount: String(entry.originalAmount),
        })),
        actualExchangeRate: trip?.actualExchangeRate,
      });
      for (const group of rollup.groups) {
        if (group.tripRouteId !== null)
          costsByRoute.set(group.tripRouteId, group);
      }
    }

    // Actual quantity rollup per route (reuses calculateActualQuantityRollup).
    const quantityByRoute = new Map<number, bigint>();
    const quantityRollup = calculateActualQuantityRollup(
      orders.map((order) => {
        const product = productsById.get(order.productId);
        const route =
          product === undefined
            ? null
            : routesById.get(product.tripRouteId ?? -1);
        return {
          tripRouteId: route?.id ?? null,
          status: order.status,
          quantity: String(order.quantity),
        };
      }),
    );
    for (const route of quantityRollup.routes) {
      quantityByRoute.set(route.tripRouteId, route.actualQuantity);
    }

    // Per-product order quantity (weights for the area average).
    const productQuantity = new Map<number, bigint>();
    for (const order of orders) {
      productQuantity.set(
        order.productId,
        (productQuantity.get(order.productId) ?? 0n) + BigInt(order.quantity),
      );
    }

    // Revenue per area (exact sum of included order totals).
    const revenueByArea = new Map<
      string,
      { revenue: ExactDecimal; tripIds: Set<number> }
    >();
    const addRevenue = (areaKey: string, tripId: number, total: string) => {
      const bucket = revenueByArea.get(areaKey) ?? {
        revenue: ExactDecimal.zero(),
        tripIds: new Set<number>(),
      };
      bucket.revenue = bucket.revenue.add(ExactDecimal.from(total));
      bucket.tripIds.add(tripId);
      revenueByArea.set(areaKey, bucket);
    };

    type AreaGroup = {
      areaName: string;
      routeIds: number[];
      tripIds: Set<number>;
    };
    const areaByRouteId = new Map<number, AreaGroup>();
    const areaByName = new Map<string, AreaGroup>();
    for (const order of orders) {
      const product = productsById.get(order.productId);
      const route =
        product === undefined
          ? null
          : routesById.get(product.tripRouteId ?? -1);
      if (!product || !route) continue;
      const area = areasById.get(route.tripAreaId ?? -1);
      if (!area) continue;
      addRevenue(area.name, route.tripId, String(order.totalPrice));
    }
    for (const area of areas) {
      let group = areaByName.get(area.name);
      if (!group) {
        group = { areaName: area.name, routeIds: [], tripIds: new Set() };
        areaByName.set(area.name, group);
      }
      group.tripIds.add(area.tripId);
    }
    for (const route of routes) {
      const areaId = route.tripAreaId;
      const area = areaId === null ? null : (areasById.get(areaId) ?? null);
      if (!area) continue;
      const group = areaByName.get(area.name)!;
      group.routeIds.push(route.id);
      areaByRouteId.set(route.id, group);
    }

    const items: Array<{
      areaName: string;
      tripCount: number;
      itemQuantity: string | null;
      revenueTwd: string | null;
      averageUnitProfitTwd: string | null;
      status: "ready" | "pending_confirmation";
      reason: string | null;
    }> = [];

    for (const group of areaByName.values()) {
      let pendingReason: string | null = null;
      let itemQuantity = 0n;
      for (const routeId of group.routeIds) {
        itemQuantity += quantityByRoute.get(routeId) ?? 0n;
      }
      if (itemQuantity === 0n) {
        // No included actual orders in this area: unit profit cannot be
        // computed — fail closed instead of a fake zero.
        pendingReason = "missing_actual_quantity";
      }
      let revenue = ExactDecimal.zero();
      const revenueBucket = revenueByArea.get(group.areaName);
      if (revenueBucket) {
        revenue = revenueBucket.revenue;
        for (const tripId of revenueBucket.tripIds) group.tripIds.add(tripId);
      }
      let weightedProfit = ExactDecimal.zero();
      for (const product of products) {
        const route = routesById.get(product.tripRouteId ?? -1);
        if (!route) continue;
        if (areaByRouteId.get(route.id) !== group) continue;
        const trip = tripsById.get(route.tripId);
        const costs =
          costsByRoute.get(route.id) ?? emptyActualRouteCostGroup(route.id);
        const actualQuantity = quantityByRoute.get(route.id) ?? 0n;
        const unitProfit = calculateActualUnitProfit({
          unitPriceTwd: String(product.price),
          costJpy: product.costJpy == null ? null : String(product.costJpy),
          actualExchangeRate: trip?.actualExchangeRate,
          routeActualCostTwd:
            costs.status === "ready"
              ? costs.totalTwd.toDecimalPlaces(12)
              : null,
          routeActualQuantity: String(actualQuantity),
          isTransportCostExempt: product.isTransportCostExempt,
        });
        if (unitProfit.status !== "ready") {
          if (pendingReason === null) pendingReason = unitProfit.reason;
          continue;
        }
        const productQuantityValue = productQuantity.get(product.id) ?? 0n;
        weightedProfit = weightedProfit.add(
          unitProfit.actualUnitProfitTwd.multiply(
            ExactDecimal.from(productQuantityValue),
          ),
        );
      }
      if (pendingReason !== null) {
        items.push({
          areaName: group.areaName,
          tripCount: group.tripIds.size,
          itemQuantity: null,
          revenueTwd: null,
          averageUnitProfitTwd: null,
          status: "pending_confirmation",
          reason: pendingReason,
        });
        continue;
      }
      items.push({
        areaName: group.areaName,
        tripCount: group.tripIds.size,
        itemQuantity: String(itemQuantity),
        revenueTwd: revenue.toDecimalPlaces(12),
        averageUnitProfitTwd: weightedProfit
          .divide(ExactDecimal.from(itemQuantity))
          .toDecimalPlaces(12),
        status: "ready",
        reason: null,
      });
    }
    items.sort((left, right) => left.areaName.localeCompare(right.areaName));

    return res.json({
      status: items.some((item) => item.status !== "ready")
        ? "pending_confirmation"
        : "ready",
      items,
    });
  },
);

export default router;
