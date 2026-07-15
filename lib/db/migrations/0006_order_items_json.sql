-- Multi-item cart orders: all items stored here as JSONB. Null for single-product orders (legacy compat).
-- IF NOT EXISTS: this column already exists on the shared Development database (added out-of-band
-- by a previous, unmerged feature branch); this migration documents it and makes it safe to apply
-- again on any environment that doesn't have it yet (idempotent, no-op if already present).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "items" jsonb;
