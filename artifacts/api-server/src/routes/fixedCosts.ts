import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  costCategoriesTable,
  costEntriesTable,
  type CostEntryMode,
  db,
  tripsTable,
} from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";

const router = Router();

export function positiveId(value: unknown): number | null {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function decimalString(value: unknown): string | null {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
    ? value.trim()
    : null;
}

export async function loadTrip(req: any, res: any) {
  const storeId = positiveId(req.params.storeId);
  const tripId = positiveId(req.params.tripId);
  if (storeId === null || tripId === null) {
    res.status(400).json({ error: "Invalid store or trip id" });
    return null;
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return null;
  const [trip] = await db
    .select()
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.storeId, storeId)))
    .limit(1);
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return null;
  }
  return { storeId, tripId, trip };
}

function parseEntryBody(body: any, partial = false) {
  if (!body || typeof body !== "object")
    return { error: "Invalid body" } as const;
  const result: Record<string, unknown> = {};
  if (!partial || body.mode !== undefined) {
    if (body.mode !== "ESTIMATE" && body.mode !== "ACTUAL") {
      return { error: "mode must be ESTIMATE or ACTUAL" } as const;
    }
    result.mode = body.mode;
  }
  if (!partial || body.currency !== undefined) {
    if (body.currency !== "JPY" && body.currency !== "TWD") {
      return { error: "currency must be JPY or TWD" } as const;
    }
    result.currency = body.currency;
  }
  if (!partial || body.originalAmount !== undefined) {
    const amount = decimalString(body.originalAmount);
    if (amount === null)
      return { error: "originalAmount must be a decimal string" } as const;
    result.originalAmount = amount;
  }
  if (
    !partial ||
    body.categoryId !== undefined ||
    body.customLabel !== undefined
  ) {
    const categoryId =
      body.categoryId == null ? null : positiveId(body.categoryId);
    const customLabel =
      typeof body.customLabel === "string" && body.customLabel.trim() !== ""
        ? body.customLabel.trim()
        : null;
    if ((categoryId === null) === (customLabel === null)) {
      return {
        error: "exactly one of categoryId or customLabel is required",
      } as const;
    }
    result.categoryId = categoryId;
    result.customLabel = customLabel;
  }
  for (const key of ["occurredOn", "description", "photoUrl"] as const) {
    if (body[key] !== undefined)
      result[key] = body[key] == null ? null : String(body[key]);
  }
  return { value: result } as const;
}

router.get(
  "/stores/:storeId/trips/:tripId/cost-entries",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const mode = req.query.mode as string | undefined;
    if (mode !== undefined && mode !== "ESTIMATE" && mode !== "ACTUAL") {
      return res.status(400).json({ error: "Invalid mode" });
    }
    const rows = await db
      .select({
        entry: costEntriesTable,
        categoryName: costCategoriesTable.name,
      })
      .from(costEntriesTable)
      .leftJoin(
        costCategoriesTable,
        eq(costEntriesTable.categoryId, costCategoriesTable.id),
      )
      .where(
        and(
          eq(costEntriesTable.tripId, access.tripId),
          eq(costEntriesTable.storeId, access.storeId),
          mode ? eq(costEntriesTable.mode, mode as CostEntryMode) : undefined,
        ),
      );
    return res.json(
      rows.map(({ entry, categoryName }) => ({ ...entry, categoryName })),
    );
  },
);

router.post(
  "/stores/:storeId/trips/:tripId/cost-entries",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const parsed = parseEntryBody(req.body);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    if (access.trip.status === "CLOSED" && access.trip.estimateLocked) {
      return res.status(409).json({ error: "Trip is closed" });
    }
    if (parsed.value.mode === "ESTIMATE" && access.trip.estimateLocked) {
      return res.status(409).json({ error: "Cost entry is locked" });
    }
    try {
      const [entry] = await db
        .insert(costEntriesTable)
        .values({
          ...parsed.value,
          storeId: access.storeId,
          tripId: access.tripId,
        } as any)
        .returning();
      return res.status(201).json(entry);
    } catch (error: any) {
      if (error?.code === "23505")
        return res
          .status(409)
          .json({ error: "Estimate category already exists" });
      throw error;
    }
  },
);

router.patch(
  "/stores/:storeId/trips/:tripId/cost-entries/:entryId",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const entryId = positiveId(req.params.entryId);
    if (entryId === null)
      return res.status(400).json({ error: "Invalid entry id" });
    const [entry] = await db
      .select()
      .from(costEntriesTable)
      .where(
        and(
          eq(costEntriesTable.id, entryId),
          eq(costEntriesTable.tripId, access.tripId),
          eq(costEntriesTable.storeId, access.storeId),
        ),
      )
      .limit(1);
    if (!entry) return res.status(404).json({ error: "Cost entry not found" });
    if (
      (access.trip.status === "CLOSED" && access.trip.estimateLocked) ||
      (entry.mode === "ESTIMATE" && access.trip.estimateLocked)
    ) {
      return res.status(409).json({ error: "Cost entry is locked" });
    }
    if (req.body?.mode !== undefined) {
      return res
        .status(400)
        .json({ error: "Cost entry mode cannot be changed" });
    }
    const parsed = parseEntryBody(req.body, true);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const [updated] = await db
      .update(costEntriesTable)
      .set(parsed.value as any)
      .where(eq(costEntriesTable.id, entryId))
      .returning();
    return res.json(updated);
  },
);

router.delete(
  "/stores/:storeId/trips/:tripId/cost-entries/:entryId",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const entryId = positiveId(req.params.entryId);
    if (entryId === null)
      return res.status(400).json({ error: "Invalid entry id" });
    if (access.trip.status === "CLOSED")
      return res.status(409).json({ error: "Closed trips only allow VOID" });
    const deleted = await db
      .delete(costEntriesTable)
      .where(
        and(
          eq(costEntriesTable.id, entryId),
          eq(costEntriesTable.tripId, access.tripId),
          eq(costEntriesTable.storeId, access.storeId),
        ),
      )
      .returning({ id: costEntriesTable.id });
    if (deleted.length === 0)
      return res.status(404).json({ error: "Cost entry not found" });
    return res.status(204).send();
  },
);

router.post(
  "/stores/:storeId/trips/:tripId/cost-entries/:entryId/void",
  requireAuth,
  async (req: any, res) => {
    const access = await loadTrip(req, res);
    if (!access) return;
    const entryId = positiveId(req.params.entryId);
    if (entryId === null)
      return res.status(400).json({ error: "Invalid entry id" });
    const [updated] = await db
      .update(costEntriesTable)
      .set({ status: "VOID" })
      .where(
        and(
          eq(costEntriesTable.id, entryId),
          eq(costEntriesTable.tripId, access.tripId),
          eq(costEntriesTable.storeId, access.storeId),
        ),
      )
      .returning();
    if (!updated)
      return res.status(404).json({ error: "Cost entry not found" });
    return res.json(updated);
  },
);

export default router;
