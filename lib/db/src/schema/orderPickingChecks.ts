import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders.ts";

/**
 * Persistent per-order picking state (X1/X1b).
 *
 * A row means the item is checked. `itemKey` is generated from the immutable
 * order item snapshot at the API boundary; deleting the row means unchecked.
 * Shipped orders retain rows and become read-only in the route layer.
 */
export const orderPickingChecksTable = pgTable(
  "order_picking_checks",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checkedBy: text("checked_by").notNull(),
  },
  (t) => [
    uniqueIndex("order_picking_checks_order_item_unique").on(
      t.orderId,
      t.itemKey,
    ),
    index("order_picking_checks_order_id_idx").on(t.orderId),
    check(
      "order_picking_checks_item_key_non_empty",
      sql`char_length(${t.itemKey}) BETWEEN 1 AND 500`,
    ),
    check(
      "order_picking_checks_checked_by_non_empty",
      sql`char_length(${t.checkedBy}) BETWEEN 1 AND 200`,
    ),
  ],
);

export const insertOrderPickingCheckSchema = createInsertSchema(
  orderPickingChecksTable,
).omit({
  id: true,
  checkedAt: true,
});
export type InsertOrderPickingCheck = z.infer<
  typeof insertOrderPickingCheckSchema
>;
export type OrderPickingCheck = typeof orderPickingChecksTable.$inferSelect;
