import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const invoiceOcrTestCasesTable = pgTable(
  "invoice_ocr_test_cases",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    originalFilename: text("original_filename").notNull(),
    imageSha256: text("image_sha256").notNull(),
    groundTruthMerchantName: text("ground_truth_merchant_name").notNull(),
    groundTruthInvoiceDate: date("ground_truth_invoice_date", {
      mode: "string",
    }).notNull(),
    groundTruthTotalAmount: numeric("ground_truth_total_amount", {
      precision: 30,
      scale: 12,
    }).notNull(),
    groundTruthCurrency: text("ground_truth_currency").notNull(),
    groundTruthLockedAt: timestamp("ground_truth_locked_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoice_ocr_test_cases_store_hash_unique").on(
      table.storeId,
      table.imageSha256,
    ),
    index("invoice_ocr_test_cases_store_created_idx").on(
      table.storeId,
      table.createdAt,
    ),
    index("invoice_ocr_test_cases_created_by_idx").on(
      table.createdByUserId,
    ),
    check(
      "invoice_ocr_test_cases_creator_non_empty",
      sql`char_length(trim(${table.createdByUserId})) BETWEEN 1 AND 200`,
    ),
    check(
      "invoice_ocr_test_cases_filename_non_empty",
      sql`char_length(trim(${table.originalFilename})) BETWEEN 1 AND 200`,
    ),
    check(
      "invoice_ocr_test_cases_sha256_valid",
      sql`${table.imageSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "invoice_ocr_test_cases_merchant_non_empty",
      sql`char_length(trim(${table.groundTruthMerchantName})) BETWEEN 1 AND 200`,
    ),
    check(
      "invoice_ocr_test_cases_amount_positive",
      sql`${table.groundTruthTotalAmount} > 0`,
    ),
    check(
      "invoice_ocr_test_cases_currency_valid",
      sql`${table.groundTruthCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const insertInvoiceOcrTestCaseSchema = createInsertSchema(
  invoiceOcrTestCasesTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInvoiceOcrTestCase = z.infer<
  typeof insertInvoiceOcrTestCaseSchema
>;
export type InvoiceOcrTestCase =
  typeof invoiceOcrTestCasesTable.$inferSelect;
