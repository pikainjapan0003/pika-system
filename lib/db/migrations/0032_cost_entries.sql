CREATE TABLE "cost_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "trip_id" integer NOT NULL,
  "mode" text NOT NULL,
  "category_id" integer,
  "custom_label" text,
  "currency" text NOT NULL,
  "original_amount" numeric(30, 12) NOT NULL,
  "occurred_on" date,
  "description" text,
  "photo_url" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cost_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE cascade,
  CONSTRAINT "cost_entries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade,
  CONSTRAINT "cost_entries_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "cost_categories"("id") ON DELETE restrict,
  CONSTRAINT "cost_entries_mode_valid" CHECK ("mode" IN ('ESTIMATE', 'ACTUAL')),
  CONSTRAINT "cost_entries_currency_valid" CHECK ("currency" IN ('JPY', 'TWD')),
  CONSTRAINT "cost_entries_status_valid" CHECK ("status" IN ('ACTIVE', 'VOID')),
  CONSTRAINT "cost_entries_amount_non_negative" CHECK ("original_amount" >= 0),
  CONSTRAINT "cost_entries_category_or_custom_label" CHECK (("category_id" IS NOT NULL) <> ("custom_label" IS NOT NULL)),
  CONSTRAINT "cost_entries_custom_label_non_empty" CHECK ("custom_label" IS NULL OR char_length(trim("custom_label")) > 0)
);

CREATE INDEX "cost_entries_store_id_idx" ON "cost_entries" USING btree ("store_id");
CREATE INDEX "cost_entries_trip_id_mode_idx" ON "cost_entries" USING btree ("trip_id", "mode");
CREATE UNIQUE INDEX "cost_entries_estimate_category_active_unique"
  ON "cost_entries" USING btree ("trip_id", "category_id")
  WHERE "mode" = 'ESTIMATE' AND "status" = 'ACTIVE' AND "category_id" IS NOT NULL;
