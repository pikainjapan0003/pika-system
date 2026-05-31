import { pgTable, text, serial, timestamp, integer, numeric, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";
import { productsTable } from "./products";

export const orderStatusEnum = ["pending", "awaiting_payment", "preparing", "shipped", "completed", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  productName: text("product_name"),
  publicToken: text("public_token").unique(),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone").notNull(),
  pickupMethod: text("pickup_method").notNull(),
  notes: text("notes"),
  specValues: jsonb("spec_values").default({}),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("orders_store_id_idx").on(t.storeId),
  index("orders_product_id_idx").on(t.productId),
  check("orders_status_valid", sql`${t.status} IN ('pending', 'awaiting_payment', 'preparing', 'shipped', 'completed', 'cancelled')`),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
