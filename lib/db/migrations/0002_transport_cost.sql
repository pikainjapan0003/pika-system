-- Generated with Drizzle Kit from the isolated trips/trip_routes schema.
-- The repository has no migration snapshot baseline, so generation was scoped to
-- these new tables to avoid recreating pre-existing production tables.

CREATE TABLE "trip_routes" (
  "id" serial PRIMARY KEY NOT NULL,
  "trip_id" integer NOT NULL,
  "area_title" text NOT NULL,
  "start_place" text NOT NULL,
  "end_place" text NOT NULL,
  "train_jpy" numeric DEFAULT '0' NOT NULL,
  "fuel_jpy" numeric DEFAULT '0' NOT NULL,
  "parking_jpy" numeric DEFAULT '0' NOT NULL,
  "est_qty" integer NOT NULL,
  "cardboard_jpy" numeric DEFAULT '0' NOT NULL,
  "shipping_jpy" numeric DEFAULT '0' NOT NULL,
  "parcel_count" integer DEFAULT 0 NOT NULL,
  "etc_jpy_override" numeric,
  "etc_jpy_is_overridden" boolean DEFAULT false NOT NULL,
  "fee_1_5pct_override" numeric,
  "fee_1_5pct_is_overridden" boolean DEFAULT false NOT NULL,
  "total_jpy_override" numeric,
  "total_jpy_is_overridden" boolean DEFAULT false NOT NULL,
  "domestic_per_item_override" numeric,
  "domestic_per_item_is_overridden" boolean DEFAULT false NOT NULL,
  "transport_per_item_override" numeric,
  "transport_per_item_is_overridden" boolean DEFAULT false NOT NULL,
  "final_cost_per_item_override" numeric,
  "final_cost_per_item_is_overridden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trip_routes_trip_id_area_title_unique" UNIQUE("trip_id","area_title"),
  CONSTRAINT "trip_routes_est_qty_positive" CHECK ("trip_routes"."est_qty" > 0),
  CONSTRAINT "trip_routes_parcel_count_non_negative" CHECK ("trip_routes"."parcel_count" >= 0),
  CONSTRAINT "trip_routes_jpy_inputs_non_negative" CHECK ("trip_routes"."train_jpy" >= 0 AND "trip_routes"."fuel_jpy" >= 0 AND "trip_routes"."parking_jpy" >= 0 AND "trip_routes"."cardboard_jpy" >= 0 AND "trip_routes"."shipping_jpy" >= 0),
  CONSTRAINT "trip_routes_overrides_valid" CHECK ((NOT "trip_routes"."etc_jpy_is_overridden" OR "trip_routes"."etc_jpy_override" IS NOT NULL)
    AND (NOT "trip_routes"."fee_1_5pct_is_overridden" OR "trip_routes"."fee_1_5pct_override" IS NOT NULL)
    AND (NOT "trip_routes"."total_jpy_is_overridden" OR "trip_routes"."total_jpy_override" IS NOT NULL)
    AND (NOT "trip_routes"."domestic_per_item_is_overridden" OR "trip_routes"."domestic_per_item_override" IS NOT NULL)
    AND (NOT "trip_routes"."transport_per_item_is_overridden" OR "trip_routes"."transport_per_item_override" IS NOT NULL)
    AND (NOT "trip_routes"."final_cost_per_item_is_overridden" OR "trip_routes"."final_cost_per_item_override" IS NOT NULL)),
  CONSTRAINT "trip_routes_override_values_non_negative" CHECK (("trip_routes"."etc_jpy_override" IS NULL OR "trip_routes"."etc_jpy_override" >= 0)
    AND ("trip_routes"."fee_1_5pct_override" IS NULL OR "trip_routes"."fee_1_5pct_override" >= 0)
    AND ("trip_routes"."total_jpy_override" IS NULL OR "trip_routes"."total_jpy_override" >= 0)
    AND ("trip_routes"."domestic_per_item_override" IS NULL OR "trip_routes"."domestic_per_item_override" >= 0)
    AND ("trip_routes"."transport_per_item_override" IS NULL OR "trip_routes"."transport_per_item_override" >= 0)
    AND ("trip_routes"."final_cost_per_item_override" IS NULL OR "trip_routes"."final_cost_per_item_override" >= 0))
);
--> statement-breakpoint
CREATE TABLE "trips" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "exchange_rate" numeric,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_routes" ADD CONSTRAINT "trip_routes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trip_routes_trip_id_idx" ON "trip_routes" USING btree ("trip_id");
