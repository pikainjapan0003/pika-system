CREATE TABLE "order_picking_checks" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "item_key" text NOT NULL,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "checked_by" text NOT NULL,
  CONSTRAINT "order_picking_checks_item_key_non_empty"
    CHECK (char_length("item_key") BETWEEN 1 AND 500),
  CONSTRAINT "order_picking_checks_checked_by_non_empty"
    CHECK (char_length("checked_by") BETWEEN 1 AND 200)
);

ALTER TABLE "order_picking_checks"
  ADD CONSTRAINT "order_picking_checks_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "order_picking_checks_order_item_unique"
  ON "order_picking_checks" USING btree ("order_id", "item_key");

CREATE INDEX "order_picking_checks_order_id_idx"
  ON "order_picking_checks" USING btree ("order_id");
