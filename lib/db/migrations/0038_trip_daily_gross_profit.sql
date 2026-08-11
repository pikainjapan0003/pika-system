ALTER TABLE "trips" ADD COLUMN "daily_gross_profit_twd" numeric(30,12);
ALTER TABLE "trips" ADD CONSTRAINT "trips_daily_gross_profit_twd_non_negative"
  CHECK ("trips"."daily_gross_profit_twd" IS NULL
         OR "trips"."daily_gross_profit_twd" >= 0);
