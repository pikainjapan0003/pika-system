import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tripsTable = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    // Nullable until the production backfill has been reviewed and applied.
    storeId: integer("store_id"),
    name: text("name").notNull(),
    status: text("status").notNull().default("PLANNING"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    workingDays: integer("working_days"),
    // Nullable so an incomplete draft can remain visibly pending confirmation.
    exchangeRate: numeric("exchange_rate"),
    actualExchangeRate: numeric("actual_exchange_rate", {
      precision: 30,
      scale: 12,
    }),
    estimateLocked: boolean("estimate_locked").notNull().default(false),
    estimateModifiedAfterLock: boolean("estimate_modified_after_lock")
      .notNull()
      .default(false),
    hepDays: integer("hep_days"),
    hepTotalJpy: numeric("hep_total_jpy", { precision: 30, scale: 12 }),
    creditCardRebateTwd: numeric("credit_card_rebate_twd", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    freeShippingDiscountTwd: numeric("free_shipping_discount_twd", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    bulkDiscountTwd: numeric("bulk_discount_twd", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    cardDiscountTwd: numeric("card_discount_twd", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    totalItemQuantity: integer("total_item_quantity"),
    unitGrossProfitTwd: numeric("unit_gross_profit_twd", {
      precision: 30,
      scale: 12,
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("trips_store_id_idx").on(t.storeId),
    check(
      "trips_hep_days_valid",
      sql`${t.hepDays} IS NULL OR ${t.hepDays} IN (4, 5, 10)`,
    ),
    check(
      "trips_status_valid",
      sql`${t.status} IN ('PLANNING', 'ACTIVE', 'CLOSED')`,
    ),
    check(
      "trips_date_range_valid",
      sql`${t.startDate} IS NULL OR ${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check(
      "trips_working_days_positive",
      sql`${t.workingDays} IS NULL OR ${t.workingDays} > 0`,
    ),
    check(
      "trips_actual_exchange_rate_non_negative",
      sql`${t.actualExchangeRate} IS NULL OR ${t.actualExchangeRate} >= 0`,
    ),
    check(
      "trips_hep_total_jpy_non_negative",
      sql`${t.hepTotalJpy} IS NULL OR ${t.hepTotalJpy} >= 0`,
    ),
    check(
      "trips_operating_adjustments_non_negative",
      sql`${t.creditCardRebateTwd} >= 0
        AND ${t.freeShippingDiscountTwd} >= 0
        AND ${t.bulkDiscountTwd} >= 0
        AND ${t.cardDiscountTwd} >= 0`,
    ),
    check(
      "trips_total_item_quantity_non_negative",
      sql`${t.totalItemQuantity} IS NULL OR ${t.totalItemQuantity} >= 0`,
    ),
  ],
);

export const insertTripSchema = createInsertSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
