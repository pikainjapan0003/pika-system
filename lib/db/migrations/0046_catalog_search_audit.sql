BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX catalog_name_trgm_idx ON catalog_products USING gin (normalized_name gin_trgm_ops);
CREATE INDEX catalog_alias_trgm_idx ON catalog_product_aliases USING gin (normalized_alias gin_trgm_ops);
CREATE TABLE catalog_audit_events (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  catalog_product_id integer,
  action varchar(64) NOT NULL,
  actor varchar(256) NOT NULL CHECK (btrim(actor) <> ''),
  details jsonb NOT NULL CHECK (octet_length(details::text) <= 32768),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX catalog_audit_scope_idx ON catalog_audit_events(store_id,catalog_product_id,id);
CREATE TRIGGER catalog_audit_immutable BEFORE UPDATE OR DELETE ON catalog_audit_events FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE FUNCTION catalog_guard_shopee_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR OLD.status='VOIDED' THEN
  RAISE EXCEPTION 'immutable shopee history' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_shopee_immutable BEFORE UPDATE OR DELETE ON shopee_price_observations FOR EACH ROW EXECUTE FUNCTION catalog_guard_shopee_history();
COMMIT;
