ALTER TABLE "customers" ADD COLUMN "tier" text DEFAULT 'general' NOT NULL;

ALTER TABLE "customers" ADD CONSTRAINT "customers_tier_valid"
  CHECK ("tier" IN ('general', 'vip', 'wholesale', 'partner'));
