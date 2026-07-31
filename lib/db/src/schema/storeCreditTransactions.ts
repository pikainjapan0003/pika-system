import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  numeric,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { customersTable } from "./customers.ts";
import { ordersTable } from "./orders.ts";

export const storeCreditDirectionEnum = ["credit", "debit"] as const;
export type StoreCreditDirection = (typeof storeCreditDirectionEnum)[number];

export const storeCreditTransactionTypeEnum = [
  "grant",
  "spend",
  "reversal",
] as const;
export type StoreCreditTransactionType =
  (typeof storeCreditTransactionTypeEnum)[number];

/**
 * Append-only store-credit ledger (C1-C8).
 *
 * UPDATE and DELETE are rejected by migration-level triggers. Balance is always
 * derived from these immutable rows; it is never stored as a mutable column.
 */
export const storeCreditTransactionsTable = pgTable(
  "store_credit_transactions",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),
    direction: text("direction").notNull(),
    type: text("type").notNull(),
    amount: numeric("amount", { precision: 30, scale: 12 }).notNull(),
    relatedOrderId: integer("related_order_id").references(
      () => ordersTable.id,
      { onDelete: "restrict" },
    ),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("store_credit_transactions_store_customer_created_idx").on(
      t.storeId,
      t.customerId,
      t.createdAt,
    ),
    index("store_credit_transactions_related_order_idx").on(t.relatedOrderId),
    check(
      "store_credit_transactions_direction_valid",
      sql`${t.direction} IN ('credit', 'debit')`,
    ),
    check(
      "store_credit_transactions_type_valid",
      sql`${t.type} IN ('grant', 'spend', 'reversal')`,
    ),
    check("store_credit_transactions_amount_positive", sql`${t.amount} > 0`),
    check(
      "store_credit_transactions_direction_type_valid",
      sql`(${t.type} = 'spend' AND ${t.direction} = 'debit')
      OR (${t.type} IN ('grant', 'reversal') AND ${t.direction} = 'credit')`,
    ),
  ],
);

export const insertStoreCreditTransactionSchema = createInsertSchema(
  storeCreditTransactionsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertStoreCreditTransaction = z.infer<
  typeof insertStoreCreditTransactionSchema
>;
export type StoreCreditTransaction =
  typeof storeCreditTransactionsTable.$inferSelect;
