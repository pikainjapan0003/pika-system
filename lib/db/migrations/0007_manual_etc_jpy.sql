-- ETC is a route-level manual input. Existing routes stay NULL until reviewed;
-- NULL is surfaced as "pending confirmation" instead of being treated as zero.
ALTER TABLE "trip_routes" ADD COLUMN "etc_jpy" numeric;

ALTER TABLE "trip_routes" ADD CONSTRAINT "trip_routes_etc_jpy_non_negative"
  CHECK ("etc_jpy" IS NULL OR "etc_jpy" >= 0);
