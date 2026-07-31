ALTER TABLE "orders"
  ADD COLUMN "credit_spent" numeric(30, 12) DEFAULT 0 NOT NULL;

ALTER TABLE "orders"
  ADD COLUMN "payable_after_credit" numeric(30, 12);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_credit_spent_non_negative"
  CHECK ("credit_spent" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payable_after_credit_non_negative"
  CHECK ("payable_after_credit" IS NULL OR "payable_after_credit" >= 0);

CREATE UNIQUE INDEX "store_credit_transactions_order_spend_unique"
  ON "store_credit_transactions" USING btree ("related_order_id")
  WHERE "type" = 'spend';

CREATE UNIQUE INDEX "store_credit_transactions_order_reversal_unique"
  ON "store_credit_transactions" USING btree ("related_order_id")
  WHERE "type" = 'reversal';
