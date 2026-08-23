import { Router } from "express";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  calculateActualQuantityRollup,
  calculateActualRouteCostRollup,
  calculateActualUnitProfit,
  calculateBreakevenSensitivity,
  calculateFixedCostTotals,
  calculateTripProfit,
  costCategoriesTable,
  costEntriesTable,
  db,
  DEFAULT_REFERENCE_DAILY_WAGE,
  emptyActualRouteCostGroup,
  ExactDecimal,
  INCLUDED_ACTUAL_ORDER_STATUSES,
  operatingSettingsTable,
  ordersTable,
  productsTable,
  resolveProductTransportCost,
  tripAreaCostsTable,
  tripAreasTable,
  tripRoutesTable,
  tripsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { loadTrip, positiveId } from "./fixedCosts.ts";

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

// ---------------------------------------------------------------------------
// G · 敏感度熱圖
// Sweeps quantity x unit gross profit against the trip's breakeven inputs.
// The breakeven computation itself is the existing calculateBreakeven; sweep
// cell values are its exact inverse identity. Missing inputs fail closed.
// ---------------------------------------------------------------------------
function parseSweepQuantities(raw: unknown): string[] | null {
  if (typeof raw !== "string") return null;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0 || parts.length > SENSITIVITY_SWEEP_MAX) return null;
  for (const part of parts) {
    if (!/^\d{1,15}$/.test(part) || BigInt(part) <= 0n) return null;
  }
  return parts;
}

function parseSweepUnitGrossProfits(raw: unknown): string[] | null {
  if (typeof raw !== "string") return null;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0 || parts.length > SENSITIVITY_SWEEP_MAX) return null;
  for (const part of parts) {
    if (!/^\d+(?:\.\d+)?$/.test(part)) return null;
  }
  return parts;
}

router.get(
  "/stores/:storeId/trips/:tripId/charts/sensitivity-heatmap",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const quantities = parseSweepQuantities(req.query.quantities);
    const unitGrossProfits = parseSweepUnitGrossProfits(
      req.query.unitGrossProfits,
    );
    if (quantities === null || unitGrossProfits === null) {
      return res.status(400).json({
        error:
          "quantities (positive integers) and unitGrossProfits (non-negative decimals) are required, max 20 each",
      });
    }

    const rows = await db
      .select({
        entry: costEntriesTable,
        categoryKind: costCategoriesTable.kind,
      })
      .from(costEntriesTable)
      .leftJoin(
        costCategoriesTable,
        eq(costEntriesTable.categoryId, costCategoriesTable.id),
      )
      .where(
        and(
          eq(costEntriesTable.storeId, access.storeId),
          eq(costEntriesTable.tripId, access.tripId),
          eq(costEntriesTable.mode, "ESTIMATE"),
        ),
      )
      .orderBy(asc(costEntriesTable.id));
    const categoryKind = (row: any) => row.categoryKind ?? "FIXED";
    const rowsByKind = Object.fromEntries(
      (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
        kind,
        rows.filter((row) => categoryKind(row) === kind),
      ]),
    ) as Record<"FIXED" | "VARIABLE" | "PURCHASE", typeof rows>;
    const exchangeRate = access.trip.exchangeRate;
    const totalsByKind = Object.fromEntries(
      (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
        kind,
        calculateFixedCostTotals({
          entries: rowsByKind[kind].map((row) => ({
            ...row.entry,
            originalAmount: String(row.entry.originalAmount),
          })),
          exchangeRate,
        }),
      ]),
    ) as Record<
      "FIXED" | "VARIABLE" | "PURCHASE",
      ReturnType<typeof calculateFixedCostTotals>
    >;

    const pendingSection = Object.values(totalsByKind).find(
      (totals) => totals.status !== "ready",
    );
    if (pendingSection) {
      return res.json({
        status: "pending_confirmation",
        label: pendingSection.label,
        reason: pendingSection.reason,
        netCostToRecoverTwd: null,
        breakevenQuantity: null,
        salaryTargetQuantity: null,
        rows: [],
        columns: [],
        cells: [],
      });
    }
    const fixed = totalsByKind.FIXED as Extract<
      (typeof totalsByKind)["FIXED"],
      { status: "ready" }
    >;
    const variable = totalsByKind.VARIABLE as Extract<
      (typeof totalsByKind)["VARIABLE"],
      { status: "ready" }
    >;
    const [settings] = await db
      .select({ referenceDailyWage: operatingSettingsTable.referenceDailyWage })
      .from(operatingSettingsTable)
      .where(eq(operatingSettingsTable.id, 1))
      .limit(1);
    const salaryTargetTwd =
      settings !== undefined && access.trip.workingDays !== null
        ? ExactDecimal.from(
            settings.referenceDailyWage ?? DEFAULT_REFERENCE_DAILY_WAGE,
          )
            .multiply(ExactDecimal.from(String(access.trip.workingDays)))
            .toDecimalPlaces(12)
        : undefined;

    const result = calculateBreakevenSensitivity({
      fixedCostJpyOriginTwd: fixed.fixedCostJpyOriginTwd.toDecimalPlaces(12),
      fixedCostTwdDirectTwd: fixed.fixedCostTwdDirectTwd.toDecimalPlaces(12),
      variableCostBaseTotalTwd: variable.fixedCostTotalTwd.toDecimalPlaces(12),
      creditCardRebateTwd: String(access.trip.creditCardRebateTwd),
      unitGrossProfitTwd:
        access.trip.unitGrossProfitTwd == null
          ? null
          : String(access.trip.unitGrossProfitTwd),
      salaryTargetTwd,
      quantities,
      unitGrossProfits,
    });

    if (result.status !== "ready") {
      return res.json({
        status: "pending_confirmation",
        label: result.label,
        reason: result.reason,
        netCostToRecoverTwd: null,
        breakevenQuantity: null,
        salaryTargetQuantity: null,
        rows: [],
        columns: [],
        cells: [],
      });
    }
    return res.json({
      status: "ready",
      label: null,
      reason: null,
      netCostToRecoverTwd: serializeDecimal(result.netCostToRecoverTwd),
      breakevenQuantity: String(result.breakevenQuantity),
      salaryTargetQuantity: String(result.salaryTargetQuantity),
      rows: result.rows,
      columns: result.columns,
      cells: result.cells,
    });
  },
);
// ---------------------------------------------------------------------------
// H · 歷史趨勢
// Buckets the store's trips by month and sums each trip's ACTUAL unit
// projection final operating profit (the same per-trip assembly the
// operating-summary endpoint uses for ACTUAL mode, reusing calculateFixedCost
// Totals and calculateTripProfit). A month with any incomplete trip is
// reported pending_confirmation — never a partial sum.
// ---------------------------------------------------------------------------
function tripMonth(trip: any): string {
  if (trip.startDate != null && trip.startDate !== "") {
    return trip.startDate.slice(0, 7);
  }
  return trip.createdAt.toISOString().slice(0, 7);
}

router.get(
  "/stores/:storeId/charts/history-trend",
  requireAuth,
  async (req: any, res) => {
    const storeId = positiveId(req.params.storeId);
    if (storeId === null) {
      return res.status(400).json({ error: "Invalid store id" });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const [trips, rows, settings] = await Promise.all([
      db
        .select()
        .from(tripsTable)
        .where(ownedOrAwaitingBackfill(tripsTable.storeId, storeId)),
      db
        .select({
          entry: costEntriesTable,
          categoryKind: costCategoriesTable.kind,
        })
        .from(costEntriesTable)
        .leftJoin(
          costCategoriesTable,
          eq(costEntriesTable.categoryId, costCategoriesTable.id),
        )
        .where(
          and(
            eq(costEntriesTable.storeId, storeId),
            eq(costEntriesTable.mode, "ACTUAL"),
          ),
        ),
      db
        .select({
          referenceDailyWage: operatingSettingsTable.referenceDailyWage,
        })
        .from(operatingSettingsTable)
        .where(eq(operatingSettingsTable.id, 1))
        .limit(1),
    ]);
    const referenceDailyWageTwd =
      settings[0]?.referenceDailyWage ?? DEFAULT_REFERENCE_DAILY_WAGE;

    const entriesByTrip = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = entriesByTrip.get(row.entry.tripId) ?? [];
      list.push(row);
      entriesByTrip.set(row.entry.tripId, list);
    }

    const months = new Map<
      string,
      {
        tripCount: number;
        profitTwd: ExactDecimal | null;
        status: "ready" | "pending_confirmation";
        reason: string | null;
      }
    >();
    const categoryKind = (row: any) => row.categoryKind ?? "FIXED";

    for (const trip of trips) {
      const month = tripMonth(trip);
      const bucket = months.get(month) ?? {
        tripCount: 0,
        profitTwd: ExactDecimal.zero(),
        status: "ready" as const,
        reason: null,
      };
      bucket.tripCount += 1;
      const tripRows = entriesByTrip.get(trip.id) ?? [];
      const rowsByKind = Object.fromEntries(
        (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
          kind,
          tripRows.filter((row) => categoryKind(row) === kind),
        ]),
      ) as Record<"FIXED" | "VARIABLE" | "PURCHASE", typeof rows>;
      const exchangeRate = trip.actualExchangeRate;
      const totalsByKind = Object.fromEntries(
        (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
          kind,
          calculateFixedCostTotals({
            entries: rowsByKind[kind].map((row) => ({
              ...row.entry,
              originalAmount: String(row.entry.originalAmount),
            })),
            exchangeRate,
          }),
        ]),
      ) as Record<
        "FIXED" | "VARIABLE" | "PURCHASE",
        ReturnType<typeof calculateFixedCostTotals>
      >;
      const pendingSection = Object.values(totalsByKind).find(
        (totals) => totals.status !== "ready",
      );
      let tripProfit:
        | Extract<ReturnType<typeof calculateTripProfit>, { status: "ready" }>
        | { status: "pending_confirmation"; label: string; reason: string };
      if (pendingSection) {
        tripProfit = pendingSection;
      } else {
        const fixed = totalsByKind.FIXED as Extract<
          (typeof totalsByKind)["FIXED"],
          { status: "ready" }
        >;
        const variable = totalsByKind.VARIABLE as Extract<
          (typeof totalsByKind)["VARIABLE"],
          { status: "ready" }
        >;
        const purchase = totalsByKind.PURCHASE as Extract<
          (typeof totalsByKind)["PURCHASE"],
          { status: "ready" }
        >;
        tripProfit = calculateTripProfit({
          fixedCostJpyOriginTwd:
            fixed.fixedCostJpyOriginTwd.toDecimalPlaces(12),
          fixedCostTwdDirectTwd:
            fixed.fixedCostTwdDirectTwd.toDecimalPlaces(12),
          variableCostJpyOriginTwd:
            variable.fixedCostJpyOriginTwd.toDecimalPlaces(12),
          variableCostTwdDirectTwd:
            variable.fixedCostTwdDirectTwd.toDecimalPlaces(12),
          purchaseCostJpyOriginTwd:
            purchase.fixedCostJpyOriginTwd.toDecimalPlaces(12),
          purchaseCostTwdDirectTwd:
            purchase.fixedCostTwdDirectTwd.toDecimalPlaces(12),
          unitGrossProfitTwd:
            trip.unitGrossProfitTwd == null
              ? null
              : String(trip.unitGrossProfitTwd),
          dailyGrossProfitTwd:
            trip.dailyGrossProfitTwd == null
              ? null
              : String(trip.dailyGrossProfitTwd),
          estimatedItemQuantity: trip.totalItemQuantity,
          creditCardRebateTwd: String(trip.creditCardRebateTwd),
          workingDays: trip.workingDays,
          referenceDailyWageTwd,
        } as Parameters<typeof calculateTripProfit>[0]);
      }
      if (tripProfit.status !== "ready") {
        bucket.status = "pending_confirmation";
        bucket.reason = bucket.reason ?? tripProfit.reason;
        bucket.profitTwd = null;
      } else if (tripProfit.projections.unit.status !== "ready") {
        bucket.status = "pending_confirmation";
        bucket.reason = bucket.reason ?? tripProfit.projections.unit.reason;
        bucket.profitTwd = null;
      } else if (bucket.status === "ready") {
        bucket.profitTwd =
          bucket.profitTwd === null
            ? null
            : bucket.profitTwd.add(
                tripProfit.projections.unit.finalOperatingProfitTwd,
              );
      }
      months.set(month, bucket);
    }

    const items = [...months.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([month, bucket]) => ({
        month,
        tripCount: bucket.tripCount,
        profitTwd:
          bucket.profitTwd === null
            ? null
            : bucket.profitTwd.toDecimalPlaces(12),
        status: bucket.status,
        reason: bucket.reason,
      }));

    return res.json({
      status: items.some((item) => item.status !== "ready")
        ? "pending_confirmation"
        : "ready",
      mode: "ACTUAL",
      items,
    });
  },
);

export default router;
