ALTER TABLE "orders" ADD COLUMN "cart_profit_snapshot_total_twd" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "cart_profit_snapshot_status" text;

ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_profit_snapshot_status_valid"
  CHECK ("cart_profit_snapshot_status" IS NULL OR "cart_profit_snapshot_status" IN ('captured', 'pending'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_profit_snapshot_shape_valid"
  CHECK (("cart_profit_snapshot_status" IS NULL AND "cart_profit_snapshot_total_twd" IS NULL)
    OR ("cart_profit_snapshot_status" = 'pending' AND "cart_profit_snapshot_total_twd" IS NULL)
    OR ("cart_profit_snapshot_status" = 'captured' AND "cart_profit_snapshot_total_twd" IS NOT NULL));
