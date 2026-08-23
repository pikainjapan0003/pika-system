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
    ordersTable,
    pool,
    productsTable,
    storesTable,
    tripRoutesTable,
    tripsTable,
  } = await import("@workspace/db");
  const { default: fixedCostSummaryRouter } =
    await import("./fixedCostSummary.ts");
  const { default: chartDataRouter } = await import("./chartData.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", fixedCostSummaryRouter);
  app.use("/api", chartDataRouter);

  let server;
  let baseUrl;
  let storeId;
  let otherStoreId;
  let tripId;
  let customEntryId;
  // Chart data fixtures (batch 25): G sensitivity + H history trend.
  let chartTripGId;
  let chartTripH1Id;
  let chartTripH2Id;
  let chartTripH3Id;
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
        actualExchangeRate: "0.2",
        workingDays: 10,
        totalItemQuantity: 700,
        unitGrossProfitTwd: "130",
        dailyGrossProfitTwd: "8000",
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
        {
          code: `V1_PHASE17_VARIABLE_COMPARISON_${nonce}`,
          name: "V1 variable comparison",
          kind: "VARIABLE",
          sortOrder: 1000,
        },
      ])
      .returning();
    categoryIds.push(...categories.map((category) => category.id));

    const insertedEntries = await db
      .insert(costEntriesTable)
      .values([
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
      ])
      .returning({ id: costEntriesTable.id });
    customEntryId = insertedEntries[0].id;

    await db
      .insert(operatingSettingsTable)
      .values({ id: 1, referenceDailyWage: "1500" })
      .onConflictDoUpdate({
        target: operatingSettingsTable.id,
        set: { referenceDailyWage: "1500" },
      });

    // --- chart G fixtures (sensitivity heatmap) ---
    const [chartTripG] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "BATCH-25 chart G pending trip",
        exchangeRate: "0.2",
      })
      .returning();
    chartTripGId = chartTripG.id;

    // --- chart H fixtures (history trend) ---
    const [chartTripH1] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "BATCH-25 chart H trip 1",
        startDate: "2026-01-10",
        exchangeRate: "0.2",
        actualExchangeRate: "0.2",
        workingDays: 10,
        totalItemQuantity: 100,
        unitGrossProfitTwd: "50",
        creditCardRebateTwd: "0",
      })
      .returning();
    chartTripH1Id = chartTripH1.id;
    const [chartTripH2] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "BATCH-25 chart H trip 2",
        startDate: "2026-01-15",
        exchangeRate: "0.2",
        actualExchangeRate: "0.2",
        workingDays: 10,
        totalItemQuantity: 50,
        unitGrossProfitTwd: "50",
        creditCardRebateTwd: "0",
      })
      .returning();
    chartTripH2Id = chartTripH2.id;
    const [chartTripH3] = await db
      .insert(tripsTable)
      .values({
        storeId,
        name: "BATCH-25 chart H pending trip",
        startDate: "2026-02-03",
        exchangeRate: "0.2",
        actualExchangeRate: "0.2",
        workingDays: 10,
        totalItemQuantity: null,
        unitGrossProfitTwd: null,
        creditCardRebateTwd: "0",
      })
      .returning();
    chartTripH3Id = chartTripH3.id;
    await db.insert(costEntriesTable).values([
      {
        storeId,
        tripId: chartTripH1Id,
        mode: "ACTUAL",
        categoryId: categoryIds[0],
        currency: "JPY",
        originalAmount: "200",
      },
      {
        storeId,
        tripId: chartTripH1Id,
        mode: "ACTUAL",
        categoryId: categoryIds[1],
        currency: "TWD",
        originalAmount: "100",
      },
      {
        storeId,
        tripId: chartTripH1Id,
        mode: "ACTUAL",
        categoryId: categoryIds[2],
        currency: "TWD",
        originalAmount: "500",
      },
      {
        storeId,
        tripId: chartTripH2Id,
        mode: "ACTUAL",
        categoryId: categoryIds[0],
        currency: "JPY",
        originalAmount: "300",
      },
    ]);
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

  async function request(userId = OWNER_ID, mode = "ESTIMATE") {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/operating-summary?mode=${mode}`,
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
    assert.equal(
      response.data.tripProfit.projections.unit.grossProfitSource,
      "UNIT",
    );
    assert.equal(
      response.data.tripProfit.projections.daily.grossProfitSource,
      "DAILY",
    );
    assert.equal(
      response.data.tripProfit.purchaseCostPrincipalTwd,
      "1000.000000000000",
    );
    assert.equal(
      response.data.tripProfit.projections.unit.grossProfitTwd,
      "91000.000000000000",
    );
    assert.equal(
      response.data.tripProfit.projections.daily.grossProfitTwd,
      "80000.000000000000",
    );
    assert.equal(
      response.data.tripProfit.operatingExpenseTwd,
      "30.450000000000",
    );
    assert.equal(
      response.data.tripProfit.projections.unit.finalOperatingProfitTwd,
      "90969.550000000000",
    );
    assert.equal(
      response.data.tripProfit.projections.daily.finalOperatingProfitTwd,
      "79969.550000000000",
    );
    assert.equal(
      response.data.tripProfit.projections.unit.outcome,
      "SALARY_TARGET_MET",
    );
  });

  test("a custom JPY entry costs the same in its FIXED default and a VARIABLE comparison", async () => {
    const fixedResponse = await request();
    assert.equal(fixedResponse.status, 200, JSON.stringify(fixedResponse.data));

    await db
      .update(costEntriesTable)
      .set({ categoryId: categoryIds[3], customLabel: null })
      .where(eq(costEntriesTable.id, customEntryId));
    try {
      const variableResponse = await request();
      assert.equal(
        variableResponse.status,
        200,
        JSON.stringify(variableResponse.data),
      );
      assert.equal(fixedResponse.data.sections.fixed.entries.length, 1);
      assert.equal(variableResponse.data.sections.fixed.entries.length, 0);
      assert.equal(fixedResponse.data.sections.variable.entries.length, 1);
      assert.equal(variableResponse.data.sections.variable.entries.length, 2);
      assert.equal(
        fixedResponse.data.tripProfit.operatingExpenseTwd,
        variableResponse.data.tripProfit.operatingExpenseTwd,
      );
      assert.equal(
        fixedResponse.data.tripProfit.paymentFeeTwd,
        "0.450000000000",
      );
      assert.equal(
        variableResponse.data.tripProfit.paymentFeeTwd,
        "0.450000000000",
      );
    } finally {
      await db
        .update(costEntriesTable)
        .set({ categoryId: null, customLabel: "自訂支出" })
        .where(eq(costEntriesTable.id, customEntryId));
    }
  });

  test("missing UNIT inputs leave UNIT pending without blocking DAILY", async () => {
    await db
      .update(tripsTable)
      .set({ unitGrossProfitTwd: null, totalItemQuantity: null })
      .where(eq(tripsTable.id, tripId));

    const response = await request();

    assert.equal(response.status, 200);
    assert.equal(response.data.status, "ready");
    assert.equal(
      response.data.tripProfit.projections.unit.reason,
      "缺少單件毛利或預估件數",
    );
    assert.equal(response.data.tripProfit.projections.daily.status, "ready");
    assert.equal(response.data.sections.fixed.totalTwd, "20.000000000000");
    assert.equal(
      response.data.tripProfit.projections.unit.grossProfitTwd,
      undefined,
    );

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

  test("ACTUAL summary groups route and trip-wide costs and counts only linked orders in four approved statuses", async () => {
    const nonce = Date.now();
    const [routeA, routeB, routeC] = await db
      .insert(tripRoutesTable)
      .values([
        {
          storeId,
          tripId,
          areaTitle: `V1 phase22 route A ${nonce}`,
          startPlace: "A",
          endPlace: "B",
          estQty: 10,
        },
        {
          storeId,
          tripId,
          areaTitle: `V1 phase22 route B ${nonce}`,
          startPlace: "B",
          endPlace: "C",
          estQty: 10,
        },
        {
          storeId,
          tripId,
          areaTitle: `V1 phase22 route C ${nonce}`,
          startPlace: "C",
          endPlace: "D",
          estQty: 10,
        },
      ])
      .returning();
    const [productA, exemptProduct, productB, productC, unlinkedProduct] =
      await db
        .insert(productsTable)
        .values([
          {
            storeId,
            name: "V1 phase22 product A",
            price: "600",
            shareToken: `v1-phase22-product-a-${nonce}`,
            costJpy: "1000",
            tripRouteId: routeA.id,
          },
          {
            storeId,
            name: "V1 phase22 exempt product",
            price: "500",
            shareToken: `v1-phase22-exempt-${nonce}`,
            costJpy: "500",
            tripRouteId: routeA.id,
            isTransportCostExempt: true,
          },
          {
            storeId,
            name: "V1 phase22 product B",
            price: "700",
            shareToken: `v1-phase22-product-b-${nonce}`,
            costJpy: "1500",
            tripRouteId: routeB.id,
          },
          {
            storeId,
            name: "V1 phase22 product C without actual orders",
            price: "100",
            shareToken: `v1-phase22-product-c-${nonce}`,
            costJpy: "0",
            tripRouteId: routeC.id,
          },
          {
            storeId,
            name: "V1 phase22 unlinked product",
            price: "300",
            shareToken: `v1-phase22-unlinked-${nonce}`,
            costJpy: "100",
            tripRouteId: null,
          },
        ])
        .returning();
    const orderValues = [
      [productA.id, "awaiting_payment", 2],
      [productA.id, "preparing", 3],
      [exemptProduct.id, "shipped", 1],
      [productB.id, "completed", 4],
      [productA.id, "pending", 90],
      [productB.id, "cancelled", 80],
      [unlinkedProduct.id, "completed", 70],
    ].map(([productId, status, quantity], index) => ({
      storeId,
      productId,
      publicToken: `v1-phase22-order-${nonce}-${index}`,
      buyerName: "測試買家",
      buyerPhone: "0900000000",
      pickupMethod: "面交",
      status,
      quantity,
      unitPrice: "100",
      totalPrice: String(quantity * 100),
    }));
    await db.insert(ordersTable).values(orderValues);
    await db.insert(costEntriesTable).values([
      {
        storeId,
        tripId,
        tripRouteId: routeA.id,
        mode: "ACTUAL",
        categoryId: null,
        customLabel: "A 路線日圓成本",
        currency: "JPY",
        originalAmount: "1000",
      },
      {
        storeId,
        tripId,
        tripRouteId: routeA.id,
        mode: "ACTUAL",
        categoryId: null,
        customLabel: "A 路線台幣成本",
        currency: "TWD",
        originalAmount: "50",
      },
      {
        storeId,
        tripId,
        tripRouteId: routeB.id,
        mode: "ACTUAL",
        categoryId: null,
        customLabel: "B 路線台幣成本",
        currency: "TWD",
        originalAmount: "300",
      },
      {
        storeId,
        tripId,
        tripRouteId: null,
        mode: "ACTUAL",
        categoryId: null,
        customLabel: "整趟共用成本",
        currency: "JPY",
        originalAmount: "500",
      },
      {
        storeId,
        tripId,
        tripRouteId: routeA.id,
        mode: "ACTUAL",
        categoryId: null,
        customLabel: "已作廢成本",
        currency: "JPY",
        originalAmount: "9999",
        status: "VOID",
      },
    ]);

    const response = await request(OWNER_ID, "ACTUAL");

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.actualRollup.status, "pending_confirmation");
    assert.equal(response.data.actualRollup.totalActualQuantity, "10");
    assert.deepEqual(
      response.data.actualRollup.routes.map((route) => [
        route.tripRouteId,
        route.actualQuantity,
        route.costs.totalTwd,
      ]),
      [
        [routeA.id, "6", "250.000000000000"],
        [routeB.id, "4", "300.000000000000"],
        [routeC.id, "0", "0.000000000000"],
      ],
    );
    assert.equal(
      response.data.actualRollup.tripWide.originalJpyTotal,
      "500.000000000000",
    );
    assert.equal(
      response.data.actualRollup.tripWide.totalTwd,
      "100.000000000000",
    );
    assert.equal(response.data.totalItemQuantity, 700);

    const responseRouteA = response.data.actualRollup.routes.find(
      (route) => route.tripRouteId === routeA.id,
    );
    const responseProductA = responseRouteA.products.find(
      (product) => product.productId === productA.id,
    );
    const responseExemptProduct = responseRouteA.products.find(
      (product) => product.productId === exemptProduct.id,
    );
    assert.deepEqual(responseProductA.actualUnitProfit, {
      status: "ready",
      routeActualUnitTransportCostTwd: "41.666666666667",
      allocatedActualUnitTransportCostTwd: "41.666666666667",
      productCostTwd: "200.000000000000",
      actualUnitProfitTwd: "358.333333333333",
    });
    assert.equal(
      responseExemptProduct.actualUnitProfit.actualUnitProfitTwd,
      "400.000000000000",
    );
    assert.equal(
      responseExemptProduct.actualUnitProfit
        .allocatedActualUnitTransportCostTwd,
      "0.000000000000",
    );

    const responseRouteC = response.data.actualRollup.routes.find(
      (route) => route.tripRouteId === routeC.id,
    );
    assert.deepEqual(responseRouteC.products[0].actualUnitProfit, {
      status: "pending_confirmation",
      label: "待確認",
      reason: "missing_actual_quantity",
    });
    assert.equal(
      response.data.actualRollup.routes.some((route) =>
        route.products.some(
          (product) => product.productId === unlinkedProduct.id,
        ),
      ),
      false,
    );
  });
  test("chart G sensitivity heatmap inverts breakeven across the swept grid", async () => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=90,120,150,180,210&unitGrossProfits=40,60,80,100,120`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ready");
    // fixed 100 JPY x 0.2 = 20; variable 50 JPY x 0.2 = 10; fee base 30; fee 0.45; rebate 0
    assert.equal(body.netCostToRecoverTwd, "30.450000000000");
    assert.equal(body.breakevenQuantity, "1");
    assert.equal(body.salaryTargetQuantity, "116");
    assert.deepEqual(body.rows, ["90", "120", "150", "180", "210"]);
    assert.deepEqual(body.columns, ["40", "60", "80", "100", "120"]);
    assert.equal(body.cells.length, 5);
    assert.equal(body.cells[0].length, 5);
    assert.equal(body.cells[0][0], "3569.550000000000");
    assert.equal(body.cells[4][4], "25169.550000000000");
    assert.equal(body.cells[0][4], "10769.550000000000");
    assert.equal(JSON.stringify(body).includes("storeId"), false);
  });

  test("chart G reports loss cells as exact negative profits", async () => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=10&unitGrossProfits=2`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ready");
    assert.deepEqual(body.cells, [["-10.450000000000"]]);
  });

  test("chart G fails closed when breakeven inputs are missing", async () => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${chartTripGId}/charts/sensitivity-heatmap?quantities=90&unitGrossProfits=40`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, "pending_confirmation");
    assert.equal(body.label, "待確認");
    assert.equal(body.reason, "缺少損益平衡資料");
    assert.equal(body.netCostToRecoverTwd, null);
    assert.equal(body.breakevenQuantity, null);
    assert.equal(body.rows.length, 0);
    assert.equal(body.cells.length, 0);
  });

  test("chart G validates sweep parameters and store ownership", async () => {
    const missingParams = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(missingParams.status, 400);

    const invalidParams = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=90,abc&unitGrossProfits=40`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(invalidParams.status, 400);

    const negativeProfit = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=90&unitGrossProfits=-40`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(negativeProfit.status, 400);

    const oversized = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=${Array.from({ length: 21 }, (_, index) => index + 1).join(",")}&unitGrossProfits=40`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(oversized.status, 400);

    const crossStore = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=90&unitGrossProfits=40`,
      { headers: { "x-test-user-id": OTHER_OWNER_ID } },
    );
    assert.equal(crossStore.status, 403);

    const missingTrip = await fetch(
      `${baseUrl}/stores/${storeId}/trips/99999999/charts/sensitivity-heatmap?quantities=90&unitGrossProfits=40`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(missingTrip.status, 404);

    const unauthenticated = await fetch(
      `${baseUrl}/stores/${storeId}/trips/${tripId}/charts/sensitivity-heatmap?quantities=90&unitGrossProfits=40`,
    );
    assert.equal(unauthenticated.status, 401);
  });

  test("chart H history trend sums monthly actual profits and fails closed per month", async () => {
    const response = await fetch(
      `${baseUrl}/stores/${storeId}/charts/history-trend`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, "pending_confirmation");
    assert.equal(body.mode, "ACTUAL");
    assert.equal(JSON.stringify(body).includes("storeId"), false);

    const january = body.items.find((item) => item.month === "2026-01");
    assert.equal(january.status, "ready");
    assert.equal(january.tripCount, 2);
    // h1: 100 x 50 - (40 + 100 + 0.6) = 4859.4; h2: 50 x 50 - (60 + 0.9) = 2439.1
    assert.equal(january.profitTwd, "7298.500000000000");
    assert.equal(january.reason, null);

    const february = body.items.find((item) => item.month === "2026-02");
    assert.equal(february.status, "pending_confirmation");
    assert.equal(february.tripCount, 1);
    assert.equal(february.profitTwd, null);
    assert.equal(february.reason, "缺少單件毛利或預估件數");

    const months = body.items.map((item) => item.month).sort();
    assert.deepEqual(months.slice(0, 2), ["2026-01", "2026-02"]);
    // The pre-existing fixture trip (created just now, no startDate) may add
    // exactly one current-month bucket; never anything else.
    assert.equal(months.length, 3);
    assert.equal(months.includes("2026-01"), true);
    // No cross-store trips leak into the response.
    assert.equal(
      body.items.some((item) => item.tripCount > 0 && item.month === "2099-12"),
      false,
    );
  });

  test("chart H history trend enforces store ownership", async () => {
    const crossStore = await fetch(
      `${baseUrl}/stores/${storeId}/charts/history-trend`,
      { headers: { "x-test-user-id": OTHER_OWNER_ID } },
    );
    assert.equal(crossStore.status, 403);

    const missingStore = await fetch(
      `${baseUrl}/stores/99999999/charts/history-trend`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(missingStore.status, 404);

    const invalidStore = await fetch(
      `${baseUrl}/stores/not-a-number/charts/history-trend`,
      { headers: { "x-test-user-id": OWNER_ID } },
    );
    assert.equal(invalidStore.status, 400);

    const unauthenticated = await fetch(
      `${baseUrl}/stores/${storeId}/charts/history-trend`,
    );
    assert.equal(unauthenticated.status, 401);
  });
}
