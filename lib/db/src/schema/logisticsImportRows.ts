import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { logisticsImportBatchesTable } from "./logisticsImportBatches.ts";
import { ordersTable } from "./orders.ts";

export const logisticsImportRowMatchStatusEnum = [
  "matched",
  "needs_review",
  "ambiguous",
  "not_found",
  "conflict",
  "invalid",
  "imported", // confirm 後寫入成功
  "skipped", // 老闆確認時手動略過
] as const;
export type LogisticsImportRowMatchStatus =
  (typeof logisticsImportRowMatchStatusEnum)[number];

// 每一列 Excel dry-run 結果。個資規則：recipientNameMasked / recipientPhoneMasked
// 與 rawRowJson 一律只存遮罩值——落地前必須經過 importer lib 的
// sanitizeImportRowForStorage，嚴禁存完整姓名 / 電話 / 地址。
export const logisticsImportRowsTable = pgTable(
  "logistics_import_rows",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => logisticsImportBatchesTable.id, {
        onDelete: "cascade",
      }),
    rowNumber: integer("row_number").notNull(),
    trackingCode: text("tracking_code"),
    recipientNameMasked: text("recipient_name_masked"),
    recipientPhoneMasked: text("recipient_phone_masked"),
    storeName: text("store_name"),
    externalOrderNo: text("external_order_no"),
    // 不 cascade：刪訂單時保留匯入紀錄供稽核，僅斷開關聯
    matchedOrderId: integer("matched_order_id").references(
      () => ordersTable.id,
      { onDelete: "set null" },
    ),
    matchStatus: text("match_status").notNull(),
    confidence: integer("confidence"),
    reasons: jsonb("reasons").$type<string[]>().default([]),
    errorCode: text("error_code"),
    rawRowJson: jsonb("raw_row_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("logistics_import_rows_batch_id_idx").on(t.batchId),
    index("logistics_import_rows_matched_order_id_idx").on(t.matchedOrderId),
    index("logistics_import_rows_tracking_code_idx").on(t.trackingCode),
    index("logistics_import_rows_match_status_idx").on(t.matchStatus),
    check(
      "logistics_import_rows_match_status_valid",
      sql`${t.matchStatus} IN ('matched', 'needs_review', 'ambiguous', 'not_found', 'conflict', 'invalid', 'imported', 'skipped')`,
    ),
  ],
);

export const insertLogisticsImportRowSchema = createInsertSchema(
  logisticsImportRowsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLogisticsImportRow = z.infer<
  typeof insertLogisticsImportRowSchema
>;
export type LogisticsImportRow = typeof logisticsImportRowsTable.$inferSelect;
