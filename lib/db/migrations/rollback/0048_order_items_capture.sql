BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM orders WHERE order_items_version=1 OR product_id IS NULL)
 OR EXISTS(SELECT 1 FROM order_items WHERE captured_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM order_completion_events WHERE source='phase6')
 THEN RAISE EXCEPTION 'Phase6 已有訂單或不可變歷史，拒絕回復；不刪除資料'; END IF;
END $$;
DROP TRIGGER pdb_order_completion_record ON orders;
DROP FUNCTION pdb_order_completion_record();
DROP TRIGGER pdb_order_completion_guard ON orders;
DROP FUNCTION pdb_order_completion_guard();
DROP TRIGGER pdb_order_item_capture_guard ON order_items;
DROP FUNCTION pdb_order_item_capture_guard();
DROP INDEX order_completion_latest_idx;
DROP INDEX order_items_catalog_sales_idx;
DROP INDEX order_items_order_read_idx;
ALTER TABLE order_items DROP CONSTRAINT order_items_capture_complete;
ALTER TABLE order_items DROP CONSTRAINT order_items_spec_object;
ALTER TABLE order_items DROP COLUMN captured_at,DROP COLUMN capture_context,DROP COLUMN spec_values;
ALTER TABLE orders DROP COLUMN order_items_version;
ALTER TABLE orders ALTER COLUMN product_id SET NOT NULL;
COMMIT;
