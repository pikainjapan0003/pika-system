ALTER TABLE "store_credit_transactions"
  ADD COLUMN "reason_code" text;

ALTER TABLE "store_credit_transactions"
  ADD COLUMN "idempotency_key" text;

ALTER TABLE "store_credit_transactions"
  DROP CONSTRAINT "store_credit_transactions_type_valid";

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_type_valid"
  CHECK ("type" IN ('grant', 'adjust', 'spend', 'reversal'));

ALTER TABLE "store_credit_transactions"
  DROP CONSTRAINT "store_credit_transactions_direction_type_valid";

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_direction_type_valid"
  CHECK (
    ("type" = 'spend' AND "direction" = 'debit')
    OR ("type" IN ('grant', 'reversal') AND "direction" = 'credit')
    OR ("type" = 'adjust' AND "direction" IN ('credit', 'debit'))
  );

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_reason_code_length"
  CHECK (
    "reason_code" IS NULL
    OR char_length("reason_code") BETWEEN 1 AND 100
  );

ALTER TABLE "store_credit_transactions"
  ADD CONSTRAINT "store_credit_transactions_idempotency_key_length"
  CHECK (
    "idempotency_key" IS NULL
    OR char_length("idempotency_key") BETWEEN 1 AND 200
  );

CREATE UNIQUE INDEX "store_credit_transactions_store_idempotency_unique"
  ON "store_credit_transactions" USING btree ("store_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
