import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips.ts";

export const tripAreaCostModes = ["ESTIMATE", "ACTUAL"] as const;
export type TripAreaCostMode = (typeof tripAreaCostModes)[number];

export const tripAreasTable = pgTable(
  "trip_areas",
  {
    id: serial("id").primaryKey(),
    // Nullable until the production store-ownership backfill is reviewed.
    storeId: integer("store_id"),
    tripId: integer("trip_id")
      .notNull()
      .references(() => tripsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("trip_areas_store_id_idx").on(t.storeId),
    index("trip_areas_trip_id_idx").on(t.tripId),
    unique("trip_areas_trip_id_name_unique").on(t.tripId, t.name),
  ],
);

export const tripAreaCostsTable = pgTable(
  "trip_area_costs",
  {
    id: serial("id").primaryKey(),
    tripAreaId: integer("trip_area_id")
      .notNull()
      .references(() => tripAreasTable.id, { onDelete: "cascade" }),
    mode: text("mode").$type<TripAreaCostMode>().notNull(),
    cardboardUnitJpy: numeric("cardboard_unit_jpy", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    shippingUnitJpy: numeric("shipping_unit_jpy", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default("0"),
    parcelCount: integer("parcel_count").notNull().default(0),
    estimatedItemQuantity: integer("estimated_item_quantity"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("trip_area_costs_trip_area_id_mode_unique").on(t.tripAreaId, t.mode),
    check(
      "trip_area_costs_mode_valid",
      sql`${t.mode} IN ('ESTIMATE', 'ACTUAL')`,
    ),
    check(
      "trip_area_costs_jpy_inputs_non_negative",
      sql`${t.cardboardUnitJpy} >= 0 AND ${t.shippingUnitJpy} >= 0`,
    ),
    check(
      "trip_area_costs_parcel_count_non_negative",
      sql`${t.parcelCount} >= 0`,
    ),
    check(
      "trip_area_costs_estimated_item_quantity_positive",
      sql`${t.estimatedItemQuantity} IS NULL OR ${t.estimatedItemQuantity} > 0`,
    ),
  ],
);

export const insertTripAreaSchema = createInsertSchema(tripAreasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTripArea = z.infer<typeof insertTripAreaSchema>;
export type TripArea = typeof tripAreasTable.$inferSelect;

export const insertTripAreaCostSchema = createInsertSchema(
  tripAreaCostsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTripAreaCost = z.infer<typeof insertTripAreaCostSchema>;
export type TripAreaCost = typeof tripAreaCostsTable.$inferSelect;
