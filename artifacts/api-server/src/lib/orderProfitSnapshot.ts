import {
  db,
  storesTable,
  tripRoutesTable,
  tripsTable,
} from "@workspace/db";
import type {
  CalculateProductUnitProfitInput,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type SnapshotQueryExecutor = Pick<typeof db, "select">;

interface SnapshotProduct {
  storeId: number;
  costJpy: string | null;
  isTransportCostExempt: boolean;
  tripRouteId: number | null;
}

export async function loadOrderProfitSnapshotInput(
  executor: SnapshotQueryExecutor,
  product: SnapshotProduct,
  unitPriceTwd: string,
): Promise<CalculateProductUnitProfitInput> {
  const [store] = await executor
    .select({ purchaseExchangeRate: storesTable.purchaseExchangeRate })
    .from(storesTable)
    .where(eq(storesTable.id, product.storeId))
    .limit(1);

  let route: typeof tripRoutesTable.$inferSelect | null = null;
  let trip: typeof tripsTable.$inferSelect | null = null;

  if (!product.isTransportCostExempt && product.tripRouteId !== null) {
    [route] = await executor
      .select()
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, product.tripRouteId))
      .limit(1);

    if (route) {
      [trip] = await executor
        .select()
        .from(tripsTable)
        .where(eq(tripsTable.id, route.tripId))
        .limit(1);
    }
  }

  return {
    unitPriceTwd,
    costJpy: product.costJpy,
    storePurchaseExchangeRate: store?.purchaseExchangeRate ?? null,
    isTransportCostExempt: product.isTransportCostExempt,
    transport: {
      product: { tripRouteId: product.tripRouteId },
      route,
      trip,
    },
  };
}
