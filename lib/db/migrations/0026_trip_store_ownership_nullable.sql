-- Phase 1 of trip ownership: add nullable store ownership only.
-- Production backfill, NOT NULL, and foreign keys are intentionally separate.
ALTER TABLE "trips" ADD COLUMN "store_id" integer;
ALTER TABLE "trip_routes" ADD COLUMN "store_id" integer;

CREATE INDEX "trips_store_id_idx" ON "trips" USING btree ("store_id");
CREATE INDEX "trip_routes_store_id_idx" ON "trip_routes" USING btree ("store_id");
