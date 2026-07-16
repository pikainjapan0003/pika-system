import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { storesTable } from "./stores.ts";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_store_at_idx").on(table.storeId, table.at),
    check("audit_logs_actor_non_empty", sql`char_length(${table.actor}) BETWEEN 1 AND 200`),
    check("audit_logs_action_non_empty", sql`char_length(${table.action}) BETWEEN 1 AND 100`),
    check("audit_logs_target_non_empty", sql`char_length(${table.target}) BETWEEN 1 AND 200`),
  ],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
