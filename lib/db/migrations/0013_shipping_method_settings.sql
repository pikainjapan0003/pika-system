ALTER TABLE "stores"
  ADD COLUMN "shipping_cvs_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "stores"
  ADD COLUMN "shipping_black_cat_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "stores"
  ADD COLUMN "shipping_post_office_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "stores"
  ADD COLUMN "shipping_self_pickup_enabled" boolean NOT NULL DEFAULT true;
