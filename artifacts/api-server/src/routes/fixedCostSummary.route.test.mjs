import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "operating summary sections require a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const OWNER_ID = "v1_phase17_summary_owner";
  const OTHER_OWNER_ID = "v1_phase17_summary_other";

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
  const { eq } = await import("drizzle-orm");
  const {
    costCategoriesTable,
    costEntriesTable,
    db,
    operatingSettingsTable,
    pool,
    storesTable,
    tripsTable,
  } = await import("@workspace/db");
  const { default: fixedCostSummaryRouter } =
    await import("./fixedCostSummary.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", fixedCostSummaryRouter);

  let server;
  let baseUrl;
  let storeId;
  let otherStoreId;
  let tripId;
  const categoryIds = [];

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    const nonce = Date.now();
    const [store, otherStore] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: OWNER_ID,
          name: "V1 phase17 summary store",
          slug: `v1-phase17-summary-${nonce}`,
        },
        {
          merchantId: OTHER_OWNER_ID,
          name: "V1 phase17 other store",
          slug: `v1-phase17-summary-other-${nonce}`,
        },
      ])
      .returning();
    storeId = store.id;
    otherStoreId = otherStore.id;

    const [trip] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "V1 phase17 summary trip",
        exchangeRate: "0.2",
        workingDays: 10,
        totalItemQuantity: 700,
        unitGrossProfitTwd: "130",
        creditCardRebateTwd: "0",
      })
      .returning();
    tripId = trip.id;

    const categories = await db
      .insert(costCategoriesTable)
      .values([
        {
          code: `V1_PHASE17_FIXED_${nonce}`,
          name: "V1 fixed",
          kind: "FIXED",
          sortOrder: 997,
        },
        {
          code: `V1_PHASE17_VARIABLE_${nonce}`,
          name: "V1 variable",
          kind: "VARIABLE",
          sortOrder: 998,
        },
        {
          code: `V1_PHASE17_PURCHASE_${nonce}`,
          name: "V1 purchase",
          kind: "PURCHASE",
          sortOrder: 999,
        },
      ])
      .returning();
    categoryIds.push(...categories.map((category) => category.id));

    await db.insert(costEntriesTable).values([
      {
        storeId,
        tripId,
        mode: "ESTIMATE",
        categoryId: null,
        customLabel: "自訂支出",
        currency: "JPY",
        originalAmount: "100",
      },
      {
        storeId,
        tripId,
        mode: "ESTIMATE",
        categoryId: categories[1].id,
        currency: "JPY",
        originalAmount: "50",
      },
      {
        storeId,
        tripId,
        mode: "ESTIMATE",
        categoryId: categories[2].id,
        currency: "TWD",
        originalAmount: "1000",
      },
    ]);

    await db
      .insert(operatingSettingsTable)
      .values({ id: 1, referenceDailyWage: "1500" })
      .onConflictDoUpdate({
        target: operatingSettingsTable.id,
        set: { referenceDailyWage: "1500" },
      });
  });

  after(async () => {
    if (storeId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeId));
    }
    if (otherStoreId) {
      await db.delete(storesTable).where(eq(storesTable.id, otherStoreId));
    }
    for (const categoryId of categoryIds) {
      await db
        .delete(costCategoriesTable)
        .where(eq(costCategoriesTable.id, categoryId));
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  async function request(userId = OWNER_ID) {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/operating-summary?mode=ESTIMATE`,
      { headers: { "x-test-user-id": userId } },
    );
    return { status: response.status, data: await response.json() };
  }

  test("operating summary partitions all sections and keeps custom entries in FIXED", async () => {
    const response = await request();

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.status, "ready");
    assert.equal(response.data.totalItemQuantity, 700);
    assert.equal(response.data.unitGrossProfitTwd, "130.000000000000");
    assert.equal(response.data.sections.fixed.entries.length, 1);
    assert.equal(
      response.data.sections.fixed.entries[0].categoryName,
      "自訂支出",
    );
    assert.equal(response.data.sections.fixed.entries[0].categoryKind, "FIXED");
    assert.equal(response.data.sections.variable.entries.length, 1);
    assert.equal(response.data.sections.purchase.entries.length, 1);
    assert.equal(response.data.sections.fixed.totalTwd, "20.000000000000");
    assert.equal(response.data.sections.fixed.paymentFeeTwd, "0.300000000000");
    assert.equal(response.data.sections.variable.totalTwd, "10.000000000000");
    assert.equal(
      response.data.sections.variable.paymentFeeTwd,
      "0.150000000000",
    );
    assert.equal(response.data.sections.purchase.totalTwd, "1000.000000000000");
    assert.equal(
      response.data.sections.purchase.paymentFeeTwd,
      "0.000000000000",
    );
    assert.equal(response.data.tripProfit.grossProfitSource, "UNIT");
    assert.equal(
      response.data.tripProfit.purchaseCostPrincipalTwd,
      "1000.000000000000",
    );
    assert.equal(response.data.tripProfit.grossProfitTwd, "91000.000000000000");
    assert.equal(
      response.data.tripProfit.operatingExpenseTwd,
      "30.450000000000",
    );
    assert.equal(
      response.data.tripProfit.finalOperatingProfitTwd,
      "90969.550000000000",
    );
    assert.equal(response.data.tripProfit.outcome, "SALARY_TARGET_MET");
  });

  test("missing unit gross or item quantity stays pending without synthesizing revenue", async () => {
    await db
      .update(tripsTable)
      .set({ unitGrossProfitTwd: null, totalItemQuantity: null })
      .where(eq(tripsTable.id, tripId));

    const response = await request();

    assert.equal(response.status, 200);
    assert.equal(response.data.status, "pending_confirmation");
    assert.equal(response.data.tripProfit.reason, "缺少單件毛利或預估件數");
    assert.equal(response.data.sections.fixed.totalTwd, "20.000000000000");
    assert.equal(response.data.tripProfit.grossProfitTwd, undefined);

    await db
      .update(tripsTable)
      .set({ unitGrossProfitTwd: "130", totalItemQuantity: 700 })
      .where(eq(tripsTable.id, tripId));
  });

  test("JPY entries without the selected mode exchange rate fail closed", async () => {
    await db
      .update(tripsTable)
      .set({ exchangeRate: null })
      .where(eq(tripsTable.id, tripId));

    const response = await request();

    assert.equal(response.status, 200);
    assert.equal(response.data.status, "pending_confirmation");
    assert.equal(response.data.sections.fixed.status, "pending_confirmation");
    assert.equal(response.data.sections.fixed.totalTwd, null);
    assert.equal(response.data.sections.fixed.paymentFeeTwd, null);
    assert.equal(response.data.tripProfit.status, "pending_confirmation");

    await db
      .update(tripsTable)
      .set({ exchangeRate: "0.2" })
      .where(eq(tripsTable.id, tripId));
  });

  test("another merchant cannot read the trip operating summary", async () => {
    const response = await request(OTHER_OWNER_ID);
    assert.equal(response.status, 403);
  });
}
