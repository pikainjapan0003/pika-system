import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const sellerAgentStatusEnum = ["disabled", "enabled"] as const;
export type SellerAgentStatus = (typeof sellerAgentStatusEnum)[number];

// platform_managed_reserved 為保留值，目前不開放選用
export const sellerAgentModeEnum = [
  "self_hosted_webhook",
  "external_agent",
  "rule_worker",
  "platform_managed_reserved",
] as const;
export type SellerAgentMode = (typeof sellerAgentModeEnum)[number];

export const sellerAgentQueryFrequencyEnum = [
  "manual",
  "daily",
  "every_6_hours",
  "every_2_hours_high_tier",
] as const;
export type SellerAgentQueryFrequency =
  (typeof sellerAgentQueryFrequencyEnum)[number];

// enabledLogistics / queryMethods 為 JSONB，白名單僅在應用層驗證，DB 層無 CHECK constraint
export const sellerAgentLogisticsEnum = [
  "seven_eleven",
  "family_mart",
  "home_delivery",
  "other",
  "webhook",
] as const;
export type SellerAgentLogistics = (typeof sellerAgentLogisticsEnum)[number];

export const sellerAgentQueryMethodEnum = [
  "manual",
  "csv_import",
  "webhook",
  "scheduled",
] as const;
export type SellerAgentQueryMethod =
  (typeof sellerAgentQueryMethodEnum)[number];

export const sellerAgentSettingsTable = pgTable(
  "seller_agent_settings",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id").notNull(),
    agentStatus: text("agent_status").notNull().default("disabled"),
    agentMode: text("agent_mode").notNull().default("rule_worker"),
    enabledLogistics: jsonb("enabled_logistics").notNull().default([]),
    queryMethods: jsonb("query_methods").notNull().default(["manual"]),
    queryFrequency: text("query_frequency").notNull().default("manual"),
    notifyOnUnknown: boolean("notify_on_unknown").notNull().default(true),
    requireConfirmOnException: boolean("require_confirm_on_exception")
      .notNull()
      .default(true),
    requireConfirmOnReturned: boolean("require_confirm_on_returned")
      .notNull()
      .default(false),
    requireConfirmOnDelivered: boolean("require_confirm_on_delivered")
      .notNull()
      .default(false),
    hideErrorDetailsFromBuyer: boolean("hide_error_details_from_buyer")
      .notNull()
      .default(true),
    webhookEnabled: boolean("webhook_enabled").notNull().default(false),
    webhookUrl: text("webhook_url"),
    // 只存雜湊值，不存明文；驗證一律以 webhookSecretHash 比對為準
    webhookSecretHash: text("webhook_secret_hash"),
    lastTestRunAt: timestamp("last_test_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("seller_agent_settings_store_id_unique").on(t.storeId),
    index("seller_agent_settings_merchant_id_store_id_idx").on(
      t.merchantId,
      t.storeId,
    ),
    index("seller_agent_settings_agent_status_idx").on(t.agentStatus),
    index("seller_agent_settings_query_frequency_idx").on(t.queryFrequency),
    check(
      "seller_agent_settings_agent_status_valid",
      sql`${t.agentStatus} IN ('disabled', 'enabled')`,
    ),
    check(
      "seller_agent_settings_agent_mode_valid",
      sql`${t.agentMode} IN ('self_hosted_webhook', 'external_agent', 'rule_worker', 'platform_managed_reserved')`,
    ),
    check(
      "seller_agent_settings_query_frequency_valid",
      sql`${t.queryFrequency} IN ('manual', 'daily', 'every_6_hours', 'every_2_hours_high_tier')`,
    ),
  ],
);

export const insertSellerAgentSettingsSchema = createInsertSchema(
  sellerAgentSettingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSellerAgentSettings = z.infer<
  typeof insertSellerAgentSettingsSchema
>;
export type SellerAgentSettings = typeof sellerAgentSettingsTable.$inferSelect;
