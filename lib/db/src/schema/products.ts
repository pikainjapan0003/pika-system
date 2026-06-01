import { pgTable, text, serial, timestamp, integer, numeric, boolean, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";
import { productCategoriesTable } from "./productCategories";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  specs: jsonb("specs").default([]),
  inventory: integer("inventory"),
  imageUrl: text("image_url"),
  shareToken: text("share_token").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  orderDeadlineAt: timestamp("order_deadline_at", { withTimezone: true }),
  internalNote: text("internal_note"),
  skuCode: text("sku_code"),
  storageTemp: text("storage_temp"),
  shelfLife: text("shelf_life"),
  weightKg: numeric("weight_kg", { precision: 8, scale: 3 }),
  categoryId: integer("category_id").references(() => productCategoriesTable.id, {
    onDelete: "set null",
  }),
}, (t) => [
  index("products_store_id_idx").on(t.storeId),
  check("inventory_non_negative", sql`${t.inventory} >= 0`),
  check(
    "storage_temp_valid",
    sql`${t.storageTemp} IS NULL OR ${t.storageTemp} IN ('ambient','chilled','frozen')`
  ),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
