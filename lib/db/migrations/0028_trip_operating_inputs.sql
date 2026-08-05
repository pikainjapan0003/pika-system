ALTER TABLE "trips" ADD COLUMN "hep_days" integer;
ALTER TABLE "trips" ADD COLUMN "hep_total_jpy" numeric(30, 12);
ALTER TABLE "trips" ADD COLUMN "credit_card_rebate_twd" numeric(30, 12) DEFAULT '0' NOT NULL;
ALTER TABLE "trips" ADD COLUMN "free_shipping_discount_twd" numeric(30, 12) DEFAULT '0' NOT NULL;
ALTER TABLE "trips" ADD COLUMN "bulk_discount_twd" numeric(30, 12) DEFAULT '0' NOT NULL;
ALTER TABLE "trips" ADD COLUMN "card_discount_twd" numeric(30, 12) DEFAULT '0' NOT NULL;
ALTER TABLE "trips" ADD COLUMN "total_item_quantity" integer;

ALTER TABLE "trips" ADD CONSTRAINT "trips_hep_days_valid"
  CHECK ("trips"."hep_days" IS NULL OR "trips"."hep_days" IN (4, 5, 10));
ALTER TABLE "trips" ADD CONSTRAINT "trips_hep_total_jpy_non_negative"
  CHECK ("trips"."hep_total_jpy" IS NULL OR "trips"."hep_total_jpy" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_operating_adjustments_non_negative"
  CHECK ("trips"."credit_card_rebate_twd" >= 0
    AND "trips"."free_shipping_discount_twd" >= 0
    AND "trips"."bulk_discount_twd" >= 0
    AND "trips"."card_discount_twd" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_total_item_quantity_non_negative"
  CHECK ("trips"."total_item_quantity" IS NULL OR "trips"."total_item_quantity" >= 0);
