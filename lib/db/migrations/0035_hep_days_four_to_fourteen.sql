ALTER TABLE "trips" DROP CONSTRAINT "trips_hep_days_valid";
ALTER TABLE "trips" ADD CONSTRAINT "trips_hep_days_valid"
  CHECK ("trips"."hep_days" IS NULL
         OR ("trips"."hep_days" >= 4 AND "trips"."hep_days" <= 14));
