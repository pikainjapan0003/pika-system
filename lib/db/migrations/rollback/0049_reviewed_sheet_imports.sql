BEGIN;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM sheet_import_batches WHERE source_type<>'LEGACY_UNVERIFIED') OR EXISTS(SELECT 1 FROM sheet_import_effects) OR EXISTS(SELECT 1 FROM sheet_import_audit) OR EXISTS(SELECT 1 FROM listing_match_actions)
 THEN RAISE EXCEPTION '0045 rollback refused: reviewed import history exists'; END IF;
END $$;
DROP TRIGGER sheet_import_row_guard ON sheet_import_rows;
DROP TRIGGER sheet_import_batch_guard ON sheet_import_batches;
DROP FUNCTION pdb_import_row_guard();
DROP FUNCTION pdb_import_batch_guard();
DROP TABLE sheet_import_audit;
DROP TABLE sheet_import_effects;
DROP TABLE listing_match_actions;
ALTER TABLE sheet_import_batches DROP CONSTRAINT sheet_import_file_shape,DROP CONSTRAINT sheet_import_source_type,
 DROP COLUMN source_type,DROP COLUMN original_file_sha256,DROP COLUMN original_file_bytes,DROP COLUMN source_meta,
 DROP COLUMN review_version,DROP COLUMN approval_version,DROP COLUMN approval_hash,DROP COLUMN rolled_back_at;
COMMIT;
