import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const productCategoriesTable = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_categories_store_id_idx").on(t.storeId),
    unique("product_categories_store_name_unique").on(t.storeId, t.name),
  ],
);
