-- Refuse rollback whenever any new data exists; never silently discard history.
BEGIN;
LOCK TABLE international_shipping_profiles, pricing_templates, store_pricing_settings, catalog_products, catalog_product_aliases, product_cost_records, shopee_price_observations, product_relationships, listing_pricing_snapshots, listing_current_pricing_snapshots, order_items, order_completion_events, sheet_import_batches, sheet_import_rows, products, orders, product_categories, trip_routes IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE table_name text; occupied boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['international_shipping_profiles','pricing_templates','store_pricing_settings','catalog_products','catalog_product_aliases','product_cost_records','shopee_price_observations','product_relationships','listing_pricing_snapshots','listing_current_pricing_snapshots','order_items','order_completion_events','sheet_import_batches','sheet_import_rows'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', table_name) INTO occupied;
    IF occupied THEN RAISE EXCEPTION '0041 rollback refused: % contains data', table_name USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM products WHERE catalog_product_id IS NOT NULL) THEN
    RAISE EXCEPTION '0041 rollback refused: products catalog links exist' USING ERRCODE='23514';
  END IF;
END $$;
ALTER TABLE products DROP CONSTRAINT products_catalog_fk;
ALTER TABLE products DROP COLUMN catalog_product_id;
DROP TABLE sheet_import_rows, sheet_import_batches, order_completion_events, order_items, listing_current_pricing_snapshots, listing_pricing_snapshots, product_relationships, shopee_price_observations, product_cost_records, catalog_product_aliases, catalog_products, store_pricing_settings, pricing_templates, international_shipping_profiles;
DROP FUNCTION pdb_guard_cost_history();
DROP FUNCTION pdb_reject_history_mutation();
ALTER TABLE products DROP CONSTRAINT products_store_id_key;
ALTER TABLE orders DROP CONSTRAINT orders_store_id_key;
ALTER TABLE product_categories DROP CONSTRAINT pdb_categories_store_id_key;
ALTER TABLE trip_routes DROP CONSTRAINT pdb_routes_store_id_key;
COMMIT;

