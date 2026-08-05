import { and, asc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  calculateFixedCostTotals,
  compareFixedCostEntries,
  costCategoriesTable,
  costEntriesTable,
  type CostEntryMode,
  db,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.ts";
import { loadTrip } from "./fixedCosts.ts";

const router = Router();

function serializeDecimal(value: any): string | null {
  return value == null ? null : value.toDecimalPlaces(12);
}

async function loadEntries(access: any, mode: CostEntryMode) {
  return db
    .select({ entry: costEntriesTable, categoryName: costCategoriesTable.name })
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

function serializeEntry(row: any) {
  return {
    ...row.entry,
    categoryName: row.categoryName,
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
    const totals = calculateFixedCostTotals({
      entries: rows.map((row) => ({
        ...row.entry,
        originalAmount: String(row.entry.originalAmount),
      })),
      exchangeRate,
    });
    return res.json({
      status: totals.status,
      mode,
      exchangeRate: exchangeRate == null ? null : String(exchangeRate),
      entries: rows.map(serializeEntry),
      categories,
      totals: serializeTotals(totals),
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
        categoryName: row.categoryName,
        originalAmount: String(row.entry.originalAmount),
      })),
      actualRows.map((row) => ({
        ...row.entry,
        categoryName: row.categoryName,
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
