BEGIN;
ALTER TABLE sheet_import_batches
 ADD COLUMN source_type text NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
 ADD COLUMN original_file_sha256 text,
 ADD COLUMN original_file_bytes bytea,
 ADD COLUMN source_meta jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN review_version integer NOT NULL DEFAULT 0,
 ADD COLUMN approval_version integer,
 ADD COLUMN approval_hash text,
 ADD COLUMN rolled_back_at timestamptz,
 ADD CONSTRAINT sheet_import_source_type CHECK(source_type IN ('LEGACY_UNVERIFIED','XLSX_UPLOAD','STRUCTURED_CELLS')),
 ADD CONSTRAINT sheet_import_file_shape CHECK((source_type='XLSX_UPLOAD' AND original_file_sha256 ~ '^[0-9a-f]{64}$' AND original_file_bytes IS NOT NULL) OR (source_type<>'XLSX_UPLOAD' AND original_file_sha256 IS NULL AND original_file_bytes IS NULL));
CREATE TABLE sheet_import_effects(
 id serial PRIMARY KEY, store_id integer NOT NULL, batch_id integer NOT NULL, row_id integer NOT NULL,
 catalog_product_id integer NOT NULL, created_catalog boolean NOT NULL,
 created_cost_record_id integer, previous_cost_record_id integer, created_shopee_id integer,
 catalog_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(store_id,row_id), UNIQUE(store_id,id),
 FOREIGN KEY(store_id,batch_id) REFERENCES sheet_import_batches(store_id,id),
 FOREIGN KEY(store_id,row_id) REFERENCES sheet_import_rows(store_id,id),
 FOREIGN KEY(store_id,catalog_product_id) REFERENCES catalog_products(store_id,id),
 FOREIGN KEY(store_id,catalog_product_id,created_cost_record_id) REFERENCES product_cost_records(store_id,catalog_product_id,id),
 FOREIGN KEY(store_id,catalog_product_id,previous_cost_record_id) REFERENCES product_cost_records(store_id,catalog_product_id,id),
 FOREIGN KEY(store_id,created_shopee_id) REFERENCES shopee_price_observations(store_id,id)
);
CREATE TABLE sheet_import_audit(
 id serial PRIMARY KEY,store_id integer NOT NULL,batch_id integer NOT NULL,actor text NOT NULL,
 action text NOT NULL CHECK(length(action)<=64),details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,batch_id) REFERENCES sheet_import_batches(store_id,id)
);
CREATE TABLE listing_match_actions(
 id serial PRIMARY KEY,store_id integer NOT NULL REFERENCES stores(id),request_key text NOT NULL CHECK(length(request_key)<=128),
 input_hash text NOT NULL,actor text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(store_id,request_key)
);
CREATE TRIGGER listing_match_actions_immutable BEFORE UPDATE OR DELETE ON listing_match_actions FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE TRIGGER sheet_import_effects_immutable BEFORE UPDATE OR DELETE ON sheet_import_effects FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE TRIGGER sheet_import_audit_immutable BEFORE UPDATE OR DELETE ON sheet_import_audit FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE FUNCTION pdb_import_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'import source cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','exchange_rate_snapshot','approved_by','approved_at','committed_at','review_version','approval_version','approval_hash','rolled_back_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','exchange_rate_snapshot','approved_by','approved_at','committed_at','review_version','approval_version','approval_hash','rolled_back_at'])
 THEN RAISE EXCEPTION 'immutable import source' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('COMMITTED','ROLLED_BACK','FAILED') THEN
  IF NOT(OLD.status='COMMITTED' AND NEW.status='ROLLED_BACK' AND NEW.rolled_back_at IS NOT NULL AND
    (to_jsonb(NEW)-ARRAY['status','rolled_back_at'])=(to_jsonb(OLD)-ARRAY['status','rolled_back_at']))
  THEN RAISE EXCEPTION 'terminal import is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.exchange_rate_snapshot IS DISTINCT FROM OLD.exchange_rate_snapshot THEN
  NEW.review_version:=OLD.review_version+1;NEW.status:='PREVIEWED';NEW.approved_by:=NULL;NEW.approved_at:=NULL;NEW.approval_hash:=NULL;NEW.approval_version:=NULL;
 END IF;
 IF NEW.status<>OLD.status AND NOT((OLD.status='DRAFT' AND NEW.status IN ('PREVIEWED','FAILED')) OR (OLD.status='PREVIEWED' AND NEW.status IN ('APPROVED','FAILED')) OR (OLD.status='APPROVED' AND NEW.status IN ('PREVIEWED','COMMITTED','FAILED')))
 THEN RAISE EXCEPTION 'illegal import transition' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('APPROVED','COMMITTED') AND (NEW.approval_hash IS NULL OR NEW.approval_version IS DISTINCT FROM NEW.review_version OR NEW.exchange_rate_snapshot IS NULL OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL)
 THEN RAISE EXCEPTION 'approval required' USING ERRCODE='23514'; END IF;
 IF NEW.committed_at IS DISTINCT FROM OLD.committed_at AND NOT(OLD.status='APPROVED' AND NEW.status='COMMITTED' AND NEW.committed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'invalid commit timestamp' USING ERRCODE='23514'; END IF;
 IF NEW.rolled_back_at IS NOT NULL THEN RAISE EXCEPTION 'invalid rollback timestamp' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sheet_import_batch_guard BEFORE UPDATE OR DELETE ON sheet_import_batches FOR EACH ROW EXECUTE FUNCTION pdb_import_batch_guard();
CREATE FUNCTION pdb_import_row_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent sheet_import_batches;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO parent FROM sheet_import_batches WHERE store_id=NEW.store_id AND id=NEW.batch_id FOR UPDATE;
  IF parent.status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'rows only during initial preview' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO parent FROM sheet_import_batches WHERE store_id=OLD.store_id AND id=OLD.batch_id FOR UPDATE;
 IF TG_OP='DELETE' OR parent.status IN ('COMMITTED','ROLLED_BACK','FAILED') THEN RAISE EXCEPTION 'import row immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['resolution','matched_catalog_product_id','committed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['resolution','matched_catalog_product_id','committed_at'])
 THEN RAISE EXCEPTION 'raw import row immutable' USING ERRCODE='23514'; END IF;
 IF NEW.committed_at IS DISTINCT FROM OLD.committed_at AND NOT(parent.status='APPROVED' AND NEW.committed_at IS NOT NULL) THEN RAISE EXCEPTION 'invalid row commit timestamp' USING ERRCODE='23514'; END IF;
 IF NEW.resolution IS DISTINCT FROM OLD.resolution THEN
  UPDATE sheet_import_batches SET status='PREVIEWED',review_version=review_version+1,approval_hash=NULL,approval_version=NULL,approved_by=NULL,approved_at=NULL WHERE id=OLD.batch_id AND store_id=OLD.store_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sheet_import_row_guard BEFORE INSERT OR UPDATE OR DELETE ON sheet_import_rows FOR EACH ROW EXECUTE FUNCTION pdb_import_row_guard();
COMMIT;
