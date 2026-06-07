import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shipmentTrackingsTable } from "./shipmentTrackings.ts";

// 物流貨態標準狀態（eventStatus）
// 注意：這與 shipmentTrackings.trackingStatus（查詢任務狀態）是完全不同的概念，不可混用
export const shipmentTrackingEventStatusEnum = [
  "unknown",       // 無法對應的業者狀態
  "pending",       // 物流單已建立，尚未有掃描事件
  "in_transit",    // 運送中
  "arrived_store", // 已到達取件門市
  "picked_up",     // 客人已取件
  "delivered",     // 已送達終點
  "returned",      // 已退回寄件方
  "exception",     // 異常（地址錯誤、遺失等）
] as const;
export type ShipmentTrackingEventStatus = typeof shipmentTrackingEventStatusEnum[number];

export const shipmentTrackingEventsTable = pgTable("shipment_tracking_events", {
  id: serial("id").primaryKey(),
  shipmentTrackingId: integer("shipment_tracking_id").notNull().references(() => shipmentTrackingsTable.id, { onDelete: "cascade" }),
  // 事件內容
  eventCode: text("event_code"),            // 業者原始狀態代碼（如 "ARRIVED_AT_CVS"）
  eventStatus: text("event_status").notNull(), // 系統標準化貨態狀態
  eventDescription: text("event_description"), // 業者原始描述文字
  eventLocation: text("event_location"),    // 事件發生地點
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  // 原始資料保留
  rawData: jsonb("raw_data"),               // 業者 API 原始回傳
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("shipment_tracking_events_tracking_id_idx").on(t.shipmentTrackingId),
  index("shipment_tracking_events_occurred_at_idx").on(t.occurredAt),
]);

export const insertShipmentTrackingEventSchema = createInsertSchema(shipmentTrackingEventsTable).omit({ id: true, createdAt: true });
export type InsertShipmentTrackingEvent = z.infer<typeof insertShipmentTrackingEventSchema>;
export type ShipmentTrackingEvent = typeof shipmentTrackingEventsTable.$inferSelect;
