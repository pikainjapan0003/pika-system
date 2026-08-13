CREATE TABLE "trip_areas" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer,
  "trip_id" integer NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trip_areas_trip_id_trips_id_fk"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade,
  CONSTRAINT "trip_areas_trip_id_name_unique" UNIQUE("trip_id", "name")
);

CREATE INDEX "trip_areas_store_id_idx" ON "trip_areas" USING btree ("store_id");
CREATE INDEX "trip_areas_trip_id_idx" ON "trip_areas" USING btree ("trip_id");

CREATE TABLE "trip_area_costs" (
  "id" serial PRIMARY KEY NOT NULL,
  "trip_area_id" integer NOT NULL,
  "mode" text NOT NULL,
  "cardboard_unit_jpy" numeric(30, 12) DEFAULT '0' NOT NULL,
  "shipping_unit_jpy" numeric(30, 12) DEFAULT '0' NOT NULL,
  "parcel_count" integer DEFAULT 0 NOT NULL,
  "estimated_item_quantity" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trip_area_costs_trip_area_id_trip_areas_id_fk"
    FOREIGN KEY ("trip_area_id") REFERENCES "trip_areas"("id") ON DELETE cascade,
  CONSTRAINT "trip_area_costs_trip_area_id_mode_unique" UNIQUE("trip_area_id", "mode"),
  CONSTRAINT "trip_area_costs_mode_valid" CHECK ("mode" IN ('ESTIMATE', 'ACTUAL')),
  CONSTRAINT "trip_area_costs_jpy_inputs_non_negative"
    CHECK ("cardboard_unit_jpy" >= 0 AND "shipping_unit_jpy" >= 0),
  CONSTRAINT "trip_area_costs_parcel_count_non_negative" CHECK ("parcel_count" >= 0),
  CONSTRAINT "trip_area_costs_estimated_item_quantity_positive"
    CHECK ("estimated_item_quantity" IS NULL OR "estimated_item_quantity" > 0)
);

ALTER TABLE "trip_routes" ADD COLUMN "trip_area_id" integer;
ALTER TABLE "trip_routes" ADD CONSTRAINT "trip_routes_trip_area_id_trip_areas_id_fk"
  FOREIGN KEY ("trip_area_id") REFERENCES "trip_areas"("id") ON DELETE set null;
CREATE INDEX "trip_routes_trip_area_id_idx"
  ON "trip_routes" USING btree ("trip_area_id");
