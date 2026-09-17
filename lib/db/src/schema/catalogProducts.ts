// Phase 1 foundation. SQL 0041 additionally installs immutable triggers and
// tenant guards for the two legacy optional catalog hints; use SQL to migrate.
import { pgTable, serial, integer, text, numeric, boolean, timestamp, date, jsonb, check, unique, uniqueIndex, index, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { storesTable } from "./stores.ts";
import { productCategoriesTable } from "./productCategories.ts";
import { tripRoutesTable } from "./tripRoutes.ts";
import { pricingTemplatesTable } from "./productDatabasePricing.ts";
import { internationalShippingProfilesTable } from "./productDatabasePricing.ts";

export const catalogProductsTable = pgTable("catalog_products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  barcode: text("barcode").notNull(),
  barcodeStatus: text("barcode_status").notNull(),
  weightGrams: numeric("weight_grams", { precision: 12, scale: 2 }).notNull(),
  categoryId: integer("category_id"),
  status: text("status").notNull().default(sql.raw("'NORMAL'")),
  imageUrl: text("image_url"),
  internalNote: text("internal_note"),
  preferredRouteLabel: text("preferred_route_label"),
  lastUsedTripRouteId: integer("last_used_trip_route_id"),
  defaultPricingTemplateId: integer("default_pricing_template_id"),
  defaultShippingProfileId: integer("default_shipping_profile_id"),
  defaultDepartmentStoreFeeRate: numeric("default_department_store_fee_rate", { precision: 30, scale: 12 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  unique("catalog_products_store_id_key").on(t.storeId, t.id),
  index("catalog_products_barcode_idx").on(t.storeId, t.barcode),
  index("catalog_products_normalized_name_idx").on(t.storeId, t.normalizedName),
  index("catalog_products_status_idx").on(t.storeId, t.status),
  index("catalog_products_category_id_idx").on(t.storeId, t.categoryId),
  foreignKey({ name: "catalog_products_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("cascade"),
  foreignKey({ name: "catalog_products_category_fk", columns: [t.categoryId], foreignColumns: [productCategoriesTable.id] }).onDelete("set null"),
  foreignKey({ name: "catalog_products_route_fk", columns: [t.lastUsedTripRouteId], foreignColumns: [tripRoutesTable.id] }).onDelete("set null"),
  foreignKey({ name: "catalog_products_template_fk", columns: [t.storeId, t.defaultPricingTemplateId], foreignColumns: [pricingTemplatesTable.storeId, pricingTemplatesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "catalog_products_shipping_fk", columns: [t.storeId, t.defaultShippingProfileId], foreignColumns: [internationalShippingProfilesTable.storeId, internationalShippingProfilesTable.id] }).onDelete("restrict"),
  check("catalog_products_names_nonempty", sql.raw("btrim(name) <> '' AND btrim(normalized_name) <> ''")),
  check("catalog_products_barcode_valid", sql.raw("(barcode_status = 'NONE' AND barcode = '0') OR (barcode_status = 'REAL' AND barcode ~ '^[0-9]+$' AND barcode <> '0')")),
  check("catalog_products_status_valid", sql.raw("status IN ('NORMAL','DISCONTINUED','ARCHIVED')")),
  check("catalog_products_weight_grams_valid", sql.raw("weight_grams <> 'NaN'::numeric AND weight_grams >= 0")),
  check("catalog_products_default_department_store_fee_rate_valid", sql.raw("default_department_store_fee_rate <> 'NaN'::numeric AND default_department_store_fee_rate >= 0")),
]);

export const catalogProductAliasesTable = pgTable("catalog_product_aliases", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  catalogProductId: integer("catalog_product_id").notNull(),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("catalog_product_aliases_store_id_key").on(t.storeId, t.id),
  unique("catalog_product_aliases_alias_key").on(t.catalogProductId, t.normalizedAlias),
  foreignKey({ name: "catalog_product_aliases_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "catalog_product_aliases_catalog_fk", columns: [t.storeId, t.catalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  check("catalog_product_aliases_source_valid", sql.raw("source IN ('RENAMED','MANUAL','SHEET')")),
  check("catalog_product_aliases_name_nonempty", sql.raw("btrim(alias) <> '' AND btrim(normalized_alias) <> ''")),
]);

export const productCostRecordsTable = pgTable("product_cost_records", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  catalogProductId: integer("catalog_product_id").notNull(),
  originalPriceJpy: numeric("original_price_jpy", { precision: 30, scale: 12 }).notNull(),
  effectiveCostJpy: numeric("effective_cost_jpy", { precision: 30, scale: 12 }).notNull(),
  adjustmentMode: text("adjustment_mode").notNull(),
  adjustmentRate: numeric("adjustment_rate", { precision: 30, scale: 12 }),
  adjustmentReason: text("adjustment_reason"),
  observedAt: date("observed_at"),
  source: text("source").notNull(),
  status: text("status").notNull().default(sql.raw("'ACTIVE'")),
  isCurrent: boolean("is_current").notNull().default(sql.raw("false")),
  supersedesCostRecordId: integer("supersedes_cost_record_id"),
  voidReasonCode: text("void_reason_code"),
  voidReasonText: text("void_reason_text"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: text("voided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("product_cost_records_store_id_key").on(t.storeId, t.id),
  unique("product_cost_records_catalog_id_key").on(t.storeId, t.catalogProductId, t.id),
  uniqueIndex("product_cost_records_one_current").on(t.storeId, t.catalogProductId).where(sql.raw("status = 'ACTIVE' AND is_current")),
  foreignKey({ name: "product_cost_records_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "product_cost_records_catalog_fk", columns: [t.storeId, t.catalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  foreignKey({ name: "product_cost_records_supersedes_fk", columns: [t.storeId, t.catalogProductId, t.supersedesCostRecordId], foreignColumns: [t.storeId, t.catalogProductId, t.id] }).onDelete("restrict"),
  check("product_cost_records_no_self", sql.raw("supersedes_cost_record_id IS NULL OR supersedes_cost_record_id <> id")),
  check("product_cost_records_adjustment_mode_valid", sql.raw("adjustment_mode IN ('NONE','RATE','MANUAL')")),
  check("product_cost_records_source_valid", sql.raw("source IN ('MANUAL','SHEET_IMPORT','ORDER')")),
  check("product_cost_records_status_valid", sql.raw("status IN ('ACTIVE','VOIDED')")),
  check("product_cost_records_original_price_jpy_valid", sql.raw("original_price_jpy <> 'NaN'::numeric AND original_price_jpy >= 0")),
  check("product_cost_records_effective_cost_jpy_valid", sql.raw("effective_cost_jpy <> 'NaN'::numeric AND effective_cost_jpy >= 0")),
  check("product_cost_records_adjustment_rate_valid", sql.raw("adjustment_rate <> 'NaN'::numeric AND adjustment_rate >= 0")),
  check("product_cost_records_rate_required", sql.raw("adjustment_mode <> 'RATE' OR adjustment_rate IS NOT NULL")),
  check("product_cost_records_void_shape", sql.raw("(status = 'ACTIVE' AND void_reason_code IS NULL AND void_reason_text IS NULL AND voided_at IS NULL AND voided_by IS NULL) OR (status = 'VOIDED' AND NOT is_current AND void_reason_code IS NOT NULL AND btrim(void_reason_code) <> '' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND btrim(voided_by) <> '' AND (void_reason_code <> 'OTHER' OR (void_reason_text IS NOT NULL AND btrim(void_reason_text) <> '')))")),
]);

export const shopeePriceObservationsTable = pgTable("shopee_price_observations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  catalogProductId: integer("catalog_product_id").notNull(),
  priceTwd: numeric("price_twd", { precision: 30, scale: 12 }).notNull(),
  observedAt: date("observed_at"),
  sourceUrl: text("source_url"),
  note: text("note"),
  source: text("source").notNull(),
  status: text("status").notNull().default(sql.raw("'ACTIVE'")),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("shopee_price_observations_store_id_key").on(t.storeId, t.id),
  foreignKey({ name: "shopee_price_observations_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "shopee_price_observations_catalog_fk", columns: [t.storeId, t.catalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  check("shopee_price_observations_price_twd_valid", sql.raw("price_twd <> 'NaN'::numeric AND price_twd >= 0")),
  check("shopee_price_observations_source_valid", sql.raw("source IN ('MANUAL','SHEET_IMPORT')")),
  check("shopee_price_observations_status_valid", sql.raw("status IN ('ACTIVE','VOIDED')")),
]);

export const productRelationshipsTable = pgTable("product_relationships", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  sourceCatalogProductId: integer("source_catalog_product_id").notNull(),
  targetCatalogProductId: integer("target_catalog_product_id").notNull(),
  relationType: text("relation_type").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("product_relationships_store_id_key").on(t.storeId, t.id),
  unique("product_relationships_pair_key").on(t.storeId, t.sourceCatalogProductId, t.targetCatalogProductId),
  foreignKey({ name: "product_relationships_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "product_relationships_source_fk", columns: [t.storeId, t.sourceCatalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  foreignKey({ name: "product_relationships_target_fk", columns: [t.storeId, t.targetCatalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  check("product_relationships_ordered", sql.raw("source_catalog_product_id < target_catalog_product_id")),
  check("product_relationships_relation_type_valid", sql.raw("relation_type IN ('POSSIBLE_DUPLICATE','RELATED')")),
]);
