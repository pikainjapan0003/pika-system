ALTER TABLE "orders" ADD COLUMN "profit_snapshot_cost_jpy" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_exchange_rate" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_product_cost_twd" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_transport_cost_twd" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_unit_profit_twd" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_full_unit_profit_twd" numeric(30, 12);
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_status" text;
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_captured_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "profit_snapshot_backfilled_at" timestamp with time zone;

ALTER TABLE "orders" ADD CONSTRAINT "orders_profit_snapshot_status_valid"
  CHECK ("profit_snapshot_status" IS NULL OR "profit_snapshot_status" IN ('captured', 'pending', 'exempt'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_profit_snapshot_costs_non_negative"
  CHECK (("profit_snapshot_cost_jpy" IS NULL OR "profit_snapshot_cost_jpy" >= 0)
    AND ("profit_snapshot_exchange_rate" IS NULL OR "profit_snapshot_exchange_rate" >= 0)
    AND ("profit_snapshot_product_cost_twd" IS NULL OR "profit_snapshot_product_cost_twd" >= 0)
    AND ("profit_snapshot_transport_cost_twd" IS NULL OR "profit_snapshot_transport_cost_twd" >= 0));

ALTER TABLE "orders" ADD CONSTRAINT "orders_profit_snapshot_shape_valid"
  CHECK ((
      "profit_snapshot_status" IS NULL
      AND "profit_snapshot_cost_jpy" IS NULL
      AND "profit_snapshot_exchange_rate" IS NULL
      AND "profit_snapshot_product_cost_twd" IS NULL
      AND "profit_snapshot_transport_cost_twd" IS NULL
      AND "profit_snapshot_unit_profit_twd" IS NULL
      AND "profit_snapshot_full_unit_profit_twd" IS NULL
      AND "profit_snapshot_captured_at" IS NULL
      AND "profit_snapshot_backfilled_at" IS NULL
    ) OR (
      "profit_snapshot_status" = 'pending'
      AND "profit_snapshot_product_cost_twd" IS NULL
      AND "profit_snapshot_transport_cost_twd" IS NULL
      AND "profit_snapshot_unit_profit_twd" IS NULL
      AND "profit_snapshot_full_unit_profit_twd" IS NULL
      AND "profit_snapshot_captured_at" IS NOT NULL
      AND "profit_snapshot_backfilled_at" IS NULL
    ) OR (
      "profit_snapshot_status" IN ('captured', 'exempt')
      AND "profit_snapshot_cost_jpy" IS NOT NULL
      AND "profit_snapshot_exchange_rate" IS NOT NULL
      AND "profit_snapshot_product_cost_twd" IS NOT NULL
      AND "profit_snapshot_transport_cost_twd" IS NOT NULL
      AND "profit_snapshot_unit_profit_twd" IS NOT NULL
      AND "profit_snapshot_full_unit_profit_twd" IS NOT NULL
      AND "profit_snapshot_captured_at" IS NOT NULL
    ));

ALTER TABLE "orders" ADD CONSTRAINT "orders_profit_snapshot_exempt_transport_zero"
  CHECK ("profit_snapshot_status" <> 'exempt' OR "profit_snapshot_transport_cost_twd" = 0);
