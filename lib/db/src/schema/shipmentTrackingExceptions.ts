import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { ordersTable } from "./orders.ts";
import { shipmentTrackingsTable } from "./shipmentTrackings.ts";
import { logisticsImportBatchesTable } from "./logisticsImportBatches.ts";
import { logisticsImportRowsTable } from "./logisticsImportRows.ts";

export const trackingExceptionProviderEnum = [
  "711",
  "familymart",
  "tcat",
  "postoffice",
] as const;
export type TrackingExceptionProvider =
  (typeof trackingExceptionProviderEnum)[number];

export const trackingExceptionSourceTypeEnum = [
  "file_import",
  "manual",
  "agent",
  "worker",
] as const;
export type TrackingExceptionSourceType =
  (typeof trackingExceptionSourceTypeEnum)[number];

export const trackingExceptionStatusEnum = [
  "open",
  "reviewing",
  "resolved",
  "ignored",
] as const;
export type TrackingExceptionStatus =
  (typeof trackingExceptionStatusEnum)[number];

export const trackingExceptionSeverityEnum = [
  "info",
  "warning",
  "error",
  "critical",
] as const;
export type TrackingExceptionSeverity =
  (typeof trackingExceptionSeverityEnum)[number];

// 物流例外佇列：Excel 匯入配對失敗（ambiguous / not_found / conflict / 缺欄位 / 非手機）、
// adapter / worker 查詢失敗（OCR_FAILED / NO_RESULT / REMOTE_CHANGED / NETWORK_FAILED…）。
// message 個資規則：嚴禁存完整姓名 / 電話 / 地址，只可存遮罩值、欄位名稱或錯誤摘要。
export const shipmentTrackingExceptionsTable = pgTable(
  "shipment_tracking_exceptions",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    // 以下關聯皆 nullable：匯入例外可能尚未配對到訂單、尚未建立 tracking
    orderId: integer("order_id").references(() => ordersTable.id, {
      onDelete: "set null",
    }),
    shipmentTrackingId: integer("shipment_tracking_id").references(
      () => shipmentTrackingsTable.id,
      { onDelete: "set null" },
    ),
    importBatchId: integer("import_batch_id").references(
      () => logisticsImportBatchesTable.id,
      { onDelete: "set null" },
    ),
    importRowId: integer("import_row_id").references(
      () => logisticsImportRowsTable.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    trackingCode: text("tracking_code"),
    sourceType: text("source_type").notNull(),
    errorCode: text("error_code").notNull(),
    message: text("message"),
    status: text("status").notNull().default("open"),
    severity: text("severity").notNull().default("error"),
    retryable: boolean("retryable").notNull().default(false),
    failureCount: integer("failure_count").notNull().default(1),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Clerk userId 或 'system'，同 uploaded_by 慣例不設 FK
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("shipment_tracking_exceptions_store_id_idx").on(t.storeId),
    index("shipment_tracking_exceptions_status_idx").on(t.status),
    index("shipment_tracking_exceptions_provider_idx").on(t.provider),
    index("shipment_tracking_exceptions_error_code_idx").on(t.errorCode),
    index("shipment_tracking_exceptions_tracking_id_idx").on(
      t.shipmentTrackingId,
    ),
    index("shipment_tracking_exceptions_import_row_id_idx").on(t.importRowId),
    index("shipment_tracking_exceptions_created_at_idx").on(t.createdAt),
    check(
      "shipment_tracking_exceptions_provider_valid",
      sql`${t.provider} IN ('711', 'familymart', 'tcat', 'postoffice')`,
    ),
    check(
      "shipment_tracking_exceptions_source_type_valid",
      sql`${t.sourceType} IN ('file_import', 'manual', 'agent', 'worker')`,
    ),
    check(
      "shipment_tracking_exceptions_status_valid",
      sql`${t.status} IN ('open', 'reviewing', 'resolved', 'ignored')`,
    ),
    check(
      "shipment_tracking_exceptions_severity_valid",
      sql`${t.severity} IN ('info', 'warning', 'error', 'critical')`,
    ),
  ],
);

export const insertShipmentTrackingExceptionSchema = createInsertSchema(
  shipmentTrackingExceptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipmentTrackingException = z.infer<
  typeof insertShipmentTrackingExceptionSchema
>;
export type ShipmentTrackingException =
  typeof shipmentTrackingExceptionsTable.$inferSelect;
