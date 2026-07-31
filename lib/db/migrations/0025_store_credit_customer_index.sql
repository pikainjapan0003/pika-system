-- Supports customer_id-only FK checks and customer-scoped ledger lookups.
-- The existing (store_id, customer_id, created_at) index cannot serve this
-- query when store_id is not part of the predicate.
CREATE INDEX "store_credit_transactions_customer_id_idx"
  ON "store_credit_transactions" USING btree ("customer_id");
