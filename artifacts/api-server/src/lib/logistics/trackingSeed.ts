import { and, eq } from "drizzle-orm";
import { db, shipmentTrackingsTable } from "@workspace/db";

/**
 * Step 7N-I8B：手動填號的郵局 / 黑貓訂單 seed shipment_trackings。
 *
 * 背景：手動編輯訂單（PATCH /orders/:orderId）只寫 orders.trackingCode /
 * trackingProvider，不會建 shipment_trackings row；而 EditOrderDialog 的
 * 手動查詢按鈕與 manual-provider route 都以 shipment_trackings.id 為 key，
 * 導致手動填號訂單永遠沒有按鈕。此 helper 供 PATCH 與 backfill 腳本共用。
 *
 * 範圍刻意限縮：只處理 postoffice / tcat。711（半自動）與 familymart
 * （走 Excel 匯入 + scheduled sync）一律 skip，避免影響既有流程。
 * 只寫 shipment_trackings 本體欄位（pending / manual），不寫 events、
 * 不寫 snapshot、不打外部查詢。
 */

export const MANUAL_SEED_PROVIDERS = ["postoffice", "tcat"] as const;
export type ManualSeedProvider = (typeof MANUAL_SEED_PROVIDERS)[number];

export type SeedResult =
  | { action: "inserted"; trackingId: number }
  | { action: "reactivated"; trackingId: number }
  | { action: "replaced"; trackingId: number; retiredTrackingId: number }
  | { action: "unchanged"; trackingId: number }
  | { action: "skipped"; reason: "provider_not_seedable" | "empty_tracking_code" | "code_used_by_other_order" };

export async function ensureManualProviderTrackingRow(input: {
  orderId: number;
  trackingCode: string | null | undefined;
  trackingProvider: string | null | undefined;
}): Promise<SeedResult> {
  const trackingCode = (input.trackingCode ?? "").trim();
  const provider = (input.trackingProvider ?? "").trim();

  if (!MANUAL_SEED_PROVIDERS.includes(provider as ManualSeedProvider)) {
    return { action: "skipped", reason: "provider_not_seedable" };
  }
  if (!trackingCode) {
    return { action: "skipped", reason: "empty_tracking_code" };
  }

  // (provider, trackingCode) 有 DB unique index：先查占用情況避免 insert 衝突
  const [codeRow] = await db
    .select()
    .from(shipmentTrackingsTable)
    .where(
      and(
        eq(shipmentTrackingsTable.trackingProvider, provider),
        eq(shipmentTrackingsTable.trackingCode, trackingCode),
      ),
    )
    .limit(1);

  if (codeRow && codeRow.orderId !== input.orderId) {
    // 同單號已被其他訂單占用 — 不搶、不改，交由人工處理
    return { action: "skipped", reason: "code_used_by_other_order" };
  }

  const [activeRow] = await db
    .select()
    .from(shipmentTrackingsTable)
    .where(
      and(
        eq(shipmentTrackingsTable.orderId, input.orderId),
        eq(shipmentTrackingsTable.isActive, true),
      ),
    )
    .limit(1);

  if (
    activeRow &&
    activeRow.trackingProvider === provider &&
    activeRow.trackingCode === trackingCode
  ) {
    return { action: "unchanged", trackingId: activeRow.id };
  }

  // trackingCode / provider 變更：retire 舊 active row（保留歷史，不刪除）
  // 與 import 流程（orders.ts bulk import）同一 pattern
  if (activeRow) {
    await db
      .update(shipmentTrackingsTable)
      .set({ isActive: false, trackingStatus: "inactive" })
      .where(eq(shipmentTrackingsTable.id, activeRow.id));
  }

  if (codeRow) {
    // 同訂單曾用過這個單號（被 retire 過）：reactivate，避免 unique index 衝突
    await db
      .update(shipmentTrackingsTable)
      .set({ isActive: true, trackingStatus: "pending", checkError: null })
      .where(eq(shipmentTrackingsTable.id, codeRow.id));
    return activeRow
      ? { action: "replaced", trackingId: codeRow.id, retiredTrackingId: activeRow.id }
      : { action: "reactivated", trackingId: codeRow.id };
  }

  const [inserted] = await db
    .insert(shipmentTrackingsTable)
    .values({
      orderId: input.orderId,
      trackingCode,
      trackingProvider: provider,
      sourceType: "manual",
    })
    .returning({ id: shipmentTrackingsTable.id });

  return activeRow
    ? { action: "replaced", trackingId: inserted.id, retiredTrackingId: activeRow.id }
    : { action: "inserted", trackingId: inserted.id };
}
