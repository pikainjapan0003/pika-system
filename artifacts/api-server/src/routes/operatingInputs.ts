import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { db, tripsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.ts";
import { decimalString, loadTrip } from "./fixedCosts.ts";

const router = Router();

function nullableDecimal(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return decimalString(value);
}

function parseDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

function parsePositiveInteger(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function parseHepDays(value: unknown): number | null | undefined {
  const parsed = parsePositiveInteger(value);
  if (parsed === undefined || parsed === null) return parsed;
  return parsed === 4 || parsed === 5 || parsed === 10 ? parsed : undefined;
}

router.patch(
  "/stores/:storeId/trips/:tripId/operating-inputs",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    if (access.trip.status === "CLOSED" && access.trip.estimateLocked) {
      return res.status(409).json({ error: "Trip is closed" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);
    const workingDays = parsePositiveInteger(body.workingDays);
    const actualExchangeRate = nullableDecimal(body.actualExchangeRate);
    const exchangeRate = nullableDecimal(body.exchangeRate);
    const hepDays = parseHepDays(body.hepDays);
    const hepTotalJpy = nullableDecimal(body.hepTotalJpy);
    const creditCardRebateTwd = nullableDecimal(body.creditCardRebateTwd);
    const freeShippingDiscountTwd = nullableDecimal(
      body.freeShippingDiscountTwd,
    );
    const bulkDiscountTwd = nullableDecimal(body.bulkDiscountTwd);
    const cardDiscountTwd = nullableDecimal(body.cardDiscountTwd);

    if (
      (body.startDate !== undefined && startDate === undefined) ||
      (body.endDate !== undefined && endDate === undefined) ||
      (body.workingDays !== undefined && workingDays === undefined) ||
      (body.actualExchangeRate !== undefined &&
        actualExchangeRate === undefined) ||
      (body.exchangeRate !== undefined && exchangeRate === undefined) ||
      (body.hepDays !== undefined && hepDays === undefined) ||
      (body.hepTotalJpy !== undefined && hepTotalJpy === undefined) ||
      (body.creditCardRebateTwd !== undefined &&
        creditCardRebateTwd === undefined) ||
      (body.freeShippingDiscountTwd !== undefined &&
        freeShippingDiscountTwd === undefined) ||
      (body.bulkDiscountTwd !== undefined && bulkDiscountTwd === undefined) ||
      (body.cardDiscountTwd !== undefined && cardDiscountTwd === undefined)
    ) {
      return res.status(400).json({ error: "Invalid operating input" });
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of [
      ["startDate", startDate],
      ["endDate", endDate],
      ["workingDays", workingDays],
      ["actualExchangeRate", actualExchangeRate],
      ["exchangeRate", exchangeRate],
      ["hepDays", hepDays],
      ["hepTotalJpy", hepTotalJpy],
      ["creditCardRebateTwd", creditCardRebateTwd],
      ["freeShippingDiscountTwd", freeShippingDiscountTwd],
      ["bulkDiscountTwd", bulkDiscountTwd],
      ["cardDiscountTwd", cardDiscountTwd],
    ] as const) {
      if (body[key] !== undefined) update[key] = value;
    }
    if (Object.keys(update).length === 0)
      return res.status(400).json({ error: "No operating input provided" });

    const [updated] = await db
      .update(tripsTable)
      .set(update)
      .where(
        and(
          eq(tripsTable.id, access.tripId),
          eq(tripsTable.storeId, access.storeId),
        ),
      )
      .returning();
    return res.json(updated);
  },
);

router.post(
  "/stores/:storeId/trips/:tripId/close",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    if (access.trip.status === "CLOSED" && access.trip.estimateLocked) {
      return res.json(access.trip);
    }
    const update =
      access.trip.status === "CLOSED"
        ? { estimateLocked: true }
        : { status: "CLOSED" as const, estimateLocked: true };
    const [updated] = await db
      .update(tripsTable)
      .set(update)
      .where(
        and(
          eq(tripsTable.id, access.tripId),
          eq(tripsTable.storeId, access.storeId),
        ),
      )
      .returning();
    return res.json(updated);
  },
);

router.post(
  "/stores/:storeId/trips/:tripId/unlock-estimate",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    if (!access.trip.estimateLocked) return res.json(access.trip);
    const [updated] = await db
      .update(tripsTable)
      .set({ estimateLocked: false, estimateModifiedAfterLock: true })
      .where(
        and(
          eq(tripsTable.id, access.tripId),
          eq(tripsTable.storeId, access.storeId),
        ),
      )
      .returning();
    return res.json(updated);
  },
);

export default router;
