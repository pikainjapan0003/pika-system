import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders.ts";

export const shipmentTrackingStatusEnum = [
  "pending",    // 尚未查詢
  "checking",   // 查詢中（worker lock）
  "active",     // 正常查詢中
  "delivered",  // 已送達終態，停止查詢
  "failed",     // 連續失敗超過閾值，停止查詢
  "inactive",   // 已手動停用或因換 trackingCode 而被取代
] as const;
export type ShipmentTrackingStatus = typeof shipmentTrackingStatusEnum[number];

export const shipmentTrackingsTable = pgTable("shipment_trackings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  trackingCode: text("tracking_code").notNull(),
  trackingProvider: text("tracking_provider").notNull(),
  // 查詢控制欄位
  isActive: boolean("is_active").notNull().default(true),
  trackingStatus: text("tracking_status").notNull().default("pending"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0),
  checkError: text("check_error"),
  // 最新貨態快照（Step 7D worker 寫入）
  latestEventStatus: text("latest_event_status"),
  latestEventDescription: text("latest_event_description"),
  latestEventAt: timestamp("latest_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("shipment_trackings_order_id_idx").on(t.orderId),
  index("shipment_trackings_active_next_check_idx").on(t.isActive, t.nextCheckAt),
]);

export const insertShipmentTrackingSchema = createInsertSchema(shipmentTrackingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipmentTracking = z.infer<typeof insertShipmentTrackingSchema>;
export type ShipmentTracking = typeof shipmentTrackingsTable.$inferSelect;
