import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "nullable route fuel requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_ID = "v1p18_fuel_nullable_merchant";

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
  const { db, pool, productsTable, storesTable, tripsTable, tripRoutesTable } =
    await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { resolveProductTransportCost } =
    await import("../../../../lib/db/src/transport-cost/productTransportCost.ts");
  const { default: tripsRouter } = await import("./trips.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", tripsRouter);

  let server;
  let baseUrl;
  let storeId;
  let tripId;
  const routeIds = [];
  const productIds = [];

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
        name: "V1 Phase 18 fuel store",
        slug: `v1p18-fuel-${nonce}`,
      })
      .returning();
    storeId = store.id;

    const [trip] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "V1 Phase 18 fuel trip",
        exchangeRate: "0.205",
      })
      .returning();
    tripId = trip.id;
  });

  after(async () => {
    if (productIds.length > 0) {
      await db
        .delete(productsTable)
        .where(inArray(productsTable.id, productIds));
    }
    if (routeIds.length > 0) {
      await db
        .delete(tripRoutesTable)
        .where(inArray(tripRoutesTable.id, routeIds));
    }
    if (tripId) await db.delete(tripsTable).where(eq(tripsTable.id, tripId));
    if (storeId)
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
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
    return { status: response.status, data: await response.json() };
  }

  function routeBody(areaTitle, fuelJpy) {
    return {
      areaTitle,
      startPlace: "A",
      endPlace: "B",
      estQty: 10,
      etcJpy: 100,
      ...(fuelJpy === undefined ? {} : { fuelJpy }),
    };
  }

  async function createRoute(areaTitle, fuelJpy) {
    const response = await request(
      "POST",
      `/trips/${tripId}/routes`,
      routeBody(areaTitle, fuelJpy),
    );
    assert.equal(response.status, 201);
    routeIds.push(response.data.id);
    return response.data;
  }

  async function readStoredFuel(routeId) {
    const [stored] = await db
      .select({ fuelJpy: tripRoutesTable.fuelJpy })
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, routeId));
    return stored.fuelJpy;
  }

  test("POST without fuelJpy stores SQL NULL", async () => {
    const created = await createRoute("T7 omitted fuel");
    assert.equal(created.fuelJpy, null);
    assert.equal(await readStoredFuel(created.id), null);
  });

  test("PATCH fuelJpy null changes a stored value to SQL NULL", async () => {
    const created = await createRoute("T8 clear fuel", 88);
    assert.equal(await readStoredFuel(created.id), "88");

    const response = await request(
      "PATCH",
      `/trips/${tripId}/routes/${created.id}`,
      { fuelJpy: null },
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.fuelJpy, null);
    assert.equal(await readStoredFuel(created.id), null);
  });

  test("PATCH fuelJpy zero stores numeric zero instead of NULL", async () => {
    const created = await createRoute("T9 explicit zero");
    const response = await request(
      "PATCH",
      `/trips/${tripId}/routes/${created.id}`,
      { fuelJpy: 0 },
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.fuelJpy, 0);
    assert.equal(await readStoredFuel(created.id), "0");
  });

  test("GET returns a JSON null fuelJpy without coercing it", async () => {
    const created = await createRoute("T10 response null", null);
    const response = await request("GET", "/trips");
    assert.equal(response.status, 200);
    const trip = response.data.find((candidate) => candidate.id === tripId);
    const route = trip.routes.find((candidate) => candidate.id === created.id);
    assert.equal(route.fuelJpy, null);
    assert.equal(Object.hasOwn(route, "fuelJpy"), true);
  });

  test("clearing an attached route fuel makes product transport pending", async () => {
    const created = await createRoute("T16 attached route", 25);
    const [product] = await db
      .insert(productsTable)
      .values({
        storeId,
        name: "V1P18 transport product",
        price: "600",
        shareToken: `v1p18-product-${Date.now()}`,
        tripRouteId: created.id,
      })
      .returning();
    productIds.push(product.id);

    const response = await request(
      "PATCH",
      `/trips/${tripId}/routes/${created.id}`,
      { fuelJpy: null },
    );
    assert.equal(response.status, 200);
    const [storedRoute] = await db
      .select()
      .from(tripRoutesTable)
      .where(eq(tripRoutesTable.id, created.id));

    const result = resolveProductTransportCost({
      product: { tripRouteId: product.tripRouteId },
      route: storedRoute,
      trip: { id: tripId, exchangeRate: "0.205" },
    });
    assert.deepEqual(result, {
      status: "pending_confirmation",
      label: "待確認",
      reason: "missing_fuel_jpy",
    });
  });
}
