-- Forward-only, nullable additions preserve historical orders and snapshots.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_client_request_unique
  ON orders (store_id, client_request_id) WHERE client_request_id IS NOT NULL;
