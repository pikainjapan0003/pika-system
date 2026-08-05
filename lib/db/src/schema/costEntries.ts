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
import { tripsTable } from "./trips.ts";
import { costCategoriesTable } from "./costCategories.ts";

export const costEntryModes = ["ESTIMATE", "ACTUAL"] as const;
export const costEntryCurrencies = ["JPY", "TWD"] as const;
export const costEntryStatuses = ["ACTIVE", "VOID"] as const;
export type CostEntryMode = (typeof costEntryModes)[number];
export type CostEntryCurrency = (typeof costEntryCurrencies)[number];
export type CostEntryStatus = (typeof costEntryStatuses)[number];

export const costEntriesTable = pgTable(
  "cost_entries",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    tripId: integer("trip_id")
      .notNull()
      .references(() => tripsTable.id, { onDelete: "cascade" }),
    mode: text("mode").$type<CostEntryMode>().notNull(),
    categoryId: integer("category_id").references(
      () => costCategoriesTable.id,
      {
        onDelete: "restrict",
      },
    ),
    customLabel: text("custom_label"),
    currency: text("currency").$type<CostEntryCurrency>().notNull(),
    originalAmount: numeric("original_amount", {
      precision: 30,
      scale: 12,
    }).notNull(),
    occurredOn: date("occurred_on", { mode: "string" }),
    description: text("description"),
    photoUrl: text("photo_url"),
    status: text("status").$type<CostEntryStatus>().notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("cost_entries_store_id_idx").on(t.storeId),
    index("cost_entries_trip_id_mode_idx").on(t.tripId, t.mode),
    uniqueIndex("cost_entries_estimate_category_active_unique")
      .on(t.tripId, t.categoryId)
      .where(
        sql`${t.mode} = 'ESTIMATE' AND ${t.status} = 'ACTIVE' AND ${t.categoryId} IS NOT NULL`,
      ),
    check("cost_entries_mode_valid", sql`${t.mode} IN ('ESTIMATE', 'ACTUAL')`),
    check("cost_entries_currency_valid", sql`${t.currency} IN ('JPY', 'TWD')`),
    check("cost_entries_status_valid", sql`${t.status} IN ('ACTIVE', 'VOID')`),
    check("cost_entries_amount_non_negative", sql`${t.originalAmount} >= 0`),
    check(
      "cost_entries_category_or_custom_label",
      sql`(${t.categoryId} IS NOT NULL) <> (${t.customLabel} IS NOT NULL)`,
    ),
    check(
      "cost_entries_custom_label_non_empty",
      sql`${t.customLabel} IS NULL OR char_length(trim(${t.customLabel})) > 0`,
    ),
  ],
);

export const insertCostEntrySchema = createInsertSchema(costEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCostEntry = z.infer<typeof insertCostEntrySchema>;
export type CostEntry = typeof costEntriesTable.$inferSelect;
