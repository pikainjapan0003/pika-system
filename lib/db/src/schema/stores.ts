import { pgTable, text, serial, timestamp, numeric, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  brandPrimaryColor: text("brand_primary_color").default("#F57572"),
  purchaseExchangeRate: numeric("purchase_exchange_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("stores_merchant_id_idx").on(t.merchantId),
  check(
    "stores_purchase_exchange_rate_non_negative",
    sql`${t.purchaseExchangeRate} IS NULL OR ${t.purchaseExchangeRate} >= 0`,
  ),
]);

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
