import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "trip store isolation requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_A = "batch22_trip_merchant_a";
  const MERCHANT_B = "batch22_trip_merchant_b";

  mock.module("@clerk/express", {
    namedExports: {
      getAuth: (req) => {
        const userId = req.headers?.["x-test-user-id"] ?? null;
        return { userId, sessionClaims: userId ? { userId } : undefined };
      },
      clerkMiddleware: () => (_req, _res, next) => next(),
    },
  });

  const { default: express } = await import("express");
  const {
    costEntriesTable,
    db,
    ordersTable,
    pool,
    productsTable,
    storesTable,
    tripAreaCostsTable,
    tripAreasTable,
    tripsTable,
    tripRoutesTable,
  } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { default: tripsRouter } = await import("./trips.ts");
  const { default: chartDataRouter } = await import("./chartData.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", tripsRouter);
  app.use("/api", chartDataRouter);

  let server;
  let baseUrl;
  let storeAId;
  let storeBId;
  let tripAId;
  let tripBId;
  let legacyTripId;
  let routeAId;
  // Chart data fixtures (batch 25): E route cost ranking + F area scatter.
  let chartTripEId;
  let chartAreaEId;
  let chartRouteEId;
  let chartRoutePendingFuelId;
  let chartRoutePendingAreaId;
  let chartTripFId;
  let chartAreaNorthId;
  let chartRouteF1Id;
  let chartTripFNoRateId;
  let chartAreaNoRateId;
  let chartRouteFNoRateId;
  let chartAreaMiddleId;
  let chartRouteF3Id;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    const nonce = Date.now();
    const [storeA, storeB] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: MERCHANT_A,
          name: "BATCH-22 trip store A",
          slug: `batch22-trip-a-${nonce}`,
        },
        {
          merchantId: MERCHANT_B,
          name: "BATCH-22 trip store B",
          slug: `batch22-trip-b-${nonce}`,
        },
      ])
      .returning();
    storeAId = storeA.id;
    storeBId = storeB.id;

    const [tripA, tripB, legacyTrip] = await db
      .insert(tripsTable)
      .values([
        { storeId: storeAId, name: "BATCH-22 A trip" },
        { storeId: storeBId, name: "BATCH-22 B trip" },
        { storeId: null, name: "BATCH-22 awaiting backfill" },
      ])
      .returning();
    tripAId = tripA.id;
    tripBId = tripB.id;
    legacyTripId = legacyTrip.id;

    const [routeA] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: tripAId,
        areaTitle: "BATCH-22 A route",
        startPlace: "A",
        endPlace: "B",
        estQty: 1,
        etcJpy: "0",
      })
      .returning();
    routeAId = routeA.id;

    // --- chart E fixtures (route unit cost ranking) ---
    const [chartTripE] = await db
      .insert(tripsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 chart E trip",
        exchangeRate: "0.2",
        hepTotalJpy: null,
        totalItemQuantity: null,
      })
      .returning();
    chartTripEId = chartTripE.id;
    const [chartAreaE] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: chartTripEId,
        name: "BATCH-25 E area",
      })
      .returning();
    chartAreaEId = chartAreaE.id;
    await db.insert(tripAreaCostsTable).values({
      tripAreaId: chartAreaEId,
      mode: "ESTIMATE",
      cardboardUnitJpy: "10",
      shippingUnitJpy: "20",
      parcelCount: 3,
      estimatedItemQuantity: 10,
    });
    const [chartRouteE] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripEId,
        tripAreaId: chartAreaEId,
        areaTitle: "BATCH-25 E route",
        startPlace: "A",
        endPlace: "B",
        estQty: 10,
        trainJpy: "100",
        fuelJpy: "50",
        parkingJpy: "30",
        etcJpy: "20",
      })
      .returning();
    chartRouteEId = chartRouteE.id;
    const [chartRoutePendingFuel] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripEId,
        tripAreaId: chartAreaEId,
        areaTitle: "BATCH-25 pending fuel route",
        startPlace: "A",
        endPlace: "B",
        estQty: 5,
        trainJpy: "10",
        fuelJpy: null,
        parkingJpy: "0",
        etcJpy: "0",
      })
      .returning();
    chartRoutePendingFuelId = chartRoutePendingFuel.id;
    const [chartRoutePendingArea] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripEId,
        tripAreaId: null,
        areaTitle: "BATCH-25 pending area route",
        startPlace: "A",
        endPlace: "B",
        estQty: 5,
        trainJpy: "10",
        fuelJpy: "20",
        parkingJpy: "0",
        etcJpy: "30",
      })
      .returning();
    chartRoutePendingAreaId = chartRoutePendingArea.id;

    // --- chart F fixtures (area scatter) ---
    const [chartTripF] = await db
      .insert(tripsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 chart F trip",
        exchangeRate: "0.25",
        actualExchangeRate: "0.25",
      })
      .returning();
    chartTripFId = chartTripF.id;
    const [chartAreaNorth] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFId,
        name: "BATCH-25 北區",
      })
      .returning();
    chartAreaNorthId = chartAreaNorth.id;
    const [chartRouteF1] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFId,
        tripAreaId: chartAreaNorthId,
        areaTitle: "BATCH-25 北區 route",
        startPlace: "A",
        endPlace: "B",
        estQty: 5,
        etcJpy: "0",
      })
      .returning();
    chartRouteF1Id = chartRouteF1.id;
    const [chartProductF1] = await db
      .insert(productsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 product north",
        price: "100",
        costJpy: "200",
        isTransportCostExempt: false,
        tripRouteId: chartRouteF1Id,
        shareToken: `batch25-share-north-${nonce}`,
      })
      .returning();
    await db.insert(ordersTable).values({
      productId: chartProductF1.id,
      storeId: storeAId,
      productName: "BATCH-25 product north",
      publicToken: `batch25-order-north-${nonce}`,
      buyerName: "BATCH-25 buyer",
      buyerPhone: "0",
      pickupMethod: "self_pickup",
      quantity: 4,
      unitPrice: "100",
      shippingFee: "0",
      totalPrice: "400",
      status: "preparing",
    });
    await db.insert(costEntriesTable).values({
      storeId: storeAId,
      tripId: chartTripFId,
      tripRouteId: chartRouteF1Id,
      mode: "ACTUAL",
      customLabel: "BATCH-25 north fuel",
      currency: "JPY",
      originalAmount: "500",
    });

    const [chartTripFNoRate] = await db
      .insert(tripsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 chart F no-rate trip",
        exchangeRate: null,
        actualExchangeRate: null,
      })
      .returning();
    chartTripFNoRateId = chartTripFNoRate.id;
    const [chartAreaNoRate] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFNoRateId,
        name: "BATCH-25 東區",
      })
      .returning();
    chartAreaNoRateId = chartAreaNoRate.id;
    const [chartRouteFNoRate] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFNoRateId,
        tripAreaId: chartAreaNoRateId,
        areaTitle: "BATCH-25 東區 route",
        startPlace: "A",
        endPlace: "B",
        estQty: 5,
        etcJpy: "0",
      })
      .returning();
    chartRouteFNoRateId = chartRouteFNoRate.id;
    const [chartProductFNoRate] = await db
      .insert(productsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 product no-rate",
        price: "100",
        costJpy: "200",
        isTransportCostExempt: false,
        tripRouteId: chartRouteFNoRateId,
        shareToken: `batch25-share-norate-${nonce}`,
      })
      .returning();
    await db.insert(ordersTable).values({
      productId: chartProductFNoRate.id,
      storeId: storeAId,
      productName: "BATCH-25 product no-rate",
      publicToken: `batch25-order-norate-${nonce}`,
      buyerName: "BATCH-25 buyer",
      buyerPhone: "0",
      pickupMethod: "self_pickup",
      quantity: 2,
      unitPrice: "100",
      shippingFee: "0",
      totalPrice: "200",
      status: "shipped",
    });

    const [chartAreaMiddle] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFId,
        name: "BATCH-25 中區",
      })
      .returning();
    chartAreaMiddleId = chartAreaMiddle.id;
    const [chartRouteF3] = await db
      .insert(tripRoutesTable)
      .values({
        storeId: storeAId,
        tripId: chartTripFId,
        tripAreaId: chartAreaMiddleId,
        areaTitle: "BATCH-25 中區 route",
        startPlace: "A",
        endPlace: "B",
        estQty: 5,
        etcJpy: "0",
      })
      .returning();
    chartRouteF3Id = chartRouteF3.id;
    const [chartProductF3] = await db
      .insert(productsTable)
      .values({
        storeId: storeAId,
        name: "BATCH-25 product middle",
        price: "200",
        costJpy: null,
        isTransportCostExempt: false,
        tripRouteId: chartRouteF3Id,
        shareToken: `batch25-share-middle-${nonce}`,
      })
      .returning();
    await db.insert(ordersTable).values({
      productId: chartProductF3.id,
      storeId: storeAId,
      productName: "BATCH-25 product middle",
      publicToken: `batch25-order-middle-${nonce}`,
      buyerName: "BATCH-25 buyer",
      buyerPhone: "0",
      pickupMethod: "self_pickup",
      quantity: 2,
      unitPrice: "200",
      shippingFee: "0",
      totalPrice: "400",
      status: "preparing",
    });
  });

  after(async () => {
    if (tripAId || tripBId || legacyTripId) {
      await db
        .delete(tripsTable)
        .where(
          inArray(
            tripsTable.id,
            [tripAId, tripBId, legacyTripId].filter(Boolean),
          ),
        );
    }
    if (storeAId || storeBId) {
      await db
        .delete(storesTable)
        .where(inArray(storesTable.id, [storeAId, storeBId].filter(Boolean)));
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(method, path, { userId = MERCHANT_A, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  }

  test("all trip routes require authentication", async () => {
    for (const [method, path, body] of [
      ["GET", "/trips", undefined],
      ["POST", "/trips", { name: "No auth" }],
      ["PATCH", `/trips/${tripAId}`, { name: "No auth" }],
      [
        "POST",
        `/trips/${tripAId}/routes`,
        {
          areaTitle: "No auth",
          startPlace: "A",
          endPlace: "B",
          estQty: 1,
          etcJpy: 0,
        },
      ],
      [
        "PATCH",
        `/trips/${tripAId}/routes/${routeAId}`,
        { areaTitle: "No auth" },
      ],
      ["GET", `/stores/${storeAId}/trips`, undefined],
      ["GET", `/stores/${storeAId}/trips/${tripAId}/areas`, undefined],
      [
        "POST",
        `/stores/${storeAId}/trips/${tripAId}/areas`,
        {
          name: "No auth area",
          mode: "ESTIMATE",
          cardboardUnitJpy: 1,
          shippingUnitJpy: 2,
          parcelCount: 1,
          estimatedItemQuantity: 1,
        },
      ],
      [
        "PATCH",
        `/stores/${storeAId}/trips/${tripAId}/areas/1`,
        {
          mode: "ESTIMATE",
          cardboardUnitJpy: 1,
          shippingUnitJpy: 2,
          parcelCount: 1,
          estimatedItemQuantity: 1,
        },
      ],
      ["DELETE", `/stores/${storeAId}/trips/${tripAId}/areas/1`, undefined],
    ]) {
      const response = await request(method, path, { userId: null, body });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });

  test("store A cannot see store B trips or routes", async () => {
    const response = await request("GET", "/trips");
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.data.map((trip) => trip.id).sort((a, b) => a - b),
      [
        tripAId,
        legacyTripId,
        chartTripEId,
        chartTripFId,
        chartTripFNoRateId,
      ].sort((a, b) => a - b),
    );
    assert.equal(
      JSON.stringify(response.data).includes("BATCH-22 B trip"),
      false,
    );
    assert.equal(
      JSON.stringify(response.data).includes("BATCH-22 A route"),
      true,
    );
    assert.equal(JSON.stringify(response.data).includes("storeId"), false);
  });

  test("dashboard trips endpoint GET /stores/:storeId/trips matches the frontend contract (KPI board source)", async () => {
    // useTripProfitBoard（tripProfitBoard.ts:225）以「前端實際行為」固定抓取此網址；
    // 修復前後端與 openapi 皆無此路由 → KPI 板永遠「尚無行程」。
    const response = await request("GET", `/stores/${storeAId}/trips`);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(
      response.data.map((trip) => trip.id).sort((a, b) => a - b),
      [
        tripAId,
        legacyTripId,
        chartTripEId,
        chartTripFId,
        chartTripFNoRateId,
      ].sort((a, b) => a - b),
    );
    assert.equal(
      JSON.stringify(response.data).includes("BATCH-22 B trip"),
      false,
    );
    assert.equal(
      JSON.stringify(response.data).includes("BATCH-22 A route"),
      true,
    );
    assert.equal(JSON.stringify(response.data).includes("storeId"), false);

    const crossStore = await request("GET", `/stores/${storeAId}/trips`, {
      userId: MERCHANT_B,
    });
    assert.equal(crossStore.status, 403, JSON.stringify(crossStore.data));

    const missingStore = await request("GET", "/stores/99999999/trips");
    assert.equal(missingStore.status, 404, JSON.stringify(missingStore.data));

    const invalidStore = await request("GET", "/stores/not-a-number/trips");
    assert.equal(invalidStore.status, 400, JSON.stringify(invalidStore.data));
  });
  test("new trips and routes are stamped with the authenticated store", async () => {
    const tripResponse = await request("POST", "/trips", {
      body: { name: "BATCH-22 newly owned trip" },
    });
    assert.equal(tripResponse.status, 201);
    const newTripId = tripResponse.data.id;

    const routeResponse = await request("POST", `/trips/${newTripId}/routes`, {
      body: {
        areaTitle: "BATCH-22 newly owned route",
        startPlace: "A",
        endPlace: "B",
        estQty: 1,
        etcJpy: 0,
      },
    });
    assert.equal(routeResponse.status, 201);

    const [storedTrip] = await db
      .select({ storeId: tripsTable.storeId })
      .from(tripsTable)
      .where(eq(tripsTable.id, newTripId));
    const [storedRoute] = await db
      .select({ storeId: tripRoutesTable.storeId })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeResponse.data.id));
    assert.equal(storedTrip.storeId, storeAId);
    assert.equal(storedRoute.storeId, storeAId);
    await db.delete(tripsTable).where(eq(tripsTable.id, newTripId));
  });

  test("cross-store trip update is rejected", async () => {
    const response = await request("PATCH", `/trips/${tripAId}`, {
      userId: MERCHANT_B,
      body: { name: "Cross-store overwrite" },
    });
    assert.equal(response.status, 403);
    const [stored] = await db
      .select({ name: tripsTable.name })
      .from(tripsTable)
      .where(eq(tripsTable.id, tripAId));
    assert.equal(stored.name, "BATCH-22 A trip");
  });

  test("cross-store route creation is rejected", async () => {
    const response = await request("POST", `/trips/${tripAId}/routes`, {
      userId: MERCHANT_B,
      body: {
        areaTitle: "Cross-store route",
        startPlace: "A",
        endPlace: "B",
        estQty: 1,
        etcJpy: 0,
      },
    });
    assert.equal(response.status, 403);
  });

  test("route update binds route id, trip id, and store before writing", async () => {
    const wrongTrip = await request(
      "PATCH",
      `/trips/${tripBId}/routes/${routeAId}`,
      { body: { areaTitle: "Wrong parent overwrite" } },
    );
    assert.equal(wrongTrip.status, 404);

    const crossStore = await request(
      "PATCH",
      `/trips/${tripAId}/routes/${routeAId}`,
      { userId: MERCHANT_B, body: { areaTitle: "Cross-store overwrite" } },
    );
    assert.equal(crossStore.status, 403);

    const [stored] = await db
      .select({ areaTitle: tripRoutesTable.areaTitle })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeAId));
    assert.equal(stored.areaTitle, "BATCH-22 A route");
  });

  test("trip area CRUD persists ESTIMATE and ACTUAL costs and enforces unique names", async () => {
    const create = await request(
      "POST",
      `/stores/${storeAId}/trips/${tripAId}/areas`,
      {
        body: {
          name: "BATCH-23 Tokyo",
          mode: "ESTIMATE",
          cardboardUnitJpy: 39.75,
          shippingUnitJpy: 120,
          parcelCount: 10,
          estimatedItemQuantity: 465,
        },
      },
    );
    assert.equal(create.status, 201);
    assert.equal(create.data.name, "BATCH-23 Tokyo");
    assert.equal(create.data.costs.length, 1);
    assert.equal(create.data.costs[0].mode, "ESTIMATE");
    const areaId = create.data.id;

    const [storedArea] = await db
      .select()
      .from(tripAreasTable)
      .where(eq(tripAreasTable.id, areaId));
    const [storedEstimate] = await db
      .select()
      .from(tripAreaCostsTable)
      .where(eq(tripAreaCostsTable.tripAreaId, areaId));
    assert.equal(storedArea.storeId, storeAId);
    assert.equal(storedArea.tripId, tripAId);
    assert.equal(storedEstimate.cardboardUnitJpy, "39.750000000000");
    assert.equal(storedEstimate.shippingUnitJpy, "120.000000000000");
    assert.equal(storedEstimate.parcelCount, 10);
    assert.equal(storedEstimate.estimatedItemQuantity, 465);

    const duplicate = await request(
      "POST",
      `/stores/${storeAId}/trips/${tripAId}/areas`,
      {
        body: {
          name: "BATCH-23 Tokyo",
          mode: "ACTUAL",
          cardboardUnitJpy: 1,
          shippingUnitJpy: 2,
          parcelCount: 3,
          estimatedItemQuantity: null,
        },
      },
    );
    assert.equal(duplicate.status, 409);

    const updateActual = await request(
      "PATCH",
      `/stores/${storeAId}/trips/${tripAId}/areas/${areaId}`,
      {
        body: {
          name: "BATCH-23 Tokyo renamed",
          mode: "ACTUAL",
          cardboardUnitJpy: 40,
          shippingUnitJpy: 125,
          parcelCount: 11,
          estimatedItemQuantity: null,
        },
      },
    );
    assert.equal(updateActual.status, 200);
    assert.equal(updateActual.data.name, "BATCH-23 Tokyo renamed");
    assert.deepEqual(
      updateActual.data.costs.map((cost) => cost.mode),
      ["ESTIMATE", "ACTUAL"],
    );

    const updateEstimate = await request(
      "PATCH",
      `/stores/${storeAId}/trips/${tripAId}/areas/${areaId}`,
      {
        body: {
          mode: "ESTIMATE",
          cardboardUnitJpy: 41,
          shippingUnitJpy: 121,
          parcelCount: 12,
          estimatedItemQuantity: 500,
        },
      },
    );
    assert.equal(updateEstimate.status, 200);
    assert.equal(updateEstimate.data.costs.length, 2);
    const estimate = updateEstimate.data.costs.find(
      (cost) => cost.mode === "ESTIMATE",
    );
    assert.equal(estimate.cardboardUnitJpy, 41);
    assert.equal(estimate.estimatedItemQuantity, 500);
    const storedCosts = await db
      .select()
      .from(tripAreaCostsTable)
      .where(eq(tripAreaCostsTable.tripAreaId, areaId));
    assert.deepEqual(storedCosts.map((cost) => cost.mode).sort(), [
      "ACTUAL",
      "ESTIMATE",
    ]);
    const storedActual = storedCosts.find((cost) => cost.mode === "ACTUAL");
    assert.equal(storedActual.shippingUnitJpy, "125.000000000000");
    assert.equal(storedActual.estimatedItemQuantity, null);

    const list = await request(
      "GET",
      `/stores/${storeAId}/trips/${tripAId}/areas`,
    );
    assert.equal(list.status, 200);
    const listedArea = list.data.find((area) => area.id === areaId);
    assert.equal(listedArea.name, "BATCH-23 Tokyo renamed");
    assert.equal(listedArea.costs.length, 2);

    await db.delete(tripAreasTable).where(eq(tripAreasTable.id, areaId));
  });

  test("trip area endpoints reject cross-store and wrong-trip access", async () => {
    const crossStore = await request(
      "GET",
      `/stores/${storeAId}/trips/${tripAId}/areas`,
      { userId: MERCHANT_B },
    );
    assert.equal(crossStore.status, 403);

    const wrongTrip = await request(
      "GET",
      `/stores/${storeAId}/trips/${tripBId}/areas`,
    );
    assert.equal(wrongTrip.status, 404);

    const [areaB] = await db
      .insert(tripAreasTable)
      .values({ storeId: storeBId, tripId: tripBId, name: "BATCH-23 B area" })
      .returning();
    const patch = await request(
      "PATCH",
      `/stores/${storeAId}/trips/${tripAId}/areas/${areaB.id}`,
      {
        body: {
          mode: "ESTIMATE",
          cardboardUnitJpy: 1,
          shippingUnitJpy: 2,
          parcelCount: 3,
          estimatedItemQuantity: 4,
        },
      },
    );
    assert.equal(patch.status, 404);
    const remove = await request(
      "DELETE",
      `/stores/${storeAId}/trips/${tripAId}/areas/${areaB.id}`,
    );
    assert.equal(remove.status, 404);
    await db.delete(tripAreasTable).where(eq(tripAreasTable.id, areaB.id));
  });

  test("fractional area and route integer inputs return 400 without database writes", async () => {
    const invalidCreateNames = [
      "BATCH-23 fractional parcel create",
      "BATCH-23 fractional quantity create",
    ];
    for (const [name, parcelCount, estimatedItemQuantity] of [
      [invalidCreateNames[0], 1.5, 10],
      [invalidCreateNames[1], 1, 10.5],
    ]) {
      const response = await request(
        "POST",
        `/stores/${storeAId}/trips/${tripAId}/areas`,
        {
          body: {
            name,
            mode: "ESTIMATE",
            cardboardUnitJpy: 1,
            shippingUnitJpy: 2,
            parcelCount,
            estimatedItemQuantity,
          },
        },
      );
      assert.equal(response.status, 400);
    }
    const invalidCreates = await db
      .select({ id: tripAreasTable.id })
      .from(tripAreasTable)
      .where(inArray(tripAreasTable.name, invalidCreateNames));
    assert.equal(invalidCreates.length, 0);

    const [area] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: tripAId,
        name: "BATCH-23 integer validation area",
      })
      .returning();
    await db.insert(tripAreaCostsTable).values({
      tripAreaId: area.id,
      mode: "ESTIMATE",
      cardboardUnitJpy: "3",
      shippingUnitJpy: "4",
      parcelCount: 5,
      estimatedItemQuantity: 6,
    });
    for (const [name, parcelCount, estimatedItemQuantity] of [
      ["BATCH-23 invalid parcel rename", 5.5, 6],
      ["BATCH-23 invalid quantity rename", 5, 6.5],
    ]) {
      const response = await request(
        "PATCH",
        `/stores/${storeAId}/trips/${tripAId}/areas/${area.id}`,
        {
          body: {
            name,
            mode: "ESTIMATE",
            cardboardUnitJpy: 30,
            shippingUnitJpy: 40,
            parcelCount,
            estimatedItemQuantity,
          },
        },
      );
      assert.equal(response.status, 400);
    }
    const [unchangedArea] = await db
      .select({ name: tripAreasTable.name })
      .from(tripAreasTable)
      .where(eq(tripAreasTable.id, area.id));
    const [unchangedCost] = await db
      .select()
      .from(tripAreaCostsTable)
      .where(eq(tripAreaCostsTable.tripAreaId, area.id));
    assert.equal(unchangedArea.name, "BATCH-23 integer validation area");
    assert.equal(unchangedCost.cardboardUnitJpy, "3.000000000000");
    assert.equal(unchangedCost.shippingUnitJpy, "4.000000000000");
    assert.equal(unchangedCost.parcelCount, 5);
    assert.equal(unchangedCost.estimatedItemQuantity, 6);

    const fractionalRouteTitle = "BATCH-23 fractional route area id";
    const routeCreate = await request("POST", `/trips/${tripAId}/routes`, {
      body: {
        tripAreaId: area.id + 0.5,
        areaTitle: fractionalRouteTitle,
        startPlace: "A",
        endPlace: "B",
        estQty: 1,
        etcJpy: 0,
      },
    });
    assert.equal(routeCreate.status, 400);
    const invalidRoutes = await db
      .select({ id: tripRoutesTable.id })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.areaTitle, fractionalRouteTitle));
    assert.equal(invalidRoutes.length, 0);

    const [routeBefore] = await db
      .select({ tripAreaId: tripRoutesTable.tripAreaId })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeAId));
    const routePatch = await request(
      "PATCH",
      `/trips/${tripAId}/routes/${routeAId}`,
      { body: { tripAreaId: area.id + 0.5 } },
    );
    assert.equal(routePatch.status, 400);
    const [routeAfter] = await db
      .select({ tripAreaId: tripRoutesTable.tripAreaId })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeAId));
    assert.equal(routeAfter.tripAreaId, routeBefore.tripAreaId);

    await db.delete(tripAreasTable).where(eq(tripAreasTable.id, area.id));
  });

  test("route area binding validates the parent trip, supports null, and delete unlinks", async () => {
    const [otherTripA] = await db
      .insert(tripsTable)
      .values({ storeId: storeAId, name: "BATCH-23 other A trip" })
      .returning();
    const [areaA, areaB] = await db
      .insert(tripAreasTable)
      .values([
        { storeId: storeAId, tripId: tripAId, name: "BATCH-23 bind A" },
        { storeId: storeBId, tripId: tripBId, name: "BATCH-23 bind B" },
      ])
      .returning();
    const [otherAreaA] = await db
      .insert(tripAreasTable)
      .values({
        storeId: storeAId,
        tripId: otherTripA.id,
        name: "BATCH-23 other A area",
      })
      .returning();

    for (const [tripAreaId, areaTitle] of [
      [otherAreaA.id, "BATCH-23 cross-trip area route"],
      [areaB.id, "BATCH-23 cross-store area route"],
    ]) {
      const wrongCreate = await request("POST", `/trips/${tripAId}/routes`, {
        body: {
          tripAreaId,
          areaTitle,
          startPlace: "A",
          endPlace: "B",
          estQty: 1,
          etcJpy: 0,
        },
      });
      assert.equal(wrongCreate.status, 400);
    }

    const create = await request("POST", `/trips/${tripAId}/routes`, {
      body: {
        tripAreaId: areaA.id,
        areaTitle: "BATCH-23 area route",
        startPlace: "A",
        endPlace: "B",
        estQty: 1,
        etcJpy: 0,
      },
    });
    assert.equal(create.status, 201);
    assert.equal(create.data.tripAreaId, areaA.id);

    const wrongPatch = await request(
      "PATCH",
      `/trips/${tripAId}/routes/${create.data.id}`,
      { body: { tripAreaId: areaB.id } },
    );
    assert.equal(wrongPatch.status, 400);

    const unlink = await request(
      "PATCH",
      `/trips/${tripAId}/routes/${create.data.id}`,
      { body: { tripAreaId: null } },
    );
    assert.equal(unlink.status, 200);
    assert.equal(unlink.data.tripAreaId, null);

    const relink = await request(
      "PATCH",
      `/trips/${tripAId}/routes/${create.data.id}`,
      { body: { tripAreaId: areaA.id } },
    );
    assert.equal(relink.status, 200);
    assert.equal(relink.data.tripAreaId, areaA.id);

    const remove = await request(
      "DELETE",
      `/stores/${storeAId}/trips/${tripAId}/areas/${areaA.id}`,
    );
    assert.equal(remove.status, 204);
    const [storedRoute] = await db
      .select({ tripAreaId: tripRoutesTable.tripAreaId })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, create.data.id));
    assert.equal(storedRoute.tripAreaId, null);

    await db.delete(tripAreasTable).where(eq(tripAreasTable.id, areaB.id));
    await db.delete(tripsTable).where(eq(tripsTable.id, otherTripA.id));
  });
  test("chart E route cost ranking reports computed unit costs and pending routes", async () => {
    const response = await request(
      "GET",
      `/stores/${storeAId}/charts/route-cost-ranking`,
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.status, "pending_confirmation");
    assert.equal(JSON.stringify(response.data).includes("storeId"), false);

    const byTitle = new Map(
      response.data.items.map((item) => [item.name, item]),
    );
    const ready = byTitle.get("BATCH-25 E route");
    assert.equal(ready.status, "ready");
    assert.equal(ready.unitCostTwd, "5.887000000000");
    assert.equal(ready.reason, null);
    assert.equal(ready.tripName, "BATCH-25 chart E trip");

    // Sorted: a ready route must rank above every pending route.
    const readyIndex = response.data.items.findIndex(
      (item) => item.routeId === chartRouteEId,
    );
    for (const item of response.data.items.slice(readyIndex + 1)) {
      assert.equal(item.status, "pending_confirmation");
    }

    assert.equal(
      byTitle.get("BATCH-25 pending fuel route").status,
      "pending_confirmation",
    );
    assert.equal(
      byTitle.get("BATCH-25 pending fuel route").reason,
      "missing_fuel_jpy",
    );
    assert.equal(byTitle.get("BATCH-25 pending fuel route").unitCostTwd, null);
    assert.equal(
      byTitle.get("BATCH-25 pending area route").reason,
      "missing_trip_area",
    );
    // tripA has no exchange rate; its routes must fail closed as well.
    const legacyPending = byTitle.get("BATCH-22 A route");
    assert.equal(legacyPending.status, "pending_confirmation");
    assert.equal(legacyPending.reason, "missing_exchange_rate");
    assert.equal(legacyPending.unitCostTwd, null);
  });

  test("chart E route cost ranking enforces store ownership", async () => {
    const crossStore = await request(
      "GET",
      `/stores/${storeAId}/charts/route-cost-ranking`,
      { userId: MERCHANT_B },
    );
    assert.equal(crossStore.status, 403, JSON.stringify(crossStore.data));

    const missingStore = await request(
      "GET",
      "/stores/99999999/charts/route-cost-ranking",
    );
    assert.equal(missingStore.status, 404, JSON.stringify(missingStore.data));

    const invalidStore = await request(
      "GET",
      "/stores/not-a-number/charts/route-cost-ranking",
    );
    assert.equal(invalidStore.status, 400, JSON.stringify(invalidStore.data));

    const unauthenticated = await request(
      "GET",
      `/stores/${storeAId}/charts/route-cost-ranking`,
      { userId: null },
    );
    assert.equal(
      unauthenticated.status,
      401,
      JSON.stringify(unauthenticated.data),
    );
  });

  test("chart F area scatter aggregates actual performance and fails closed", async () => {
    const response = await request(
      "GET",
      `/stores/${storeAId}/charts/area-scatter`,
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.status, "pending_confirmation");
    assert.equal(JSON.stringify(response.data).includes("storeId"), false);

    const byName = new Map(
      response.data.items.map((item) => [item.areaName, item]),
    );
    const north = byName.get("BATCH-25 北區");
    assert.equal(north.status, "ready");
    assert.equal(north.itemQuantity, "4");
    assert.equal(north.revenueTwd, "400.000000000000");
    assert.equal(north.averageUnitProfitTwd, "18.750000000000");
    assert.equal(north.tripCount, 1);

    const middle = byName.get("BATCH-25 中區");
    assert.equal(middle.status, "pending_confirmation");
    assert.equal(middle.reason, "missing_product_cost_jpy");
    assert.equal(middle.itemQuantity, null);
    assert.equal(middle.revenueTwd, null);
    assert.equal(middle.averageUnitProfitTwd, null);

    const east = byName.get("BATCH-25 東區");
    assert.equal(east.status, "pending_confirmation");
    assert.equal(east.reason, "missing_actual_exchange_rate");
    assert.equal(east.itemQuantity, null);
  });

  test("chart F area scatter enforces store ownership and input rules", async () => {
    const crossStore = await request(
      "GET",
      `/stores/${storeAId}/charts/area-scatter`,
      { userId: MERCHANT_B },
    );
    assert.equal(crossStore.status, 403, JSON.stringify(crossStore.data));

    const missingStore = await request(
      "GET",
      "/stores/99999999/charts/area-scatter",
    );
    assert.equal(missingStore.status, 404, JSON.stringify(missingStore.data));

    const invalidStore = await request("GET", "/stores/x/charts/area-scatter");
    assert.equal(invalidStore.status, 400, JSON.stringify(invalidStore.data));

    const unauthenticated = await request(
      "GET",
      `/stores/${storeAId}/charts/area-scatter`,
      { userId: null },
    );
    assert.equal(
      unauthenticated.status,
      401,
      JSON.stringify(unauthenticated.data),
    );
  });
}
