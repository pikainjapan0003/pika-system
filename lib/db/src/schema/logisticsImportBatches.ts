import { pgTable, text, serial, timestamp, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const logisticsImportProviderEnum = ["711", "familymart"] as const;
export type LogisticsImportProvider = typeof logisticsImportProviderEnum[number];

export const logisticsImportBatchStatusEnum = ["dry_run", "confirmed", "cancelled", "failed"] as const;
export type LogisticsImportBatchStatus = typeof logisticsImportBatchStatusEnum[number];

// 每次老闆上傳物流 Excel 的 dry-run 批次。confirm（Step 7B-LOGISTICS-IMPORT-CONFIRM）
// 必須以已落地的 batch + rows 為準，不可重新解析檔案，確保確認內容與 dry-run 一致。
export const logisticsImportBatchesTable = pgTable("logistics_import_batches", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  fileName: text("file_name").notNull(),
  // Clerk userId（同 orders 慣例的 merchant 識別），不設 FK
  uploadedBy: text("uploaded_by").notNull(),
  status: text("status").notNull().default("dry_run"),
  totalRows: integer("total_rows").notNull().default(0),
  matchedRows: integer("matched_rows").notNull().default(0),
  needsReviewRows: integer("needs_review_rows").notNull().default(0),
  ambiguousRows: integer("ambiguous_rows").notNull().default(0),
  notFoundRows: integer("not_found_rows").notNull().default(0),
  conflictRows: integer("conflict_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("logistics_import_batches_store_id_idx").on(t.storeId),
  index("logistics_import_batches_provider_idx").on(t.provider),
  index("logistics_import_batches_status_idx").on(t.status),
  index("logistics_import_batches_created_at_idx").on(t.createdAt),
  check("logistics_import_batches_provider_valid", sql`${t.provider} IN ('711', 'familymart')`),
  check("logistics_import_batches_status_valid", sql`${t.status} IN ('dry_run', 'confirmed', 'cancelled', 'failed')`),
]);

export const insertLogisticsImportBatchSchema = createInsertSchema(logisticsImportBatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLogisticsImportBatch = z.infer<typeof insertLogisticsImportBatchSchema>;
export type LogisticsImportBatch = typeof logisticsImportBatchesTable.$inferSelect;
