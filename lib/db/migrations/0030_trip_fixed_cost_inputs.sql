ALTER TABLE "trips" ADD COLUMN "status" text DEFAULT 'PLANNING' NOT NULL;
ALTER TABLE "trips" ADD COLUMN "start_date" date;
ALTER TABLE "trips" ADD COLUMN "end_date" date;
ALTER TABLE "trips" ADD COLUMN "working_days" integer;
ALTER TABLE "trips" ADD COLUMN "actual_exchange_rate" numeric(30, 12);
ALTER TABLE "trips" ADD COLUMN "estimate_locked" boolean DEFAULT false NOT NULL;
ALTER TABLE "trips" ADD COLUMN "estimate_modified_after_lock" boolean DEFAULT false NOT NULL;

ALTER TABLE "trips" ADD CONSTRAINT "trips_status_valid"
  CHECK ("trips"."status" IN ('PLANNING', 'ACTIVE', 'CLOSED'));
ALTER TABLE "trips" ADD CONSTRAINT "trips_date_range_valid"
  CHECK ("trips"."start_date" IS NULL OR "trips"."end_date" IS NULL OR "trips"."end_date" >= "trips"."start_date");
ALTER TABLE "trips" ADD CONSTRAINT "trips_working_days_positive"
  CHECK ("trips"."working_days" IS NULL OR "trips"."working_days" > 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_actual_exchange_rate_non_negative"
  CHECK ("trips"."actual_exchange_rate" IS NULL OR "trips"."actual_exchange_rate" >= 0);
