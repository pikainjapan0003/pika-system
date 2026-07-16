import { pgTable, text, serial, timestamp, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const customerTierEnum = ["general", "vip", "wholesale", "partner"] as const;
export type CustomerTier = typeof customerTierEnum[number];

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  tier: text("tier").notNull().default("general"),
  cvsStoreId: text("cvs_store_id"),
  cvsStoreName: text("cvs_store_name"),
  cvsStoreAddress: text("cvs_store_address"),
  cvsStorePhone: text("cvs_store_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("customers_store_id_idx").on(t.storeId),
  uniqueIndex("customers_store_code_unique").on(t.storeId, t.code),
  check("customers_tier_valid", sql`${t.tier} IN ('general', 'vip', 'wholesale', 'partner')`),
]);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
