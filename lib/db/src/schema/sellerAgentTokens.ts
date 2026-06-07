import { pgTable, text, serial, timestamp, integer, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";

export const sellerAgentTokenStatusEnum = [
  "active",
  "revoked",
  "expired",
  "disabled",
] as const;
export type SellerAgentTokenStatus = typeof sellerAgentTokenStatusEnum[number];

export const sellerAgentTokensTable = pgTable("seller_agent_tokens", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // 只存雜湊值，不存明文；驗證一律以 tokenHash 比對為準
  tokenHash: text("token_hash").notNull(),
  // 明文前 8～12 碼，僅供使用者於介面辨識，不可用於驗證
  tokenPrefix: text("token_prefix").notNull(),
  status: text("status").notNull().default("active"),
  scopes: jsonb("scopes").notNull().default(["tracking:read", "tracking:write", "run_log:write"]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("seller_agent_tokens_store_id_idx").on(t.storeId),
  index("seller_agent_tokens_merchant_id_store_id_idx").on(t.merchantId, t.storeId),
  index("seller_agent_tokens_token_prefix_idx").on(t.tokenPrefix),
  index("seller_agent_tokens_status_idx").on(t.status),
  index("seller_agent_tokens_expires_at_idx").on(t.expiresAt),
  unique("seller_agent_tokens_token_hash_unique").on(t.tokenHash),
  check("seller_agent_tokens_status_valid", sql`${t.status} IN ('active', 'revoked', 'expired', 'disabled')`),
]);

export const insertSellerAgentTokenSchema = createInsertSchema(sellerAgentTokensTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSellerAgentToken = z.infer<typeof insertSellerAgentTokenSchema>;
export type SellerAgentToken = typeof sellerAgentTokensTable.$inferSelect;
