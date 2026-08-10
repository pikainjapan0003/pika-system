ALTER TABLE "cost_entries" ADD COLUMN "trip_route_id" integer;
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_trip_route_id_trip_routes_id_fk"
  FOREIGN KEY ("trip_route_id") REFERENCES "trip_routes"("id") ON DELETE restrict;

DROP INDEX "cost_entries_estimate_category_active_unique";

CREATE UNIQUE INDEX "cost_entries_estimate_category_route_active_unique"
  ON "cost_entries" USING btree ("trip_id", "category_id", "trip_route_id")
  WHERE "mode" = 'ESTIMATE' AND "status" = 'ACTIVE'
    AND "category_id" IS NOT NULL AND "trip_route_id" IS NOT NULL;

CREATE UNIQUE INDEX "cost_entries_estimate_category_tripwide_active_unique"
  ON "cost_entries" USING btree ("trip_id", "category_id")
  WHERE "mode" = 'ESTIMATE' AND "status" = 'ACTIVE'
    AND "category_id" IS NOT NULL AND "trip_route_id" IS NULL;
