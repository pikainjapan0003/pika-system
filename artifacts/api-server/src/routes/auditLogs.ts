import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { auditLogsTable, db } from "@workspace/db";

import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { parseClientAuditEvent } from "../lib/auditEventInput.ts";
import { recordAuditLog } from "../lib/auditLog.ts";

const router = Router();

function parseStoreId(value: string): number {
  const storeId = Number(value);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new TypeError("storeId must be a positive integer");
  }
  return storeId;
}

router.get("/stores/:storeId/audit-logs", requireAuth, async (req: any, res) => {
  let storeId: number;
  try {
    storeId = parseStoreId(req.params.storeId);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.storeId, storeId))
    .orderBy(desc(auditLogsTable.at))
    .limit(100);
  return res.json(rows);
});

router.post("/stores/:storeId/audit-events", requireAuth, async (req: any, res) => {
  let storeId: number;
  let event: ReturnType<typeof parseClientAuditEvent>;
  try {
    storeId = parseStoreId(req.params.storeId);
    event = parseClientAuditEvent(req.body);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  await recordAuditLog({
    storeId,
    actor: req.userId,
    action: event.action,
    target: event.target,
  });
  return res.status(204).send();
});

export default router;
