import { auditLogsTable, db } from "@workspace/db";

export function buildStoreCreditAuditTarget(input: {
  customerId: number;
  transactionId: number;
  amount: string;
  relatedOrderId?: number | null;
}): string {
  const orderPart =
    input.relatedOrderId === undefined || input.relatedOrderId === null
      ? ""
      : `:order-${input.relatedOrderId}`;
  return `customer-${input.customerId}:ledger-${input.transactionId}${orderPart}:amount-${input.amount}`;
}

export async function recordAuditLog(input: {
  storeId: number;
  actor: string;
  action: string;
  target: string;
}): Promise<void> {
  await db.insert(auditLogsTable).values(input);
}
