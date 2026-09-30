BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM listing_pricing_snapshots WHERE source_cost_record_id IS NOT NULL OR listing_barcode IS NOT NULL OR pricing_context IS NOT NULL OR created_by IS NOT NULL)
 OR EXISTS (SELECT 1 FROM products WHERE weight_grams IS NOT NULL OR original_price_jpy IS NOT NULL OR effective_cost_jpy IS NOT NULL OR pricing_template_id IS NOT NULL OR international_shipping_profile_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Phase5 listing data exists; preserve pricing history instead of dropping metadata' USING ERRCODE='23514';
 END IF;
END $$;
ALTER TABLE listing_pricing_snapshots DROP CONSTRAINT listing_source_cost_fk, DROP COLUMN created_by, DROP COLUMN pricing_context, DROP COLUMN listing_barcode, DROP COLUMN source_cost_record_id;
ALTER TABLE products DROP CONSTRAINT products_pricing_template_fk, DROP CONSTRAINT products_shipping_profile_fk, DROP COLUMN international_shipping_profile_id, DROP COLUMN pricing_template_id, DROP COLUMN effective_cost_jpy, DROP COLUMN original_price_jpy, DROP COLUMN weight_grams;
COMMIT;
