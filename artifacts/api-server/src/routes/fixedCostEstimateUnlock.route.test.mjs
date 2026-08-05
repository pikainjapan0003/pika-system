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
    tripsTable,
  } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
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

    const [category] = await db
      .insert(costCategoriesTable)
      .values({
        code: `V1_UNLOCK_${nonce}`,
        name: "V1 unlock category",
        sortOrder: 999,
      })
      .returning();
    categoryId = category.id;

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
    if (storeId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    }
    if (categoryId) {
      await db
        .delete(costCategoriesTable)
        .where(eq(costCategoriesTable.id, categoryId));
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
      { exchangeRate: "0.25" },
    );
    assert.equal(operatingInput.status, 200);
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
}
