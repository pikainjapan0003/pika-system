import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { storesTable } from "./stores.ts";

export const storeSkillStatesTable = pgTable(
  "store_skill_states",
  {
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    enabledBy: text("enabled_by"),
    catalogVersion: integer("catalog_version").notNull().default(1),
    source: text("source").notNull().default("manual"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.skillKey] }),
    index("store_skill_states_store_enabled_idx").on(
      table.storeId,
      table.enabled,
    ),
    check(
      "store_skill_states_source_valid",
      sql`${table.source} IN ('manual', 'package', 'onboarding')`,
    ),
    check(
      "store_skill_states_catalog_version_positive",
      sql`${table.catalogVersion} > 0`,
    ),
    check(
      "store_skill_states_enabled_shape",
      sql`(${table.enabled} = false) OR (${table.enabledAt} IS NOT NULL AND ${table.enabledBy} IS NOT NULL)`,
    ),
  ],
);

export type StoreSkillState = typeof storeSkillStatesTable.$inferSelect;
