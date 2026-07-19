import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { sellerAgentTokensTable } from "./sellerAgentTokens.ts";

export const agentRunTypeEnum = [
  "manual",
  "scheduled",
  "webhook",
  "csv_after_import",
  "test",
] as const;
export type AgentRunType = (typeof agentRunTypeEnum)[number];

export const agentRunStatusEnum = [
  "running",
  "completed",
  "failed",
  "partial",
] as const;
export type AgentRunStatus = (typeof agentRunStatusEnum)[number];

export const agentRunLogsTable = pgTable(
  "agent_run_logs",
  {
    id: serial("id").primaryKey(),
    // onDelete: "set null"——刪除 token 時保留執行歷史，避免稽核資料遺失
    tokenId: integer("token_id").references(() => sellerAgentTokensTable.id, {
      onDelete: "set null",
    }),
    merchantId: text("merchant_id").notNull(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    runType: text("run_type").notNull(),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    checkedCount: integer("checked_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorCode: text("error_code"),
    // 僅記錄可安全呈現的錯誤摘要，不可包含 token 明文、敏感憑證、個資或完整 stack trace
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_run_logs_token_id_idx").on(t.tokenId),
    index("agent_run_logs_store_id_idx").on(t.storeId),
    index("agent_run_logs_merchant_id_store_id_idx").on(
      t.merchantId,
      t.storeId,
    ),
    index("agent_run_logs_status_idx").on(t.status),
    index("agent_run_logs_started_at_idx").on(t.startedAt),
    index("agent_run_logs_created_at_idx").on(t.createdAt),
    check(
      "agent_run_logs_run_type_valid",
      sql`${t.runType} IN ('manual', 'scheduled', 'webhook', 'csv_after_import', 'test')`,
    ),
    check(
      "agent_run_logs_status_valid",
      sql`${t.status} IN ('running', 'completed', 'failed', 'partial')`,
    ),
    check(
      "agent_run_logs_counts_non_negative",
      sql`${t.checkedCount} >= 0 AND ${t.successCount} >= 0 AND ${t.failedCount} >= 0`,
    ),
  ],
);

export const insertAgentRunLogSchema = createInsertSchema(
  agentRunLogsTable,
).omit({ id: true, createdAt: true });
export type InsertAgentRunLog = z.infer<typeof insertAgentRunLogSchema>;
export type AgentRunLog = typeof agentRunLogsTable.$inferSelect;
