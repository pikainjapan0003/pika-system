ALTER TABLE "stores" ADD COLUMN "purchase_exchange_rate" numeric;
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_purchase_exchange_rate_non_negative" CHECK ("stores"."purchase_exchange_rate" IS NULL OR "stores"."purchase_exchange_rate" >= 0);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_jpy" numeric;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_transport_cost_exempt" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost_jpy_non_negative" CHECK ("products"."cost_jpy" IS NULL OR "products"."cost_jpy" >= 0);
