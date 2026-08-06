import { and, asc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  calculateFixedCostTotals,
  calculateSectionPaymentFeeTwd,
  calculateTripProfit,
  compareFixedCostEntries,
  costCategoriesTable,
  costEntriesTable,
  type CostCategoryKind,
  type CostEntryMode,
  db,
  DEFAULT_REFERENCE_DAILY_WAGE,
  operatingSettingsTable,
  pendingOperatingCost,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.ts";
import { loadTrip } from "./fixedCosts.ts";

const router = Router();

function serializeDecimal(value: any): string | null {
  return value == null ? null : value.toDecimalPlaces(12);
}

async function loadEntries(access: any, mode: CostEntryMode) {
  return db
    .select({
      entry: costEntriesTable,
      categoryName: costCategoriesTable.name,
      categoryKind: costCategoriesTable.kind,
    })
    .from(costEntriesTable)
    .leftJoin(
      costCategoriesTable,
      eq(costEntriesTable.categoryId, costCategoriesTable.id),
    )
    .where(
      and(
        eq(costEntriesTable.storeId, access.storeId),
        eq(costEntriesTable.tripId, access.tripId),
        eq(costEntriesTable.mode, mode),
      ),
    )
    .orderBy(asc(costEntriesTable.id));
}

function entryKind(row: any): CostCategoryKind {
  return row.categoryKind ?? "FIXED";
}

function serializeEntry(row: any) {
  return {
    ...row.entry,
    categoryName: row.categoryName ?? row.entry.customLabel,
    categoryKind: entryKind(row),
    originalAmount: String(row.entry.originalAmount),
  };
}

function serializeTotals(result: any) {
  if (result.status !== "ready") return result;
  return {
    status: "ready",
    fixedCostJpyOriginTwd: serializeDecimal(result.fixedCostJpyOriginTwd),
    fixedCostTwdDirectTwd: serializeDecimal(result.fixedCostTwdDirectTwd),
    fixedCostTotalTwd: serializeDecimal(result.fixedCostTotalTwd),
  };
}

function serializeSection(rows: any[], categories: any[], totals: any) {
  if (totals.status !== "ready") {
    return {
      ...totals,
      entries: rows.map(serializeEntry),
      categories,
      jpyOriginTwd: null,
      twdDirectTwd: null,
      totalTwd: null,
      paymentFeeTwd: null,
    };
  }
  return {
    status: "ready",
    entries: rows.map(serializeEntry),
    categories,
    jpyOriginTwd: serializeDecimal(totals.fixedCostJpyOriginTwd),
    twdDirectTwd: serializeDecimal(totals.fixedCostTwdDirectTwd),
    totalTwd: serializeDecimal(totals.fixedCostTotalTwd),
    paymentFeeTwd: serializeDecimal(
      calculateSectionPaymentFeeTwd(totals.fixedCostJpyOriginTwd),
    ),
  };
}

function serializeTripProfit(result: any) {
  if (result.status !== "ready") return result;
  return {
    status: "ready",
    outcome: result.outcome,
    grossProfitSource: result.grossProfitSource,
    customerDiscountTotalTwd: serializeDecimal(result.customerDiscountTotalTwd),
    adjustedRevenueTwd: serializeDecimal(result.adjustedRevenueTwd),
    grossProfitTwd: serializeDecimal(result.grossProfitTwd),
    grossMarginRate: serializeDecimal(result.grossMarginRate),
    fixedPaymentFeeTwd: serializeDecimal(result.fixedPaymentFeeTwd),
    variablePaymentFeeTwd: serializeDecimal(result.variablePaymentFeeTwd),
    purchasePaymentFeeTwd: serializeDecimal(result.purchasePaymentFeeTwd),
    paymentFeeTwd: serializeDecimal(result.paymentFeeTwd),
    operatingExpenseTwd: serializeDecimal(result.operatingExpenseTwd),
    operatingProfitBeforeAdjustmentsTwd: serializeDecimal(
      result.operatingProfitBeforeAdjustmentsTwd,
    ),
    finalOperatingProfitTwd: serializeDecimal(result.finalOperatingProfitTwd),
    salaryTargetTwd: serializeDecimal(result.salaryTargetTwd),
    fixedCostJpyOriginTwd: serializeDecimal(result.fixedCostJpyOriginTwd),
    fixedCostTwdDirectTwd: serializeDecimal(result.fixedCostTwdDirectTwd),
    fixedCostTotalTwd: serializeDecimal(result.fixedCostTotalTwd),
    variableCostJpyOriginTwd: serializeDecimal(result.variableCostJpyOriginTwd),
    variableCostTwdDirectTwd: serializeDecimal(result.variableCostTwdDirectTwd),
    variableCostTotalTwd: serializeDecimal(result.variableCostTotalTwd),
    purchaseCostJpyOriginTwd: serializeDecimal(result.purchaseCostJpyOriginTwd),
    purchaseCostTwdDirectTwd: serializeDecimal(result.purchaseCostTwdDirectTwd),
    purchaseCostPrincipalTwd: serializeDecimal(result.purchaseCostPrincipalTwd),
  };
}

router.get(
  "/stores/:storeId/trips/:tripId/operating-summary",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const mode =
      req.query.mode === "ACTUAL"
        ? "ACTUAL"
        : req.query.mode === "ESTIMATE"
          ? "ESTIMATE"
          : null;
    if (!mode)
      return res.status(400).json({ error: "mode must be ESTIMATE or ACTUAL" });
    const rows = await loadEntries(access, mode);
    const categories = await db
      .select()
      .from(costCategoriesTable)
      .orderBy(asc(costCategoriesTable.sortOrder));
    const exchangeRate =
      mode === "ESTIMATE"
        ? access.trip.exchangeRate
        : access.trip.actualExchangeRate;
    const rowsByKind = Object.fromEntries(
      (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
        kind,
        rows.filter((row) => entryKind(row) === kind),
      ]),
    ) as Record<CostCategoryKind, any[]>;
    const categoriesByKind = Object.fromEntries(
      (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
        kind,
        categories.filter((category) => category.kind === kind),
      ]),
    ) as Record<CostCategoryKind, any[]>;
    const totalsByKind = Object.fromEntries(
      (["FIXED", "VARIABLE", "PURCHASE"] as const).map((kind) => [
        kind,
        calculateFixedCostTotals({
          entries: rowsByKind[kind].map((row) => ({
            ...row.entry,
            originalAmount: String(row.entry.originalAmount),
          })),
          exchangeRate,
        }),
      ]),
    ) as Record<CostCategoryKind, ReturnType<typeof calculateFixedCostTotals>>;

    const [settings] = await db
      .select({ referenceDailyWage: operatingSettingsTable.referenceDailyWage })
      .from(operatingSettingsTable)
      .where(eq(operatingSettingsTable.id, 1))
      .limit(1);
    const allSectionsReady = Object.values(totalsByKind).every(
      (totals) => totals.status === "ready",
    );
    let tripProfit: ReturnType<typeof calculateTripProfit>;
    if (
      access.trip.unitGrossProfitTwd == null ||
      access.trip.totalItemQuantity == null
    ) {
      tripProfit = pendingOperatingCost("缺少單件毛利或預估件數");
    } else if (!allSectionsReady) {
      tripProfit = Object.values(totalsByKind).find(
        (totals) => totals.status !== "ready",
      ) as ReturnType<typeof calculateTripProfit>;
    } else {
      const fixed = totalsByKind.FIXED as Extract<
        (typeof totalsByKind)["FIXED"],
        { status: "ready" }
      >;
      const variable = totalsByKind.VARIABLE as Extract<
        (typeof totalsByKind)["VARIABLE"],
        { status: "ready" }
      >;
      const purchase = totalsByKind.PURCHASE as Extract<
        (typeof totalsByKind)["PURCHASE"],
        { status: "ready" }
      >;
      tripProfit = calculateTripProfit({
        fixedCostJpyOriginTwd: fixed.fixedCostJpyOriginTwd.toDecimalPlaces(12),
        fixedCostTwdDirectTwd: fixed.fixedCostTwdDirectTwd.toDecimalPlaces(12),
        variableCostJpyOriginTwd:
          variable.fixedCostJpyOriginTwd.toDecimalPlaces(12),
        variableCostTwdDirectTwd:
          variable.fixedCostTwdDirectTwd.toDecimalPlaces(12),
        purchaseCostJpyOriginTwd:
          purchase.fixedCostJpyOriginTwd.toDecimalPlaces(12),
        purchaseCostTwdDirectTwd:
          purchase.fixedCostTwdDirectTwd.toDecimalPlaces(12),
        unitGrossProfitTwd: String(access.trip.unitGrossProfitTwd),
        estimatedItemQuantity: access.trip.totalItemQuantity,
        creditCardRebateTwd: String(access.trip.creditCardRebateTwd),
        workingDays: access.trip.workingDays,
        referenceDailyWageTwd:
          settings?.referenceDailyWage ?? DEFAULT_REFERENCE_DAILY_WAGE,
      });
    }

    return res.json({
      status: tripProfit.status,
      mode,
      exchangeRate: exchangeRate == null ? null : String(exchangeRate),
      totalItemQuantity: access.trip.totalItemQuantity,
      unitGrossProfitTwd:
        access.trip.unitGrossProfitTwd == null
          ? null
          : String(access.trip.unitGrossProfitTwd),
      entries: rows.map(serializeEntry),
      categories,
      totals: serializeTotals(totalsByKind.FIXED),
      sections: {
        fixed: serializeSection(
          rowsByKind.FIXED,
          categoriesByKind.FIXED,
          totalsByKind.FIXED,
        ),
        variable: serializeSection(
          rowsByKind.VARIABLE,
          categoriesByKind.VARIABLE,
          totalsByKind.VARIABLE,
        ),
        purchase: serializeSection(
          rowsByKind.PURCHASE,
          categoriesByKind.PURCHASE,
          totalsByKind.PURCHASE,
        ),
      },
      tripProfit: serializeTripProfit(tripProfit),
      estimateLocked: Boolean(access.trip.estimateLocked),
      estimateModifiedAfterLock: Boolean(access.trip.estimateModifiedAfterLock),
    });
  },
);

router.get(
  "/stores/:storeId/trips/:tripId/fixed-cost-comparison",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const [estimateRows, actualRows] = await Promise.all([
      loadEntries(access, "ESTIMATE"),
      loadEntries(access, "ACTUAL"),
    ]);
    const estimateRate = access.trip.exchangeRate;
    const actualRate = access.trip.actualExchangeRate;
    const comparison = compareFixedCostEntries(
      estimateRows.map((row) => ({
        ...row.entry,
        categoryName: row.categoryName ?? row.entry.customLabel,
        originalAmount: String(row.entry.originalAmount),
      })),
      actualRows.map((row) => ({
        ...row.entry,
        categoryName: row.categoryName ?? row.entry.customLabel,
        originalAmount: String(row.entry.originalAmount),
      })),
      { estimated: estimateRate, actual: actualRate },
    );
    if (comparison.status !== "ready") {
      return res.json({
        ...comparison,
        estimateExchangeRate:
          estimateRate == null ? null : String(estimateRate),
        actualExchangeRate: actualRate == null ? null : String(actualRate),
        rows: [],
      });
    }
    const rows = comparison.rows;
    return res.json({
      status: "ready",
      estimateExchangeRate: estimateRate == null ? null : String(estimateRate),
      actualExchangeRate: actualRate == null ? null : String(actualRate),
      rows: rows.map((row) => ({
        key: row.key,
        label: row.label,
        state: row.state,
        estimatedTwd: serializeDecimal(row.estimatedTwd),
        actualTwd: serializeDecimal(row.actualTwd),
        variance: row.variance
          ? {
              status: row.variance.status,
              difference: serializeDecimal(row.variance.difference),
              percent: serializeDecimal(row.variance.percent),
              direction: row.variance.direction,
            }
          : null,
      })),
    });
  },
);

export default router;
