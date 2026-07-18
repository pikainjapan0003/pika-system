import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  assertDemoAppendAllowed,
  parseExplicitDemoSeedOptions,
} from "./src/demoSeedSafety.ts";

function snapshotInput({ product, route, trip, store, unitPriceTwd }) {
  return {
    unitPriceTwd,
    costJpy: product.costJpy,
    storePurchaseExchangeRate: store.purchaseExchangeRate,
    isTransportCostExempt: product.isTransportCostExempt,
    transport: {
      product: { tripRouteId: product.tripRouteId },
      route,
      trip,
    },
  };
}

export async function seedDemoData(databaseUrl, { append = false } = {}) {
  process.env.DATABASE_URL = databaseUrl;

  const dbModule = await import("../lib/db/src/index.ts");
  const { ExactDecimal } =
    await import("../lib/db/src/transport-cost/index.ts");
  const {
    createCartOrderProfitSnapshot,
    createInitialOrderProfitSnapshot,
    db,
    multiplyMoneyByQuantity,
    ordersTable,
    pool,
    productsTable,
    storesTable,
    tripRoutesTable,
    tripsTable,
  } = dbModule;

  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const capturedAt = new Date();

  try {
    const [existingProducts, existingOrders] = await Promise.all([
      db
        .select({ shareToken: productsTable.shareToken })
        .from(productsTable),
      db
        .select({ publicToken: ordersTable.publicToken })
        .from(ordersTable),
    ]);
    const existingDemoRowCount =
      existingProducts.filter((row) => row.shareToken.startsWith("demo-"))
        .length +
      existingOrders.filter((row) => row.publicToken.startsWith("demo-order-"))
        .length;
    assertDemoAppendAllowed(
      existingDemoRowCount,
      append,
    );

    return await db.transaction(async (tx) => {
      const [store] = await tx
        .insert(storesTable)
        .values({
          merchantId: `demo-merchant-${runId}`,
          name: "示範假店鋪（非真實資料）",
          slug: `demo-store-${runId}`,
          description: "BATCH-9 本機／拋棄式資料庫示範資料",
          purchaseExchangeRate: "0.199",
        })
        .returning();

      const [trip] = await tx
        .insert(tripsTable)
        .values({
          name: "示範北海道行程（假資料）",
          exchangeRate: "0.199",
          notes: "僅供本機與拋棄式資料庫展示",
        })
        .returning();

      const [route] = await tx
        .insert(tripRoutesTable)
        .values({
          tripId: trip.id,
          areaTitle: `示範小樽-${runId}`,
          startPlace: "示範起點",
          endPlace: "示範終點",
          trainJpy: "0",
          fuelJpy: "3515",
          parkingJpy: "2100",
          estQty: 160,
          etcJpy: "4800",
          cardboardJpy: "1360",
          shippingJpy: "6136",
          parcelCount: 4,
        })
        .returning();

      const [allocatedProduct, pendingProduct, exemptProduct] = await tx
        .insert(productsTable)
        .values([
          {
            storeId: store.id,
            name: "示範商品－已分攤（假資料）",
            price: "800.00",
            costJpy: "2970",
            tripRouteId: route.id,
            inventory: 100,
            shareToken: `demo-allocated-${runId}`,
          },
          {
            storeId: store.id,
            name: "示範商品－待確認（假資料）",
            price: "800.00",
            costJpy: null,
            tripRouteId: null,
            inventory: 100,
            shareToken: `demo-pending-${runId}`,
          },
          {
            storeId: store.id,
            name: "示範商品－免攤（假資料）",
            price: "1900.00",
            costJpy: "8000",
            isTransportCostExempt: true,
            tripRouteId: null,
            inventory: 100,
            shareToken: `demo-exempt-${runId}`,
          },
        ])
        .returning();

      const routeInput = {
        id: route.id,
        tripId: route.tripId,
        estQty: route.estQty,
        trainJpy: route.trainJpy,
        fuelJpy: route.fuelJpy,
        parkingJpy: route.parkingJpy,
        etcJpy: route.etcJpy,
        cardboardJpy: route.cardboardJpy,
        shippingJpy: route.shippingJpy,
        fee1_5PctOverride: route.fee1_5PctOverride,
        fee1_5PctIsOverridden: route.fee1_5PctIsOverridden,
        totalJpyOverride: route.totalJpyOverride,
        totalJpyIsOverridden: route.totalJpyIsOverridden,
        domesticPerItemOverride: route.domesticPerItemOverride,
        domesticPerItemIsOverridden: route.domesticPerItemIsOverridden,
        transportPerItemOverride: route.transportPerItemOverride,
        transportPerItemIsOverridden: route.transportPerItemIsOverridden,
        finalCostPerItemOverride: route.finalCostPerItemOverride,
        finalCostPerItemIsOverridden: route.finalCostPerItemIsOverridden,
      };
      const tripInput = { id: trip.id, exchangeRate: trip.exchangeRate };

      const allocatedInput = snapshotInput({
        product: allocatedProduct,
        route: routeInput,
        trip: tripInput,
        store,
        unitPriceTwd: allocatedProduct.price,
      });
      const pendingInput = snapshotInput({
        product: pendingProduct,
        route: null,
        trip: null,
        store,
        unitPriceTwd: pendingProduct.price,
      });
      const exemptInput = snapshotInput({
        product: exemptProduct,
        route: null,
        trip: null,
        store,
        unitPriceTwd: exemptProduct.price,
      });

      const allocatedSnapshot = createInitialOrderProfitSnapshot(
        allocatedInput,
        capturedAt,
      );
      const pendingSnapshot = createInitialOrderProfitSnapshot(
        pendingInput,
        capturedAt,
      );
      const exemptSnapshot = createInitialOrderProfitSnapshot(
        exemptInput,
        capturedAt,
      );
      if (
        allocatedSnapshot.profitSnapshotStatus !== "captured" ||
        pendingSnapshot.profitSnapshotStatus !== "pending" ||
        exemptSnapshot.profitSnapshotStatus !== "exempt"
      ) {
        throw new Error(
          "Demo fixtures did not resolve to captured/pending/exempt as expected",
        );
      }

      const sharedOrderValues = {
        storeId: store.id,
        buyerName: "示範顧客（假資料）",
        buyerPhone: "0900000000",
        pickupMethod: "self_pickup",
        shippingFee: "0.00",
        status: "pending",
      };

      const insertedSingleOrders = await tx
        .insert(ordersTable)
        .values([
          {
            ...sharedOrderValues,
            productId: allocatedProduct.id,
            productName: allocatedProduct.name,
            publicToken: `demo-order-captured-${runId}`,
            quantity: 1,
            unitPrice: allocatedProduct.price,
            totalPrice: multiplyMoneyByQuantity(allocatedProduct.price, 1),
            ...allocatedSnapshot,
          },
          {
            ...sharedOrderValues,
            productId: pendingProduct.id,
            productName: pendingProduct.name,
            publicToken: `demo-order-pending-${runId}`,
            quantity: 1,
            unitPrice: pendingProduct.price,
            totalPrice: multiplyMoneyByQuantity(pendingProduct.price, 1),
            ...pendingSnapshot,
          },
          {
            ...sharedOrderValues,
            productId: exemptProduct.id,
            productName: exemptProduct.name,
            publicToken: `demo-order-exempt-${runId}`,
            quantity: 1,
            unitPrice: exemptProduct.price,
            totalPrice: multiplyMoneyByQuantity(exemptProduct.price, 1),
            ...exemptSnapshot,
          },
        ])
        .returning({
          id: ordersTable.id,
          status: ordersTable.profitSnapshotStatus,
        });

      const cartSnapshot = createCartOrderProfitSnapshot(
        [
          {
            item: {
              productId: allocatedProduct.id,
              productName: allocatedProduct.name,
              productImageUrl: null,
              specValues: {},
              quantity: 1,
              unitPrice: 800,
              subtotal: 800,
            },
            quantity: 1,
            snapshotInput: allocatedInput,
          },
          {
            item: {
              productId: exemptProduct.id,
              productName: exemptProduct.name,
              productImageUrl: null,
              specValues: {},
              quantity: 1,
              unitPrice: 1900,
              subtotal: 1900,
            },
            quantity: 1,
            snapshotInput: exemptInput,
          },
        ],
        capturedAt,
      );
      const cartItems = cartSnapshot.items.map(({ item, profitSnapshot }) => ({
        ...item,
        profitSnapshot,
      }));
      const cartTotalPrice = ExactDecimal.from("800.00")
        .add(ExactDecimal.from("1900.00"))
        .toDecimalPlaces(2);

      const [cartOrder] = await tx
        .insert(ordersTable)
        .values({
          ...sharedOrderValues,
          productId: allocatedProduct.id,
          productName: "示範購物車訂單（假資料）",
          publicToken: `demo-order-cart-${runId}`,
          quantity: 1,
          unitPrice: allocatedProduct.price,
          totalPrice: cartTotalPrice,
          items: cartItems,
          cartProfitSnapshotTotalTwd: cartSnapshot.cartProfitSnapshotTotalTwd,
          cartProfitSnapshotStatus: cartSnapshot.cartProfitSnapshotStatus,
        })
        .returning({
          id: ordersTable.id,
          status: ordersTable.cartProfitSnapshotStatus,
        });

      return {
        runId,
        storeId: store.id,
        tripId: trip.id,
        tripRouteId: route.id,
        productIds: [allocatedProduct.id, pendingProduct.id, exemptProduct.id],
        singleOrders: insertedSingleOrders,
        cartOrder,
      };
    });
  } finally {
    await pool.end();
  }
}

async function main() {
  const { databaseUrl, append } = parseExplicitDemoSeedOptions(
    process.argv.slice(2),
  );
  const result = await seedDemoData(databaseUrl, { append });
  console.log("DEMO_SEED_OK");
  console.table(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      "DEMO_SEED_FAILED",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
