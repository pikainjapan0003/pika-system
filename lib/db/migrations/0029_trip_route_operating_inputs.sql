ALTER TABLE "trip_routes" ADD COLUMN "trip_count" integer DEFAULT 1 NOT NULL;
ALTER TABLE "trip_routes" ADD COLUMN "distance_km" numeric(30, 12);
ALTER TABLE "trip_routes" ADD COLUMN "fuel_price_jpy_per_liter" numeric(30, 12);
ALTER TABLE "trip_routes" ADD COLUMN "fuel_efficiency_km_per_liter" numeric(30, 12);

ALTER TABLE "trip_routes" ADD CONSTRAINT "trip_routes_trip_count_positive"
  CHECK ("trip_routes"."trip_count" > 0);
ALTER TABLE "trip_routes" ADD CONSTRAINT "trip_routes_fuel_estimate_inputs_non_negative"
  CHECK (("trip_routes"."distance_km" IS NULL OR "trip_routes"."distance_km" >= 0)
    AND ("trip_routes"."fuel_price_jpy_per_liter" IS NULL OR "trip_routes"."fuel_price_jpy_per_liter" >= 0)
    AND ("trip_routes"."fuel_efficiency_km_per_liter" IS NULL OR "trip_routes"."fuel_efficiency_km_per_liter" >= 0));
