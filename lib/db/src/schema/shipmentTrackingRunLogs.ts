import { pgTable, text, serial, timestamp, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const trackingRunTypeEnum = [
  "scheduled_worker",
  "manual_worker",
  "adapter_health_check",
  "import_confirm",
  "exception_retry",
] as const;
export type TrackingRunType = typeof trackingRunTypeEnum[number];

export const trackingRunProviderEnum = ["711", "familymart", "tcat", "postoffice", "all"] as const;
export type TrackingRunProvider = typeof trackingRunProviderEnum[number];

export const trackingRunStatusEnum = ["running", "success", "partial", "failed", "cancelled"] as const;
export type TrackingRunStatus = typeof trackingRunStatusEnum[number];

// 物流巡查 / 匯入批次 / 例外重試的執行紀錄（稽核用）。
// error_summary 個資規則：嚴禁存完整姓名 / 電話 / 地址，只可存錯誤摘要與計數。
export const shipmentTrackingRunLogsTable = pgTable("shipment_tracking_run_logs", {
  id: serial("id").primaryKey(),
  // nullable：scheduled worker 可能是跨店家全域任務；set null 保留稽核歷史
  storeId: integer("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  runType: text("run_type").notNull(),
  // nullable 或 'all' 表示全物流商
  provider: text("provider"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  totalJobs: integer("total_jobs").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorSummary: text("error_summary"),
  // Clerk userId 或 'system'，同既有慣例不設 FK
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("shipment_tracking_run_logs_store_id_idx").on(t.storeId),
  index("shipment_tracking_run_logs_run_type_idx").on(t.runType),
  index("shipment_tracking_run_logs_provider_idx").on(t.provider),
  index("shipment_tracking_run_logs_status_idx").on(t.status),
  index("shipment_tracking_run_logs_started_at_idx").on(t.startedAt),
  index("shipment_tracking_run_logs_created_at_idx").on(t.createdAt),
  check("shipment_tracking_run_logs_run_type_valid", sql`${t.runType} IN ('scheduled_worker', 'manual_worker', 'adapter_health_check', 'import_confirm', 'exception_retry')`),
  check("shipment_tracking_run_logs_provider_valid", sql`${t.provider} IS NULL OR ${t.provider} IN ('711', 'familymart', 'tcat', 'postoffice', 'all')`),
  check("shipment_tracking_run_logs_status_valid", sql`${t.status} IN ('running', 'success', 'partial', 'failed', 'cancelled')`),
  check("shipment_tracking_run_logs_counts_non_negative", sql`${t.totalJobs} >= 0 AND ${t.successCount} >= 0 AND ${t.failedCount} >= 0 AND ${t.skippedCount} >= 0`),
]);

export const insertShipmentTrackingRunLogSchema = createInsertSchema(shipmentTrackingRunLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipmentTrackingRunLog = z.infer<typeof insertShipmentTrackingRunLogSchema>;
export type ShipmentTrackingRunLog = typeof shipmentTrackingRunLogsTable.$inferSelect;
