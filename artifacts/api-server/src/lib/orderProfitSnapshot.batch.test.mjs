import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";

const { calculateProductUnitProfit, tripRoutesTable, tripsTable, storesTable } =
  await import("@workspace/db");
const { loadOrderProfitSnapshotInputs } =
  await import("./orderProfitSnapshot.ts");

const route = {
  id: 5,
  tripId: 8,
  areaTitle: "小樽",
  startPlace: "假起點",
  endPlace: "假終點",
  trainJpy: "0",
  fuelJpy: "3515",
  parkingJpy: "2100",
  estQty: 160,
  etcJpy: "4800",
  cardboardJpy: "1360",
  shippingJpy: "6136",
  parcelCount: 4,
  etcJpyOverride: null,
  etcJpyIsOverridden: false,
  fee1_5PctOverride: null,
  fee1_5PctIsOverridden: false,
  totalJpyOverride: null,
  totalJpyIsOverridden: false,
  domesticPerItemOverride: null,
  domesticPerItemIsOverridden: false,
  transportPerItemOverride: null,
  transportPerItemIsOverridden: false,
  finalCostPerItemOverride: null,
  finalCostPerItemIsOverridden: false,
  createdAt: new Date("2026-07-17T00:00:00Z"),
  updatedAt: new Date("2026-07-17T00:00:00Z"),
};
const trip = {
  id: 8,
  name: "假行程",
  exchangeRate: "0.199",
  notes: null,
  createdAt: new Date("2026-07-17T00:00:00Z"),
  updatedAt: new Date("2026-07-17T00:00:00Z"),
};

function fakeExecutor() {
  const queryCount = { store: 0, routes: 0, trips: 0 };
  return {
    queryCount,
    select() {
      return {
        from(table) {
          const rows =
            table === storesTable
              ? (queryCount.store++, [{ purchaseExchangeRate: "0.199" }])
              : table === tripRoutesTable
                ? (queryCount.routes++, [route])
                : table === tripsTable
                  ? (queryCount.trips++, [trip])
                  : [];
          return {
            where() {
              const promise = Promise.resolve(rows);
              promise.limit = async (limit) => rows.slice(0, limit);
              return promise;
            },
          };
        },
      };
    },
  };
}

test("batch loader uses one store, route, and trip query and preserves exact results", async () => {
  const executor = fakeExecutor();
  const products = [
    {
      id: 10,
      storeId: 3,
      unitPriceTwd: "800",
      costJpy: "2970",
      isTransportCostExempt: false,
      tripRouteId: 5,
    },
    {
      id: 11,
      storeId: 3,
      unitPriceTwd: "1900",
      costJpy: "8000",
      isTransportCostExempt: true,
      tripRouteId: null,
    },
  ];
  const inputs = await loadOrderProfitSnapshotInputs(executor, products);

  assert.deepEqual(executor.queryCount, { store: 1, routes: 1, trips: 1 });
  const allocated = calculateProductUnitProfit(inputs.get(10));
  assert.equal(allocated.status, "ready");
  assert.equal(allocated.unitTransportCostTwd.toDecimalPlaces(7), "22.4166535");
  assert.equal(allocated.unitProfitTwd.toDecimalPlaces(7), "186.5533465");

  const exempt = calculateProductUnitProfit(inputs.get(11));
  assert.equal(exempt.status, "ready");
  assert.equal(exempt.transportStatus, "exempt");
  assert.equal(exempt.unitProfitTwd.toDecimalPlaces(0), "308");
});

test("batch loader rejects mixed stores instead of sharing the wrong rate", async () => {
  await assert.rejects(
    () =>
      loadOrderProfitSnapshotInputs(fakeExecutor(), [
        {
          id: 1,
          storeId: 1,
          unitPriceTwd: "100",
          costJpy: "1",
          isTransportCostExempt: true,
          tripRouteId: null,
        },
        {
          id: 2,
          storeId: 2,
          unitPriceTwd: "100",
          costJpy: "1",
          isTransportCostExempt: true,
          tripRouteId: null,
        },
      ]),
    /one store/,
  );
});
