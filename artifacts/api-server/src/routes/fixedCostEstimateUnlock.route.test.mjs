import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "fixed-cost estimate unlock requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_ID = "v1_phase15_unlock_merchant";

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
    costCategoriesTable,
    costEntriesTable,
    db,
    pool,
    storesTable,
    tripRoutesTable,
    tripsTable,
  } = await import("@workspace/db");
  const { and, eq, inArray } = await import("drizzle-orm");
  const { default: fixedCostsRouter } = await import("./fixedCosts.ts");
  const { default: operatingInputsRouter } =
    await import("./operatingInputs.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", fixedCostsRouter);
  app.use("/api", operatingInputsRouter);

  let server;
  let baseUrl;
  let storeId;
  let tripId;
  let categoryId;
  let entryId;
  let apiHepTripId;
  let dbHepTripId;
  let sameStoreOtherTripId;
  let otherStoreId;
  let otherStoreTripId;
  let routeAId;
  let routeBId;
  let restrictRouteId;
  let sameStoreOtherRouteId;
  let otherStoreRouteId;
  let routeUniqueCategoryId;
  let tripwideUniqueCategoryId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    const nonce = Date.now();
    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: MERCHANT_ID,
        name: "V1 phase15 unlock store",
        slug: `v1-phase15-unlock-${nonce}`,
      })
      .returning();
    storeId = store.id;

    const [trip] = await db
      .insert(tripsTable)
      .values({ storeId, name: "V1 phase15 unlock trip" })
      .returning();
    tripId = trip.id;

    const [apiHepTrip] = await db
      .insert(tripsTable)
      .values({ storeId, name: "V1 phase20 API HEP range trip" })
      .returning();
    apiHepTripId = apiHepTrip.id;

    const [dbHepTrip] = await db
      .insert(tripsTable)
      .values({ storeId, name: "V1 phase20 DB HEP range trip" })
      .returning();
    dbHepTripId = dbHepTrip.id;

    const [sameStoreOtherTrip] = await db
      .insert(tripsTable)
      .values({ storeId, name: "V1 phase21 other trip" })
      .returning();
    sameStoreOtherTripId = sameStoreOtherTrip.id;

    const [otherStore] = await db
      .insert(storesTable)
      .values({
        merchantId: `${MERCHANT_ID}_other`,
        name: "V1 phase21 other store",
        slug: `v1-phase21-other-${nonce}`,
      })
      .returning();
    otherStoreId = otherStore.id;

    const [otherStoreTrip] = await db
      .insert(tripsTable)
      .values({ storeId: otherStoreId, name: "V1 phase21 foreign store trip" })
      .returning();
    otherStoreTripId = otherStoreTrip.id;

    const routes = await db
      .insert(tripRoutesTable)
      .values([
        {
          storeId,
          tripId,
          areaTitle: "V1 phase21 route A",
          startPlace: "A",
          endPlace: "B",
          estQty: 1,
        },
        {
          storeId,
          tripId,
          areaTitle: "V1 phase21 route B",
          startPlace: "B",
          endPlace: "C",
          estQty: 1,
        },
        {
          storeId,
          tripId,
          areaTitle: "V1 phase21 restrict route",
          startPlace: "C",
          endPlace: "D",
          estQty: 1,
        },
        {
          storeId,
          tripId: sameStoreOtherTripId,
          areaTitle: "V1 phase21 same-store foreign route",
          startPlace: "D",
          endPlace: "E",
          estQty: 1,
        },
        {
          storeId: otherStoreId,
          tripId: otherStoreTripId,
          areaTitle: "V1 phase21 other-store route",
          startPlace: "E",
          endPlace: "F",
          estQty: 1,
        },
      ])
      .returning();
    [
      routeAId,
      routeBId,
      restrictRouteId,
      sameStoreOtherRouteId,
      otherStoreRouteId,
    ] = routes.map((route) => route.id);

    const [category] = await db
      .insert(costCategoriesTable)
      .values({
        code: `V1_UNLOCK_${nonce}`,
        name: "V1 unlock category",
        sortOrder: 999,
      })
      .returning();
    categoryId = category.id;

    const uniqueCategories = await db
      .insert(costCategoriesTable)
      .values([
        {
          code: `V1_ROUTE_UNIQUE_${nonce}`,
          name: "V1 route unique category",
          sortOrder: 1000,
        },
        {
          code: `V1_TRIPWIDE_UNIQUE_${nonce}`,
          name: "V1 trip-wide unique category",
          sortOrder: 1001,
        },
      ])
      .returning();
    [routeUniqueCategoryId, tripwideUniqueCategoryId] = uniqueCategories.map(
      (category) => category.id,
    );

    const [entry] = await db
      .insert(costEntriesTable)
      .values({
        storeId,
        tripId,
        mode: "ESTIMATE",
        categoryId,
        currency: "TWD",
        originalAmount: "100",
      })
      .returning();
    entryId = entry.id;
  });

  after(async () => {
    const tripIds = [
      tripId,
      apiHepTripId,
      dbHepTripId,
      sameStoreOtherTripId,
      otherStoreTripId,
    ].filter(Boolean);
    if (tripIds.length > 0) {
      await db
        .delete(costEntriesTable)
        .where(inArray(costEntriesTable.tripId, tripIds));
      await db
        .delete(tripRoutesTable)
        .where(inArray(tripRoutesTable.tripId, tripIds));
      await db.delete(tripsTable).where(inArray(tripsTable.id, tripIds));
    }
    const storeIds = [storeId, otherStoreId].filter(Boolean);
    if (storeIds.length > 0) {
      await db.delete(storesTable).where(inArray(storesTable.id, storeIds));
    }
    const categoryIds = [
      categoryId,
      routeUniqueCategoryId,
      tripwideUniqueCategoryId,
    ].filter(Boolean);
    if (categoryIds.length > 0) {
      await db
        .delete(costCategoriesTable)
        .where(inArray(costCategoriesTable.id, categoryIds));
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": MERCHANT_ID,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  }

  test("close, unlock, and edit estimate keeps the permanent modified flag", async () => {
    const close = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/close`,
    );
    assert.equal(close.status, 200);
    assert.equal(close.data.status, "CLOSED");
    assert.equal(close.data.estimateLocked, true);

    const lockedCreate = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ESTIMATE",
        categoryId: String(categoryId),
        currency: "TWD",
        originalAmount: "200",
      },
    );
    assert.equal(lockedCreate.status, 409, JSON.stringify(lockedCreate.data));

    const unlock = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/unlock-estimate`,
    );
    assert.equal(unlock.status, 200);
    assert.equal(unlock.data.status, "CLOSED");
    assert.equal(unlock.data.estimateLocked, false);
    assert.equal(unlock.data.estimateModifiedAfterLock, true);

    const edit = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/cost-entries/${entryId}`,
      { originalAmount: "150" },
    );
    assert.equal(edit.status, 200);
    assert.equal(edit.data.originalAmount, "150.000000000000");

    const operatingInput = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/operating-inputs`,
      {
        exchangeRate: "0.25",
        totalItemQuantity: "700",
        unitGrossProfitTwd: "130",
      },
    );
    assert.equal(operatingInput.status, 200);
    assert.equal(operatingInput.data.totalItemQuantity, 700);
    assert.equal(operatingInput.data.unitGrossProfitTwd, "130.000000000000");
    assert.equal(operatingInput.data.estimateModifiedAfterLock, true);

    const [storedTrip] = await db
      .select({
        estimateLocked: tripsTable.estimateLocked,
        estimateModifiedAfterLock: tripsTable.estimateModifiedAfterLock,
      })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, tripId), eq(tripsTable.storeId, storeId)));
    assert.equal(storedTrip.estimateLocked, false);
    assert.equal(storedTrip.estimateModifiedAfterLock, true);

    const relock = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/close`,
    );
    assert.equal(relock.status, 200);
    assert.equal(relock.data.estimateLocked, true);
    assert.equal(relock.data.estimateModifiedAfterLock, true);
  });

  test("PATCH cannot change an existing cost entry mode", async () => {
    const unlock = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/unlock-estimate`,
    );
    assert.equal(unlock.status, 200);
    assert.equal(unlock.data.estimateLocked, false);
    assert.equal(unlock.data.estimateModifiedAfterLock, true);

    const response = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/cost-entries/${entryId}`,
      { mode: "ACTUAL" },
    );
    assert.equal(response.status, 400);
    assert.equal(response.data.error, "Cost entry mode cannot be changed");
  });

  test("operating-inputs accepts HEP days 4 through 14 and nullable clearing", async () => {
    for (const hepDays of [4, 9, 14]) {
      const response = await request(
        "PATCH",
        `/stores/${storeId}/trips/${apiHepTripId}/operating-inputs`,
        { hepDays },
      );
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.equal(response.data.hepDays, hepDays);
    }

    for (const hepDays of [3, 15]) {
      const response = await request(
        "PATCH",
        `/stores/${storeId}/trips/${apiHepTripId}/operating-inputs`,
        { hepDays },
      );
      assert.equal(response.status, 400, JSON.stringify(response.data));
      assert.equal(response.data.error, "Invalid operating input");
    }

    const cleared = await request(
      "PATCH",
      `/stores/${storeId}/trips/${apiHepTripId}/operating-inputs`,
      { hepDays: null },
    );
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
    assert.equal(cleared.data.hepDays, null);

    const [storedTrip] = await db
      .select({ hepDays: tripsTable.hepDays })
      .from(tripsTable)
      .where(eq(tripsTable.id, apiHepTripId));
    assert.equal(storedTrip.hepDays, null);
  });

  test("trips HEP day CHECK accepts 4 through 14 and rejects outside values", async () => {
    for (const hepDays of [4, 9, 14, null]) {
      await db
        .update(tripsTable)
        .set({ hepDays })
        .where(eq(tripsTable.id, dbHepTripId));
      const [storedTrip] = await db
        .select({ hepDays: tripsTable.hepDays })
        .from(tripsTable)
        .where(eq(tripsTable.id, dbHepTripId));
      assert.equal(storedTrip.hepDays, hepDays);
    }

    for (const hepDays of [3, 15]) {
      await assert.rejects(
        async () => {
          await db
            .update(tripsTable)
            .set({ hepDays })
            .where(eq(tripsTable.id, dbHepTripId));
        },
        (error) => {
          const databaseError = error.cause ?? error;
          assert.equal(databaseError.code, "23514");
          assert.equal(databaseError.constraint, "trips_hep_days_valid");
          return true;
        },
      );
    }
  });

  test("cost entries round-trip a route tag and preserve trip-wide null semantics", async () => {
    const tagged = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ACTUAL",
        customLabel: "V1 phase21 tagged receipt",
        currency: "JPY",
        originalAmount: "1200",
        tripRouteId: routeAId,
      },
    );
    assert.equal(tagged.status, 201, JSON.stringify(tagged.data));
    assert.equal(tagged.data.tripRouteId, routeAId);

    const tripwide = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ACTUAL",
        customLabel: "V1 phase21 trip-wide receipt",
        currency: "TWD",
        originalAmount: "300",
      },
    );
    assert.equal(tripwide.status, 201, JSON.stringify(tripwide.data));
    assert.equal(tripwide.data.tripRouteId, null);

    const list = await request(
      "GET",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
    );
    assert.equal(list.status, 200, JSON.stringify(list.data));
    assert.equal(
      list.data.find((entry) => entry.id === tagged.data.id)?.tripRouteId,
      routeAId,
    );
    assert.equal(
      list.data.find((entry) => entry.id === tripwide.data.id)?.tripRouteId,
      null,
    );

    const unchanged = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/cost-entries/${tagged.data.id}`,
      { description: "route tag stays when omitted" },
    );
    assert.equal(unchanged.status, 200, JSON.stringify(unchanged.data));
    assert.equal(unchanged.data.tripRouteId, routeAId);

    const cleared = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/cost-entries/${tagged.data.id}`,
      { tripRouteId: null },
    );
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
    assert.equal(cleared.data.tripRouteId, null);

    const [storedTripwide, storedCleared] = await Promise.all([
      db
        .select({ tripRouteId: costEntriesTable.tripRouteId })
        .from(costEntriesTable)
        .where(eq(costEntriesTable.id, tripwide.data.id))
        .then(([entry]) => entry),
      db
        .select({ tripRouteId: costEntriesTable.tripRouteId })
        .from(costEntriesTable)
        .where(eq(costEntriesTable.id, tagged.data.id))
        .then(([entry]) => entry),
    ]);
    assert.equal(storedTripwide.tripRouteId, null);
    assert.equal(storedCleared.tripRouteId, null);
  });

  test("cost entry route tags reject routes from another trip or store", async () => {
    for (const tripRouteId of [sameStoreOtherRouteId, otherStoreRouteId]) {
      const rejected = await request(
        "POST",
        `/stores/${storeId}/trips/${tripId}/cost-entries`,
        {
          mode: "ACTUAL",
          customLabel: `V1 phase21 rejected route ${tripRouteId}`,
          currency: "TWD",
          originalAmount: "50",
          tripRouteId,
        },
      );
      assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
      assert.equal(rejected.data.error, "Invalid tripRouteId");
    }

    const valid = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ACTUAL",
        customLabel: "V1 phase21 patch guard",
        currency: "TWD",
        originalAmount: "75",
        tripRouteId: routeAId,
      },
    );
    assert.equal(valid.status, 201, JSON.stringify(valid.data));

    const rejectedPatch = await request(
      "PATCH",
      `/stores/${storeId}/trips/${tripId}/cost-entries/${valid.data.id}`,
      { tripRouteId: sameStoreOtherRouteId },
    );
    assert.equal(rejectedPatch.status, 400, JSON.stringify(rejectedPatch.data));
    assert.equal(rejectedPatch.data.error, "Invalid tripRouteId");

    const [stored] = await db
      .select({ tripRouteId: costEntriesTable.tripRouteId })
      .from(costEntriesTable)
      .where(eq(costEntriesTable.id, valid.data.id));
    assert.equal(stored.tripRouteId, routeAId);
  });

  test("estimate uniqueness distinguishes route-specific and trip-wide entries", async () => {
    for (const tripRouteId of [routeAId, routeBId]) {
      const created = await request(
        "POST",
        `/stores/${storeId}/trips/${tripId}/cost-entries`,
        {
          mode: "ESTIMATE",
          categoryId: String(routeUniqueCategoryId),
          currency: "JPY",
          originalAmount: "100",
          tripRouteId,
        },
      );
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.tripRouteId, tripRouteId);
    }

    const duplicateRoute = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ESTIMATE",
        categoryId: String(routeUniqueCategoryId),
        currency: "JPY",
        originalAmount: "200",
        tripRouteId: routeAId,
      },
    );
    assert.equal(
      duplicateRoute.status,
      409,
      JSON.stringify(duplicateRoute.data),
    );

    const tripwideBody = {
      mode: "ESTIMATE",
      categoryId: String(tripwideUniqueCategoryId),
      currency: "TWD",
      originalAmount: "500",
    };
    const firstTripwide = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      tripwideBody,
    );
    assert.equal(firstTripwide.status, 201, JSON.stringify(firstTripwide.data));
    assert.equal(firstTripwide.data.tripRouteId, null);

    const duplicateTripwide = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      tripwideBody,
    );
    assert.equal(
      duplicateTripwide.status,
      409,
      JSON.stringify(duplicateTripwide.data),
    );
  });

  test("a route referenced by a cost entry is protected by the restrict foreign key", async () => {
    const tagged = await request(
      "POST",
      `/stores/${storeId}/trips/${tripId}/cost-entries`,
      {
        mode: "ACTUAL",
        customLabel: "V1 phase21 restrict receipt",
        currency: "JPY",
        originalAmount: "900",
        tripRouteId: restrictRouteId,
      },
    );
    assert.equal(tagged.status, 201, JSON.stringify(tagged.data));

    await assert.rejects(
      async () => {
        await db
          .delete(tripRoutesTable)
          .where(eq(tripRoutesTable.id, restrictRouteId));
      },
      (error) => {
        const databaseError = error.cause ?? error;
        assert.equal(databaseError.code, "23503");
        assert.equal(
          databaseError.constraint,
          "cost_entries_trip_route_id_trip_routes_id_fk",
        );
        return true;
      },
    );

    const [storedRoute] = await db
      .select({ id: tripRoutesTable.id })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, restrictRouteId));
    assert.equal(storedRoute.id, restrictRouteId);
  });
}
