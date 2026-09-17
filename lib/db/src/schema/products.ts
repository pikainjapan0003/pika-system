import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  check,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { productCategoriesTable } from "./productCategories.ts";
import { tripRoutesTable } from "./tripRoutes.ts";
import { catalogProductsTable } from "./catalogProducts.ts";
import { pricingTemplatesTable, internationalShippingProfilesTable } from "./productDatabasePricing.ts";

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    catalogProductId: integer("catalog_product_id"),
    weightGrams: numeric("weight_grams", { precision: 12, scale: 2 }),
    originalPriceJpy: numeric("original_price_jpy", { precision: 30, scale: 12 }),
    effectiveCostJpy: numeric("effective_cost_jpy", { precision: 30, scale: 12 }),
    pricingTemplateId: integer("pricing_template_id"),
    internationalShippingProfileId: integer("international_shipping_profile_id"),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    vipPrice: numeric("vip_price", { precision: 10, scale: 2 }),
    wholesalePrice: numeric("wholesale_price", { precision: 10, scale: 2 }),
    partnerPrice: numeric("partner_price", { precision: 10, scale: 2 }),
    specs: jsonb("specs").default([]),
    inventory: integer("inventory"),
    imageUrl: text("image_url"),
    shareToken: text("share_token").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    orderDeadlineAt: timestamp("order_deadline_at", { withTimezone: true }),
    internalNote: text("internal_note"),
    skuCode: text("sku_code"),
    storageTemp: text("storage_temp"),
    storageTempClass: text("storage_temp_class"),
    shelfLife: text("shelf_life"),
    weightKg: numeric("weight_kg", { precision: 8, scale: 3 }),
    costJpy: numeric("cost_jpy"),
    isTransportCostExempt: boolean("is_transport_cost_exempt")
      .notNull()
      .default(false),
    categoryId: integer("category_id").references(
      () => productCategoriesTable.id,
      {
        onDelete: "set null",
      },
    ),
    tripRouteId: integer("trip_route_id").references(() => tripRoutesTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("products_store_id_key").on(t.storeId, t.id),
    foreignKey({ name: "products_pricing_template_fk", columns: [t.storeId, t.pricingTemplateId], foreignColumns: [pricingTemplatesTable.storeId, pricingTemplatesTable.id] }).onDelete("restrict"),
    foreignKey({ name: "products_shipping_profile_fk", columns: [t.storeId, t.internationalShippingProfileId], foreignColumns: [internationalShippingProfilesTable.storeId, internationalShippingProfilesTable.id] }).onDelete("restrict"),
    foreignKey({ name: "products_catalog_fk", columns: [t.storeId, t.catalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
    index("products_store_id_idx").on(t.storeId),
    index("products_trip_route_id_idx").on(t.tripRouteId),
    check("inventory_non_negative", sql`${t.inventory} >= 0`),
    check(
      "products_vip_price_non_negative",
      sql`${t.vipPrice} IS NULL OR ${t.vipPrice} >= 0`,
    ),
    check(
      "products_wholesale_price_non_negative",
      sql`${t.wholesalePrice} IS NULL OR ${t.wholesalePrice} >= 0`,
    ),
    check(
      "products_partner_price_non_negative",
      sql`${t.partnerPrice} IS NULL OR ${t.partnerPrice} >= 0`,
    ),
    check(
      "products_cost_jpy_non_negative",
      sql`${t.costJpy} IS NULL OR ${t.costJpy} >= 0`,
    ),
    check(
      "storage_temp_valid",
      sql`${t.storageTemp} IS NULL OR ${t.storageTemp} IN ('ambient','chilled','frozen')`,
    ),
    check(
      "products_storage_temp_class_valid",
      sql`${t.storageTempClass} IS NULL OR ${t.storageTempClass} IN ('normal','frozen')`,
    ),
  ],
);

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
