import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const costCategoryKinds = ["FIXED", "VARIABLE", "PURCHASE"] as const;
export type CostCategoryKind = (typeof costCategoryKinds)[number];

export const FIXED_COST_CATEGORY_SEEDS = [
  ["PERSONNEL", "人事費用"],
  ["MARKETING", "行銷費用"],
  ["MEALS", "伙食費用"],
  ["FLIGHT", "機票費用"],
  ["LODGING", "住宿費用"],
  ["LOCKER", "置物櫃費用"],
  ["CAR_RENTAL", "租車租金"],
  ["SIM", "網卡費用"],
  ["THEME_PARK", "樂園門票費用"],
  ["AIRPORT_TRANSFER", "接機費用"],
  ["OTHER", "其他"],
] as const;

export const VARIABLE_COST_CATEGORY_SEEDS = [
  ["FUEL", "油錢費用"],
  ["PARKING", "停車費用"],
  ["TRAIN", "電車費用"],
  ["ETC", "ETC費用"],
  ["DOMESTIC_SHIPPING", "日本黑貓物流費用"],
  ["CONSOLIDATION", "日本集運物流費用"],
  ["PACKAGING", "包材費用"],
] as const;

export const PURCHASE_COST_CATEGORY_SEEDS = [
  ["PURCHASE", "商品進貨成本"],
] as const;

export const costCategoriesTable = pgTable(
  "cost_categories",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<CostCategoryKind>().notNull().default("FIXED"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cost_categories_code_unique").on(t.code),
    check(
      "cost_categories_kind_valid",
      sql`${t.kind} IN ('FIXED', 'VARIABLE', 'PURCHASE')`,
    ),
  ],
);

export const insertCostCategorySchema = createInsertSchema(
  costCategoriesTable,
).omit({ id: true, createdAt: true });
export type InsertCostCategory = z.infer<typeof insertCostCategorySchema>;
export type CostCategory = typeof costCategoriesTable.$inferSelect;
