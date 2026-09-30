BEGIN;
-- Apply only with the item-first readers in this release. No legacy row is backfilled.
ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN order_items_version integer CHECK (order_items_version = 1);
ALTER TABLE order_items ADD COLUMN spec_values jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE order_items ADD COLUMN capture_context jsonb;
ALTER TABLE order_items ADD COLUMN captured_at timestamptz;
ALTER TABLE order_items ADD CONSTRAINT order_items_spec_object CHECK (jsonb_typeof(spec_values)='object');
ALTER TABLE order_items ADD CONSTRAINT order_items_capture_complete CHECK (
 (profit_snapshot_status='PENDING' AND captured_at IS NULL)
 OR (profit_snapshot_status IN ('CAPTURED','EXEMPT') AND captured_at IS NOT NULL
 AND original_price_jpy_snapshot IS NOT NULL AND effective_cost_jpy_snapshot IS NOT NULL
 AND weight_grams_snapshot IS NOT NULL AND exchange_rate_snapshot IS NOT NULL
 AND route_cost_twd_snapshot IS NOT NULL AND loss_protection_twd_snapshot IS NOT NULL
 AND protected_route_cost_twd_snapshot IS NOT NULL AND international_shipping_twd_snapshot IS NOT NULL
 AND international_shipping_profile_snapshot IS NOT NULL
 AND purchase_payment_fee_rate_snapshot IS NOT NULL AND purchase_payment_fee_twd_snapshot IS NOT NULL
 AND route_payment_fee_rate_snapshot IS NOT NULL AND department_store_fee_rate_snapshot IS NOT NULL
 AND department_store_fee_twd_snapshot IS NOT NULL AND total_cost_twd_snapshot IS NOT NULL
 AND unit_profit_twd_snapshot IS NOT NULL AND profit_rate_snapshot IS NOT NULL
 AND contribution_profit_twd_snapshot IS NOT NULL AND contribution_profit_rate_snapshot IS NOT NULL
 AND perceived_difference_twd_snapshot IS NOT NULL AND profit_level_snapshot IS NOT NULL
 AND formula_version IS NOT NULL AND settings_version IS NOT NULL
 AND length(btrim(formula_version))>0 AND length(btrim(settings_version))>0
 AND capture_context IS NOT NULL AND jsonb_typeof(capture_context)='object'
 AND jsonb_typeof(international_shipping_profile_snapshot)='object' AND captured_at>=created_at
 AND unit_price_twd>0 AND (profit_snapshot_status<>'EXEMPT' OR route_cost_twd_snapshot=0))
);
CREATE INDEX order_items_order_read_idx ON order_items(store_id,order_id,id);
CREATE INDEX order_items_catalog_sales_idx ON order_items(store_id,catalog_product_id,customer_tier_snapshot,order_id);
CREATE INDEX order_completion_latest_idx ON order_completion_events(store_id,order_id,id DESC);

CREATE FUNCTION pdb_order_item_capture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text; value text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_setting('pika.order_item_cleanup',true) IS DISTINCT FROM OLD.order_id::text
    OR EXISTS(SELECT 1 FROM order_completion_events WHERE store_id=OLD.store_id AND order_id=OLD.order_id)
  THEN RAISE EXCEPTION '品項或完成歷史不可刪除；請取消訂單' USING ERRCODE='23514'; END IF;
 RETURN OLD;
 END IF;
 PERFORM 1 FROM orders WHERE id=NEW.order_id AND store_id=NEW.store_id FOR UPDATE;
 IF TG_OP='INSERT' AND (EXISTS(SELECT 1 FROM order_completion_events WHERE order_id=NEW.order_id AND store_id=NEW.store_id) OR EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='completed'))
 THEN RAISE EXCEPTION '有完成歷史的訂單不能追加品項' USING ERRCODE='23514'; END IF;
 FOR field,value IN SELECT key,val#>>'{}' FROM jsonb_each(to_jsonb(NEW)) AS f(key,val)
 LOOP
  IF (field LIKE '%snapshot' OR field IN ('unit_price_twd','subtotal_twd')) AND value IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION '品項金額必須為有限數值' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.order_id<>OLD.order_id OR NEW.created_at<>OLD.created_at
  THEN RAISE EXCEPTION '品項身分與建立時間不可變更' USING ERRCODE='23514'; END IF;
  IF OLD.profit_snapshot_status IN ('CAPTURED','EXEMPT') AND
    (to_jsonb(NEW)-'quantity'-'subtotal_twd'-'spec_values') IS DISTINCT FROM (to_jsonb(OLD)-'quantity'-'subtotal_twd'-'spec_values')
  THEN RAISE EXCEPTION '已捕捉的單位成本與價格不可覆寫' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM order_completion_events WHERE store_id=OLD.store_id AND order_id=OLD.order_id)
    AND NEW IS DISTINCT FROM OLD
  THEN RAISE EXCEPTION '已有完成歷史的品項不可改寫；重開也不例外' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdb_order_item_capture_guard BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION pdb_order_item_capture_guard();

CREATE FUNCTION pdb_order_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.order_items_version=1 AND NEW.status='completed' THEN RAISE EXCEPTION '請先建立品項並補齊成本，再完成訂單' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.order_items_version=1 AND NEW.order_items_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION '不能移除正式品項版本' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM order_completion_events WHERE store_id=OLD.store_id AND order_id=OLD.id)
 AND ROW(NEW.product_id,NEW.quantity,NEW.unit_price,NEW.total_price,NEW.items,NEW.order_items_version)
 IS DISTINCT FROM ROW(OLD.product_id,OLD.quantity,OLD.unit_price,OLD.total_price,OLD.items,OLD.order_items_version)
 THEN RAISE EXCEPTION '此訂單已有完成歷史，不能修改品項數量或價格' USING ERRCODE='23514'; END IF;
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.order_items_version=1 THEN
  IF NOT EXISTS(SELECT 1 FROM order_items WHERE store_id=NEW.store_id AND order_id=NEW.id)
   OR EXISTS(SELECT 1 FROM order_items WHERE store_id=NEW.store_id AND order_id=NEW.id AND (profit_snapshot_status='PENDING' OR captured_at IS NULL))
  THEN RAISE EXCEPTION '請先補齊每個品項成本，再完成訂單' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdb_order_completion_guard BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION pdb_order_completion_guard();
CREATE FUNCTION pdb_order_completion_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_id integer; actual_time timestamptz;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status='completed' OR OLD.status='completed') THEN
  event_id:=nextval(pg_get_serial_sequence('order_completion_events','id')); actual_time:=clock_timestamp();
  INSERT INTO order_completion_events(id,store_id,order_id,event_key,from_status,to_status,occurred_at,completed_at,source,actor_id)
  VALUES(event_id,NEW.store_id,NEW.id,'phase6:'||event_id,OLD.status,NEW.status,actual_time,CASE WHEN NEW.status='completed' THEN actual_time ELSE NULL END,'phase6',nullif(current_setting('pika.actor',true),''));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdb_order_completion_record AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION pdb_order_completion_record();
COMMIT;
