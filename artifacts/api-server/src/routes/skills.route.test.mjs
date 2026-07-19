/**
 * CI-only integration guard for the skill-state route and daily surface map.
 * Uses synthetic rows in the disposable DATABASE_URL created by CI.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "skill route integration requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const TEST_MERCHANT_ID = "batch10_skill_surface_fake_merchant";
  const OTHER_MERCHANT_ID = "batch11_skill_surface_other_merchant";

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
  const { db, pool, productsTable, storesTable, tripRoutesTable, tripsTable } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { resolveDailySkillSurfaceVisibility } =
    await import("../../../shop-app/src/lib/dailySkillVisibility.ts");
  const { default: skillsRouter } = await import("./skills.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", skillsRouter);

  let server;
  let baseUrl;
  let storeId;
  let tripId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [store] = await db
      .insert(storesTable)
      .values({
        merchantId: TEST_MERCHANT_ID,
        name: "BATCH-10 假店鋪",
        slug: `batch10-skill-${Date.now()}`,
      })
      .returning();
    storeId = store.id;

    const [trip] = await db
      .insert(tripsTable)
      .values({ name: "BATCH-10 假行程", exchangeRate: "0.2" })
      .returning();
    tripId = trip.id;

    const [route] = await db
      .insert(tripRoutesTable)
      .values({
        tripId,
        areaTitle: "BATCH-10 假路線",
        startPlace: "假起點",
        endPlace: "假終點",
        estQty: 1,
      })
      .returning();

    await db.insert(productsTable).values({
      storeId,
      name: "BATCH-10 假商品",
      price: "100.00",
      shareToken: `batch10-skill-product-${Date.now()}`,
      tripRouteId: route.id,
    });
  });

  after(async () => {
    if (storeId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    }
    if (tripId) {
      await db.delete(tripsTable).where(eq(tripsTable.id, tripId));
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": TEST_MERCHANT_ID,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }

  test("enabling the linked-route cost skill makes the trips surface visible", async () => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/skills/S-09/enable`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": TEST_MERCHANT_ID,
        },
        body: JSON.stringify({
          enabled: true,
          catalogVersion: 1,
          confirmImpact: true,
          confirmRisk: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      skillKey: "S-09",
      enabled: true,
    });
    assert.equal(
      resolveDailySkillSurfaceVisibility("trips", [
        { skillKey: "S-09", enabled: true, configured: true },
      ]),
      true,
    );
  });

  test("skill routes reject unauthenticated and cross-store requests", async () => {
    const unauthenticated = await fetch(`${baseUrl}/stores/${storeId}/skills`);
    assert.equal(unauthenticated.status, 401);

    const crossStore = await fetch(`${baseUrl}/stores/${storeId}/skills`, {
      headers: { "x-test-user-id": OTHER_MERCHANT_ID },
    });
    assert.equal(crossStore.status, 403);
  });

  test("direct enable rejects a stale catalog version", async () => {
    const { status, data } = await request(
      "POST",
      `/stores/${storeId}/skills/S-19/enable`,
      {
        enabled: true,
        catalogVersion: 0,
        confirmImpact: true,
        confirmRisk: true,
      },
    );
    assert.equal(status, 409);
    assert.equal(data.error, "Skill catalog changed; preview again");
  });

  test("direct enable rejects an unmet prerequisite", async () => {
    const { status, data } = await request(
      "POST",
      `/stores/${storeId}/skills/S-21/enable`,
      {
        enabled: true,
        catalogVersion: 1,
        confirmImpact: true,
        confirmRisk: true,
      },
    );
    assert.equal(status, 409);
    assert.equal(data.error, "Skill prerequisite is not ready");
    assert.equal(data.prerequisite.ready, false);
    assert.ok(data.prerequisite.missing.length > 0);
  });

  test("direct enable rejects a high-risk skill without both confirmations", async () => {
    const { status, data } = await request(
      "POST",
      `/stores/${storeId}/skills/S-19/enable`,
      { enabled: true, catalogVersion: 1, confirmImpact: true },
    );
    assert.equal(status, 409);
    assert.equal(data.error, "High-risk skill requires two confirmations");
  });

  test("package apply rejects stale catalogs and unknown package keys", async () => {
    const stale = await request(
      "POST",
      `/stores/${storeId}/skill-packages/beginner/apply`,
      { catalogVersion: 0 },
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error, "Skill catalog changed; preview again");

    const unknown = await request(
      "POST",
      `/stores/${storeId}/skill-packages/not-a-package/apply`,
      { catalogVersion: 1 },
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.error, "Skill package not found");
  });
}
