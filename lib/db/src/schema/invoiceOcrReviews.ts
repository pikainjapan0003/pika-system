import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { invoiceOcrRunsTable } from "./invoiceOcrRuns.ts";

export interface CorrectedInvoiceJson {
  merchantName: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  currency: string | null;
}

export const invoiceOcrReviewsTable = pgTable(
  "invoice_ocr_reviews",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => invoiceOcrRunsTable.id, { onDelete: "cascade" }),
    merchantNameCorrect: boolean("merchant_name_correct").notNull(),
    invoiceDateCorrect: boolean("invoice_date_correct").notNull(),
    totalAmountCorrect: boolean("total_amount_correct").notNull(),
    currencyCorrect: boolean("currency_correct").notNull(),
    unsafeConfidentError: boolean("unsafe_confident_error").notNull(),
    correctedJson: jsonb("corrected_json").$type<CorrectedInvoiceJson>(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoice_ocr_reviews_run_unique").on(table.runId),
    index("invoice_ocr_reviews_reviewed_at_idx").on(table.reviewedAt),
    check(
      "invoice_ocr_reviews_reviewer_pair",
      sql`(${table.reviewedBy} IS NULL) = (${table.reviewedAt} IS NULL)`,
    ),
    check(
      "invoice_ocr_reviews_correction_requires_reviewer",
      sql`${table.correctedJson} IS NULL OR (
        ${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const insertInvoiceOcrReviewSchema = createInsertSchema(
  invoiceOcrReviewsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInvoiceOcrReview = z.infer<
  typeof insertInvoiceOcrReviewSchema
>;
export type InvoiceOcrReview = typeof invoiceOcrReviewsTable.$inferSelect;
