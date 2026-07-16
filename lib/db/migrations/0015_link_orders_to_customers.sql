ALTER TABLE "orders" ADD COLUMN "customer_id" integer;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null;

CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");
