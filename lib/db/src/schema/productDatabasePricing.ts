// Phase 1 foundation. SQL 0041 additionally installs immutable triggers and
// tenant guards for the two legacy optional catalog hints; use SQL to migrate.
import { pgTable, serial, integer, text, numeric, boolean, timestamp, date, jsonb, check, unique, uniqueIndex, index, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { storesTable } from "./stores.ts";

export const PRODUCT_DATABASE_SYSTEM_DEFAULTS = {
  shipping: [{ code: "GENERAL_AIR", rateTwd: "220", basisWeightGrams: "1000" }, { code: "TIGERAIR_BAGGAGE", rateTwd: "1050", basisWeightGrams: "20000" }],
  templates: [{ code: "GENERAL", costAdjustmentMode: "NONE", costAdjustmentRate: "1", departmentStoreFeeRate: "0", shippingCode: "GENERAL_AIR" }, { code: "LIVE", costAdjustmentMode: "NONE", costAdjustmentRate: "1", departmentStoreFeeRate: "0", shippingCode: "GENERAL_AIR" }, { code: "PERFUME", costAdjustmentMode: "RATE", costAdjustmentRate: "0.915", departmentStoreFeeRate: "0.0155", shippingCode: "TIGERAIR_BAGGAGE" }],
} as const;
// Definitions only: no automatic seeding of existing stores.

export const internationalShippingProfilesTable = pgTable("international_shipping_profiles", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rateTwd: numeric("rate_twd", { precision: 30, scale: 12 }).notNull(),
  basisWeightGrams: numeric("basis_weight_grams", { precision: 30, scale: 12 }).notNull(),
  isActive: boolean("is_active").notNull().default(sql.raw("true")),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("international_shipping_profiles_store_id_key").on(t.storeId, t.id),
  unique("international_shipping_profiles_code_key").on(t.storeId, t.code),
  foreignKey({ name: "international_shipping_profiles_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  check("international_shipping_profiles_rate_twd_valid", sql.raw("rate_twd <> 'NaN'::numeric AND rate_twd >= 0")),
  check("international_shipping_profiles_basis_weight_grams_valid", sql.raw("basis_weight_grams <> 'NaN'::numeric AND basis_weight_grams > 0")),
]);

export const pricingTemplatesTable = pgTable("pricing_templates", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  costAdjustmentMode: text("cost_adjustment_mode").notNull(),
  costAdjustmentRate: numeric("cost_adjustment_rate", { precision: 30, scale: 12 }).notNull(),
  departmentStoreFeeRate: numeric("department_store_fee_rate", { precision: 30, scale: 12 }).notNull(),
  defaultShippingProfileId: integer("default_shipping_profile_id"),
  isSystemDefault: boolean("is_system_default").notNull().default(sql.raw("false")),
  isActive: boolean("is_active").notNull().default(sql.raw("true")),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  unique("pricing_templates_store_id_key").on(t.storeId, t.id),
  foreignKey({ name: "pricing_templates_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "pricing_templates_shipping_fk", columns: [t.storeId, t.defaultShippingProfileId], foreignColumns: [internationalShippingProfilesTable.storeId, internationalShippingProfilesTable.id] }).onDelete("restrict"),
  check("pricing_templates_code_valid", sql.raw("code IN ('GENERAL','LIVE','PERFUME','CUSTOM')")),
  check("pricing_templates_cost_adjustment_mode_valid", sql.raw("cost_adjustment_mode IN ('NONE','RATE','MANUAL')")),
  check("pricing_templates_cost_adjustment_rate_valid", sql.raw("cost_adjustment_rate <> 'NaN'::numeric AND cost_adjustment_rate >= 0")),
  check("pricing_templates_department_store_fee_rate_valid", sql.raw("department_store_fee_rate <> 'NaN'::numeric AND department_store_fee_rate >= 0")),
]);

export const storePricingSettingsTable = pgTable("store_pricing_settings", {
  storeId: integer("store_id").notNull().primaryKey(),
  targetMarginRate: numeric("target_margin_rate", { precision: 30, scale: 12 }).notNull().default(sql.raw("0.35")),
  lossProtectionTwd: numeric("loss_protection_twd", { precision: 30, scale: 12 }).notNull().default(sql.raw("5")),
  purchasePaymentFeeRate: numeric("purchase_payment_fee_rate", { precision: 30, scale: 12 }).notNull().default(sql.raw("0.015")),
  routePaymentFeeRate: numeric("route_payment_fee_rate", { precision: 30, scale: 12 }).notNull().default(sql.raw("0.015")),
  staleSaleDays: integer("stale_sale_days").notNull().default(sql.raw("180")),
  profitLossMaxTwd: numeric("profit_loss_max_twd", { precision: 30, scale: 12 }).notNull().default(sql.raw("25")),
  profitLowMaxTwd: numeric("profit_low_max_twd", { precision: 30, scale: 12 }).notNull().default(sql.raw("50")),
  profitMediumMaxTwd: numeric("profit_medium_max_twd", { precision: 30, scale: 12 }).notNull().default(sql.raw("100")),
  settingsVersion: text("settings_version").notNull().default(sql.raw("'v1'")),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
}, (t) => [
  foreignKey({ name: "store_pricing_settings_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  check("store_pricing_settings_target_margin_rate_valid", sql.raw("target_margin_rate <> 'NaN'::numeric AND target_margin_rate >= 0")),
  check("store_pricing_settings_loss_protection_twd_valid", sql.raw("loss_protection_twd <> 'NaN'::numeric AND loss_protection_twd >= 0")),
  check("store_pricing_settings_purchase_payment_fee_rate_valid", sql.raw("purchase_payment_fee_rate <> 'NaN'::numeric AND purchase_payment_fee_rate >= 0")),
  check("store_pricing_settings_route_payment_fee_rate_valid", sql.raw("route_payment_fee_rate <> 'NaN'::numeric AND route_payment_fee_rate >= 0")),
  check("store_pricing_settings_profit_loss_max_twd_valid", sql.raw("profit_loss_max_twd <> 'NaN'::numeric")),
  check("store_pricing_settings_profit_low_max_twd_valid", sql.raw("profit_low_max_twd <> 'NaN'::numeric")),
  check("store_pricing_settings_profit_medium_max_twd_valid", sql.raw("profit_medium_max_twd <> 'NaN'::numeric")),
  check("store_pricing_settings_margin_range", sql.raw("target_margin_rate < 1")),
  check("store_pricing_settings_threshold_order", sql.raw("profit_loss_max_twd < profit_low_max_twd AND profit_low_max_twd < profit_medium_max_twd")),
  check("store_pricing_settings_stale_valid", sql.raw("stale_sale_days > 0")),
]);
