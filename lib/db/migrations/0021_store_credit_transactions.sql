CREATE TABLE "store_credit_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "direction" text NOT NULL,
  "type" text NOT NULL,
  "amount" numeric(30, 12) NOT NULL,
  "related_order_id" integer,
  "note" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_credit_transactions_direction_valid"
    CHECK ("direction" IN ('credit', 'debit')),
  CONSTRAINT "store_credit_transactions_type_valid"
    CHECK ("type" IN ('grant', 'spend', 'reversal')),
  CONSTRAINT "store_credit_transactions_amount_positive"
    CHECK ("amount" > 0),
  CONSTRAINT "store_credit_transactions_direction_type_valid"
    CHECK (
      ("type" = 'spend' AND "direction" = 'debit')
      OR ("type" IN ('grant', 'reversal') AND "direction" = 'credit')
    )
);

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_related_order_id_orders_id_fk"
  FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE INDEX "store_credit_transactions_store_customer_created_idx"
  ON "store_credit_transactions" USING btree ("store_id", "customer_id", "created_at");

CREATE INDEX "store_credit_transactions_related_order_idx"
  ON "store_credit_transactions" USING btree ("related_order_id");

CREATE FUNCTION "reject_store_credit_transaction_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'store_credit_transactions is append-only';
END;
$$;

CREATE TRIGGER "store_credit_transactions_reject_update"
BEFORE UPDATE ON "store_credit_transactions"
FOR EACH ROW EXECUTE FUNCTION "reject_store_credit_transaction_mutation"();

CREATE TRIGGER "store_credit_transactions_reject_delete"
BEFORE DELETE ON "store_credit_transactions"
FOR EACH ROW EXECUTE FUNCTION "reject_store_credit_transaction_mutation"();
