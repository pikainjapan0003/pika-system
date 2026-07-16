ALTER TABLE "products" ADD COLUMN "vip_price" numeric(10, 2);
ALTER TABLE "products" ADD COLUMN "wholesale_price" numeric(10, 2);
ALTER TABLE "products" ADD COLUMN "partner_price" numeric(10, 2);

ALTER TABLE "products" ADD CONSTRAINT "products_vip_price_non_negative"
  CHECK ("vip_price" IS NULL OR "vip_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_wholesale_price_non_negative"
  CHECK ("wholesale_price" IS NULL OR "wholesale_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_partner_price_non_negative"
  CHECK ("partner_price" IS NULL OR "partner_price" >= 0);
