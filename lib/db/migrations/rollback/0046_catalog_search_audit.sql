BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM catalog_audit_events) THEN RAISE EXCEPTION 'catalog audit history prevents rollback' USING ERRCODE='23514'; END IF; END $$;
DROP TRIGGER catalog_shopee_immutable ON shopee_price_observations;
DROP FUNCTION catalog_guard_shopee_history();
DROP TABLE catalog_audit_events;
DROP INDEX catalog_alias_trgm_idx;
DROP INDEX catalog_name_trgm_idx;
-- pg_trgm may predate this migration or support other indexes; retain extension.
COMMIT;
