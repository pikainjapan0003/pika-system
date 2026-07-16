import { auditLogsTable, db } from "@workspace/db";

export async function recordAuditLog(input: {
  storeId: number;
  actor: string;
  action: string;
  target: string;
}): Promise<void> {
  await db.insert(auditLogsTable).values(input);
}
