import {
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tripsTable = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    // Nullable until the production backfill has been reviewed and applied.
    storeId: integer("store_id"),
    name: text("name").notNull(),
    // Nullable so an incomplete draft can remain visibly pending confirmation.
    exchangeRate: numeric("exchange_rate"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("trips_store_id_idx").on(t.storeId)],
);

export const insertTripSchema = createInsertSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
