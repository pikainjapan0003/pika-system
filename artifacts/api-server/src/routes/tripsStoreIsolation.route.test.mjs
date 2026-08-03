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
  const { db, pool, storesTable, tripsTable, tripRoutesTable } =
    await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { default: tripsRouter } = await import("./trips.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", tripsRouter);

  let server;
  let baseUrl;
  let storeAId;
  let storeBId;
  let tripAId;
  let tripBId;
  let legacyTripId;
  let routeAId;

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
    return { status: response.status, data: await response.json() };
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
      [tripAId, legacyTripId].sort((a, b) => a - b),
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
}
