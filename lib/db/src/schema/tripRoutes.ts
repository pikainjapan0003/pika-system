import { boolean, check, index, integer, numeric, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips.ts";

export const tripRoutesTable = pgTable("trip_routes", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  areaTitle: text("area_title").notNull(),
  startPlace: text("start_place").notNull(),
  endPlace: text("end_place").notNull(),
  trainJpy: numeric("train_jpy").notNull().default("0"),
  fuelJpy: numeric("fuel_jpy").notNull().default("0"),
  parkingJpy: numeric("parking_jpy").notNull().default("0"),
  estQty: integer("est_qty").notNull(),
  etcJpy: numeric("etc_jpy"),
  cardboardJpy: numeric("cardboard_jpy").notNull().default("0"),
  shippingJpy: numeric("shipping_jpy").notNull().default("0"),
  parcelCount: integer("parcel_count").notNull().default(0),

  // Calculated values remain derived in the pure module. These pairs retain
  // explicit human overrides without caching a second, drift-prone copy.
  // The ETC override pair is legacy-only after ETC became a direct manual
  // input; it stays in the schema for backward compatibility and is ignored.
  etcJpyOverride: numeric("etc_jpy_override"),
  etcJpyIsOverridden: boolean("etc_jpy_is_overridden").notNull().default(false),
  fee1_5PctOverride: numeric("fee_1_5pct_override"),
  fee1_5PctIsOverridden: boolean("fee_1_5pct_is_overridden").notNull().default(false),
  totalJpyOverride: numeric("total_jpy_override"),
  totalJpyIsOverridden: boolean("total_jpy_is_overridden").notNull().default(false),
  domesticPerItemOverride: numeric("domestic_per_item_override"),
  domesticPerItemIsOverridden: boolean("domestic_per_item_is_overridden").notNull().default(false),
  transportPerItemOverride: numeric("transport_per_item_override"),
  transportPerItemIsOverridden: boolean("transport_per_item_is_overridden").notNull().default(false),
  finalCostPerItemOverride: numeric("final_cost_per_item_override"),
  finalCostPerItemIsOverridden: boolean("final_cost_per_item_is_overridden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("trip_routes_trip_id_idx").on(t.tripId),
  unique("trip_routes_trip_id_area_title_unique").on(t.tripId, t.areaTitle),
  check("trip_routes_est_qty_positive", sql`${t.estQty} > 0`),
  check("trip_routes_parcel_count_non_negative", sql`${t.parcelCount} >= 0`),
  check(
    "trip_routes_jpy_inputs_non_negative",
    sql`${t.trainJpy} >= 0 AND ${t.fuelJpy} >= 0 AND ${t.parkingJpy} >= 0 AND ${t.cardboardJpy} >= 0 AND ${t.shippingJpy} >= 0`,
  ),
  check("trip_routes_etc_jpy_non_negative", sql`${t.etcJpy} IS NULL OR ${t.etcJpy} >= 0`),
  check(
    "trip_routes_overrides_valid",
    sql`(NOT ${t.etcJpyIsOverridden} OR ${t.etcJpyOverride} IS NOT NULL)
      AND (NOT ${t.fee1_5PctIsOverridden} OR ${t.fee1_5PctOverride} IS NOT NULL)
      AND (NOT ${t.totalJpyIsOverridden} OR ${t.totalJpyOverride} IS NOT NULL)
      AND (NOT ${t.domesticPerItemIsOverridden} OR ${t.domesticPerItemOverride} IS NOT NULL)
      AND (NOT ${t.transportPerItemIsOverridden} OR ${t.transportPerItemOverride} IS NOT NULL)
      AND (NOT ${t.finalCostPerItemIsOverridden} OR ${t.finalCostPerItemOverride} IS NOT NULL)`,
  ),
  check(
    "trip_routes_override_values_non_negative",
    sql`(${t.etcJpyOverride} IS NULL OR ${t.etcJpyOverride} >= 0)
      AND (${t.fee1_5PctOverride} IS NULL OR ${t.fee1_5PctOverride} >= 0)
      AND (${t.totalJpyOverride} IS NULL OR ${t.totalJpyOverride} >= 0)
      AND (${t.domesticPerItemOverride} IS NULL OR ${t.domesticPerItemOverride} >= 0)
      AND (${t.transportPerItemOverride} IS NULL OR ${t.transportPerItemOverride} >= 0)
      AND (${t.finalCostPerItemOverride} IS NULL OR ${t.finalCostPerItemOverride} >= 0)`,
  ),
]);

export const insertTripRouteSchema = createInsertSchema(tripRoutesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTripRoute = z.infer<typeof insertTripRouteSchema>;
export type TripRoute = typeof tripRoutesTable.$inferSelect;
