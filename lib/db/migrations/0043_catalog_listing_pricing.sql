BEGIN;
ALTER TABLE products
 ADD COLUMN weight_grams numeric(12,2) CHECK (weight_grams <> 'NaN'::numeric AND weight_grams >= 0),
 ADD COLUMN original_price_jpy numeric(30,12) CHECK (original_price_jpy <> 'NaN'::numeric AND original_price_jpy >= 0),
 ADD COLUMN effective_cost_jpy numeric(30,12) CHECK (effective_cost_jpy <> 'NaN'::numeric AND effective_cost_jpy >= 0),
 ADD COLUMN pricing_template_id integer,
 ADD COLUMN international_shipping_profile_id integer,
 ADD CONSTRAINT products_pricing_template_fk FOREIGN KEY (store_id,pricing_template_id) REFERENCES pricing_templates(store_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT products_shipping_profile_fk FOREIGN KEY (store_id,international_shipping_profile_id) REFERENCES international_shipping_profiles(store_id,id) ON DELETE RESTRICT;
-- Additive metadata only: old listings and immutable financial rows remain untouched.
ALTER TABLE listing_pricing_snapshots
 ADD COLUMN source_cost_record_id integer,
 ADD COLUMN listing_barcode text,
 ADD COLUMN pricing_context jsonb,
 ADD COLUMN created_by text,
 ADD CONSTRAINT listing_source_cost_fk FOREIGN KEY (store_id,source_cost_record_id) REFERENCES product_cost_records(store_id,id) ON DELETE RESTRICT;
COMMIT;
