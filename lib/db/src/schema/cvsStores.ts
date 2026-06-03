import { pgTable, text, serial, timestamp, boolean, numeric, index, unique } from "drizzle-orm/pg-core";

export const cvsStoresTable = pgTable("cvs_stores", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("seven"), // seven | family | ok | hilife
  storeId: text("store_id").notNull(),
  storeName: text("store_name").notNull(),
  storeAddress: text("store_address").notNull().default(""),
  storePhone: text("store_phone"),
  city: text("city"),
  district: text("district"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  businessHours: text("business_hours"),
  deliveryStatus: text("delivery_status"),
  isActive: boolean("is_active").notNull().default(true),
  // source: manual_seed | lemai_store_db | future_openclaw_update
  source: text("source").notNull().default("manual_seed"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("cvs_stores_provider_store_id_idx").on(t.provider, t.storeId),
  index("cvs_stores_city_district_idx").on(t.city, t.district),
  unique("cvs_stores_provider_store_id_unique").on(t.provider, t.storeId),
]);

export type CvsStoreRow = typeof cvsStoresTable.$inferSelect;
