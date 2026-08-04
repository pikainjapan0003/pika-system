import {
  check,
  integer,
  numeric,
  pgTable,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const OPERATING_SETTINGS_SINGLETON_ID = 1;
export const DEFAULT_REFERENCE_DAILY_WAGE = "1500";
export const PAYMENT_FEE_RATE = "0.015";

export const operatingSettingsTable = pgTable(
  "operating_settings",
  {
    id: integer("id").primaryKey().default(OPERATING_SETTINGS_SINGLETON_ID),
    referenceDailyWage: numeric("reference_daily_wage", {
      precision: 30,
      scale: 12,
    })
      .notNull()
      .default(DEFAULT_REFERENCE_DAILY_WAGE),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "operating_settings_singleton_id",
      sql`${t.id} = ${OPERATING_SETTINGS_SINGLETON_ID}`,
    ),
    check(
      "operating_settings_daily_wage_non_negative",
      sql`${t.referenceDailyWage} >= 0`,
    ),
  ],
);

export const insertOperatingSettingsSchema = createInsertSchema(
  operatingSettingsTable,
).omit({ updatedAt: true });
export type InsertOperatingSettings = z.infer<
  typeof insertOperatingSettingsSchema
>;
export type OperatingSettings = typeof operatingSettingsTable.$inferSelect;
