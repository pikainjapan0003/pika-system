import { db, storesTable, tripRoutesTable, tripsTable } from "@workspace/db";
import type { CalculateProductUnitProfitInput } from "@workspace/db";
import { eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";

type SnapshotQueryExecutor = Pick<typeof db, "select">;

export interface SnapshotProduct {
  storeId: number;
  costJpy: string | null;
  isTransportCostExempt: boolean;
  tripRouteId: number | null;
}

export interface BatchSnapshotProduct extends SnapshotProduct {
  id: number;
  unitPriceTwd: string;
}

type SnapshotRoute = typeof tripRoutesTable.$inferSelect;
type SnapshotTrip = typeof tripsTable.$inferSelect;

export function assembleOrderProfitSnapshotInputs(
  products: readonly BatchSnapshotProduct[],
  storePurchaseExchangeRate: string | null,
  routes: readonly SnapshotRoute[],
  trips: readonly SnapshotTrip[],
): Map<number, CalculateProductUnitProfitInput> {
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  return new Map(
    products.map((product) => {
      const route =
        !product.isTransportCostExempt && product.tripRouteId !== null
          ? (routesById.get(product.tripRouteId) ?? null)
          : null;
      const trip = route ? (tripsById.get(route.tripId) ?? null) : null;
      return [
        product.id,
        {
          unitPriceTwd: product.unitPriceTwd,
          costJpy: product.costJpy,
          storePurchaseExchangeRate,
          isTransportCostExempt: product.isTransportCostExempt,
          transport: {
            product: { tripRouteId: product.tripRouteId },
            route,
            trip,
          },
        },
      ];
    }),
  );
}

/**
 * Product-list loader: one store query, one route IN query, and one trip IN
 * query. It assembles the same calculateProductUnitProfit input shape as the
 * single-product loader without caching any calculated money.
 */
export async function loadOrderProfitSnapshotInputs(
  executor: SnapshotQueryExecutor,
  products: readonly BatchSnapshotProduct[],
): Promise<Map<number, CalculateProductUnitProfitInput>> {
  if (products.length === 0) return new Map();
  const storeIds = new Set(products.map((product) => product.storeId));
  if (storeIds.size !== 1) {
    throw new TypeError("Batch snapshot products must belong to one store");
  }
  const storeId = products[0].storeId;
  const [store] = await executor
    .select({ purchaseExchangeRate: storesTable.purchaseExchangeRate })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);

  const routeIds = [
    ...new Set(
      products
        .filter((product) => !product.isTransportCostExempt)
        .map((product) => product.tripRouteId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const routes =
    routeIds.length > 0
      ? await executor
          .select()
          .from(tripRoutesTable)
          .where(inArray(tripRoutesTable.id, routeIds))
      : [];
  const tripIds = [...new Set(routes.map((route) => route.tripId))];
  const trips =
    tripIds.length > 0
      ? await executor
          .select()
          .from(tripsTable)
          .where(inArray(tripsTable.id, tripIds))
      : [];

  return assembleOrderProfitSnapshotInputs(
    products,
    store?.purchaseExchangeRate ?? null,
    routes,
    trips,
  );
}

export async function loadOrderProfitSnapshotInput(
  executor: SnapshotQueryExecutor,
  product: SnapshotProduct,
  unitPriceTwd: string,
): Promise<CalculateProductUnitProfitInput> {
  const id = 1;
  const inputs = await loadOrderProfitSnapshotInputs(executor, [
    { ...product, id, unitPriceTwd },
  ]);
  return inputs.get(id)!;
}
