import { eq } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import type { CandidateOrder } from "./types.ts";

/** Read-only projection of one store's orders for dry-run matching. Never mutates anything. */
export async function loadCandidateOrders(storeId: number): Promise<CandidateOrder[]> {
  const rows = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      shippingMethod: ordersTable.shippingMethod,
      trackingCode: ordersTable.trackingCode,
      buyerName: ordersTable.buyerName,
      buyerPhone: ordersTable.buyerPhone,
      recipientName: ordersTable.recipientName,
      recipientPhone: ordersTable.recipientPhone,
      cvsStoreName: ordersTable.cvsStoreName,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId));
  return rows;
}
