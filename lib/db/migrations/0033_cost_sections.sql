ALTER TABLE "cost_categories"
  ADD COLUMN "kind" text DEFAULT 'FIXED' NOT NULL;

ALTER TABLE "cost_categories"
  ADD CONSTRAINT "cost_categories_kind_valid"
  CHECK ("kind" IN ('FIXED', 'VARIABLE', 'PURCHASE'));

ALTER TABLE "trips"
  ADD COLUMN "unit_gross_profit_twd" numeric(30, 12);
