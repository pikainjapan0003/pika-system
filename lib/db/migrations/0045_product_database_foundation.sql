-- Additive Phase 1 foundation. Deliberately refuses repeat/drift atomically.
BEGIN;

CREATE TABLE international_shipping_profiles (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  rate_twd numeric(30,12) NOT NULL,
  basis_weight_grams numeric(30,12) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT international_shipping_profiles_store_id_key UNIQUE (store_id, id),
  CONSTRAINT international_shipping_profiles_code_key UNIQUE (store_id, code),
  CONSTRAINT international_shipping_profiles_rate_twd_valid CHECK (rate_twd <> 'NaN'::numeric AND rate_twd >= 0),
  CONSTRAINT international_shipping_profiles_basis_weight_grams_valid CHECK (basis_weight_grams <> 'NaN'::numeric AND basis_weight_grams > 0)
);

CREATE TABLE pricing_templates (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  cost_adjustment_mode text NOT NULL,
  cost_adjustment_rate numeric(30,12) NOT NULL,
  department_store_fee_rate numeric(30,12) NOT NULL,
  default_shipping_profile_id integer,
  is_system_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_templates_store_id_key UNIQUE (store_id, id),
  CONSTRAINT pricing_templates_code_valid CHECK (code IN ('GENERAL','LIVE','PERFUME','CUSTOM')),
  CONSTRAINT pricing_templates_cost_adjustment_mode_valid CHECK (cost_adjustment_mode IN ('NONE','RATE','MANUAL')),
  CONSTRAINT pricing_templates_cost_adjustment_rate_valid CHECK (cost_adjustment_rate <> 'NaN'::numeric AND cost_adjustment_rate >= 0),
  CONSTRAINT pricing_templates_department_store_fee_rate_valid CHECK (department_store_fee_rate <> 'NaN'::numeric AND department_store_fee_rate >= 0)
);

CREATE TABLE store_pricing_settings (
  store_id integer PRIMARY KEY NOT NULL,
  target_margin_rate numeric(30,12) NOT NULL DEFAULT 0.35,
  loss_protection_twd numeric(30,12) NOT NULL DEFAULT 5,
  purchase_payment_fee_rate numeric(30,12) NOT NULL DEFAULT 0.015,
  route_payment_fee_rate numeric(30,12) NOT NULL DEFAULT 0.015,
  stale_sale_days integer NOT NULL DEFAULT 180,
  profit_loss_max_twd numeric(30,12) NOT NULL DEFAULT 25,
  profit_low_max_twd numeric(30,12) NOT NULL DEFAULT 50,
  profit_medium_max_twd numeric(30,12) NOT NULL DEFAULT 100,
  settings_version text NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_pricing_settings_target_margin_rate_valid CHECK (target_margin_rate <> 'NaN'::numeric AND target_margin_rate >= 0),
  CONSTRAINT store_pricing_settings_loss_protection_twd_valid CHECK (loss_protection_twd <> 'NaN'::numeric AND loss_protection_twd >= 0),
  CONSTRAINT store_pricing_settings_purchase_payment_fee_rate_valid CHECK (purchase_payment_fee_rate <> 'NaN'::numeric AND purchase_payment_fee_rate >= 0),
  CONSTRAINT store_pricing_settings_route_payment_fee_rate_valid CHECK (route_payment_fee_rate <> 'NaN'::numeric AND route_payment_fee_rate >= 0),
  CONSTRAINT store_pricing_settings_profit_loss_max_twd_valid CHECK (profit_loss_max_twd <> 'NaN'::numeric),
  CONSTRAINT store_pricing_settings_profit_low_max_twd_valid CHECK (profit_low_max_twd <> 'NaN'::numeric),
  CONSTRAINT store_pricing_settings_profit_medium_max_twd_valid CHECK (profit_medium_max_twd <> 'NaN'::numeric),
  CONSTRAINT store_pricing_settings_margin_range CHECK (target_margin_rate < 1),
  CONSTRAINT store_pricing_settings_threshold_order CHECK (profit_loss_max_twd < profit_low_max_twd AND profit_low_max_twd < profit_medium_max_twd),
  CONSTRAINT store_pricing_settings_stale_valid CHECK (stale_sale_days > 0)
);

CREATE TABLE catalog_products (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  barcode text NOT NULL,
  barcode_status text NOT NULL,
  weight_grams numeric(12,2) NOT NULL,
  category_id integer,
  status text NOT NULL DEFAULT 'NORMAL',
  image_url text,
  internal_note text,
  preferred_route_label text,
  last_used_trip_route_id integer,
  default_pricing_template_id integer,
  default_shipping_profile_id integer,
  default_department_store_fee_rate numeric(30,12),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT catalog_products_store_id_key UNIQUE (store_id, id),
  CONSTRAINT catalog_products_names_nonempty CHECK (btrim(name) <> '' AND btrim(normalized_name) <> ''),
  CONSTRAINT catalog_products_barcode_valid CHECK ((barcode_status = 'NONE' AND barcode = '0') OR (barcode_status = 'REAL' AND barcode ~ '^[0-9]+$' AND barcode <> '0')),
  CONSTRAINT catalog_products_status_valid CHECK (status IN ('NORMAL','DISCONTINUED','ARCHIVED')),
  CONSTRAINT catalog_products_weight_grams_valid CHECK (weight_grams <> 'NaN'::numeric AND weight_grams >= 0),
  CONSTRAINT catalog_products_default_department_store_fee_rate_valid CHECK (default_department_store_fee_rate <> 'NaN'::numeric AND default_department_store_fee_rate >= 0)
);

CREATE TABLE catalog_product_aliases (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  catalog_product_id integer NOT NULL,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_product_aliases_store_id_key UNIQUE (store_id, id),
  CONSTRAINT catalog_product_aliases_alias_key UNIQUE (catalog_product_id, normalized_alias),
  CONSTRAINT catalog_product_aliases_source_valid CHECK (source IN ('RENAMED','MANUAL','SHEET')),
  CONSTRAINT catalog_product_aliases_name_nonempty CHECK (btrim(alias) <> '' AND btrim(normalized_alias) <> '')
);

CREATE TABLE product_cost_records (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  catalog_product_id integer NOT NULL,
  original_price_jpy numeric(30,12) NOT NULL,
  effective_cost_jpy numeric(30,12) NOT NULL,
  adjustment_mode text NOT NULL,
  adjustment_rate numeric(30,12),
  adjustment_reason text,
  observed_at date,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  is_current boolean NOT NULL DEFAULT false,
  supersedes_cost_record_id integer,
  void_reason_code text,
  void_reason_text text,
  voided_at timestamptz,
  voided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_cost_records_store_id_key UNIQUE (store_id, id),
  CONSTRAINT product_cost_records_catalog_id_key UNIQUE (store_id, catalog_product_id, id),
  CONSTRAINT product_cost_records_no_self CHECK (supersedes_cost_record_id IS NULL OR supersedes_cost_record_id <> id),
  CONSTRAINT product_cost_records_adjustment_mode_valid CHECK (adjustment_mode IN ('NONE','RATE','MANUAL')),
  CONSTRAINT product_cost_records_source_valid CHECK (source IN ('MANUAL','SHEET_IMPORT','ORDER')),
  CONSTRAINT product_cost_records_status_valid CHECK (status IN ('ACTIVE','VOIDED')),
  CONSTRAINT product_cost_records_original_price_jpy_valid CHECK (original_price_jpy <> 'NaN'::numeric AND original_price_jpy >= 0),
  CONSTRAINT product_cost_records_effective_cost_jpy_valid CHECK (effective_cost_jpy <> 'NaN'::numeric AND effective_cost_jpy >= 0),
  CONSTRAINT product_cost_records_adjustment_rate_valid CHECK (adjustment_rate <> 'NaN'::numeric AND adjustment_rate >= 0),
  CONSTRAINT product_cost_records_rate_required CHECK (adjustment_mode <> 'RATE' OR adjustment_rate IS NOT NULL),
  CONSTRAINT product_cost_records_void_shape CHECK ((status = 'ACTIVE' AND void_reason_code IS NULL AND void_reason_text IS NULL AND voided_at IS NULL AND voided_by IS NULL) OR (status = 'VOIDED' AND NOT is_current AND void_reason_code IS NOT NULL AND btrim(void_reason_code) <> '' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND btrim(voided_by) <> '' AND (void_reason_code <> 'OTHER' OR (void_reason_text IS NOT NULL AND btrim(void_reason_text) <> ''))))
);

CREATE TABLE shopee_price_observations (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  catalog_product_id integer NOT NULL,
  price_twd numeric(30,12) NOT NULL,
  observed_at date,
  source_url text,
  note text,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopee_price_observations_store_id_key UNIQUE (store_id, id),
  CONSTRAINT shopee_price_observations_price_twd_valid CHECK (price_twd <> 'NaN'::numeric AND price_twd >= 0),
  CONSTRAINT shopee_price_observations_source_valid CHECK (source IN ('MANUAL','SHEET_IMPORT')),
  CONSTRAINT shopee_price_observations_status_valid CHECK (status IN ('ACTIVE','VOIDED'))
);

CREATE TABLE product_relationships (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  source_catalog_product_id integer NOT NULL,
  target_catalog_product_id integer NOT NULL,
  relation_type text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_relationships_store_id_key UNIQUE (store_id, id),
  CONSTRAINT product_relationships_pair_key UNIQUE (store_id, source_catalog_product_id, target_catalog_product_id),
  CONSTRAINT product_relationships_ordered CHECK (source_catalog_product_id < target_catalog_product_id),
  CONSTRAINT product_relationships_relation_type_valid CHECK (relation_type IN ('POSSIBLE_DUPLICATE','RELATED'))
);

CREATE TABLE listing_pricing_snapshots (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  product_id integer NOT NULL,
  catalog_product_id integer,
  original_price_jpy numeric(30,12),
  effective_cost_jpy numeric(30,12),
  exchange_rate numeric(30,12),
  route_cost_twd numeric(30,12),
  loss_protection_twd numeric(30,12),
  protected_route_cost_twd numeric(30,12),
  international_shipping_twd numeric(30,12),
  purchase_payment_fee_rate numeric(30,12),
  purchase_payment_fee_twd numeric(30,12),
  route_payment_fee_rate numeric(30,12),
  department_store_fee_rate numeric(30,12),
  department_store_fee_twd numeric(30,12),
  original_price_twd numeric(30,12),
  effective_product_cost_twd numeric(30,12),
  total_cost_twd numeric(30,12),
  target_price_twd numeric(30,12),
  weight_grams numeric(12,2),
  trip_route_id integer,
  international_shipping_profile_snapshot jsonb,
  general_final_price_twd numeric(10,2),
  vip_final_price_twd numeric(10,2),
  general_net_profit_twd numeric(30,12),
  general_profit_rate numeric(30,12),
  general_contribution_profit_twd numeric(30,12),
  general_contribution_profit_rate numeric(30,12),
  general_perceived_difference_twd numeric(30,12),
  vip_net_profit_twd numeric(30,12),
  vip_profit_rate numeric(30,12),
  vip_contribution_profit_twd numeric(30,12),
  vip_contribution_profit_rate numeric(30,12),
  vip_perceived_difference_twd numeric(30,12),
  general_profit_level text,
  vip_profit_level text,
  formula_version text NOT NULL,
  settings_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_pricing_snapshots_store_id_key UNIQUE (store_id, id),
  CONSTRAINT listing_pricing_snapshots_product_id_key UNIQUE (store_id, product_id, id),
  CONSTRAINT listing_pricing_snapshots_original_price_jpy_valid CHECK (original_price_jpy <> 'NaN'::numeric AND original_price_jpy >= 0),
  CONSTRAINT listing_pricing_snapshots_effective_cost_jpy_valid CHECK (effective_cost_jpy <> 'NaN'::numeric AND effective_cost_jpy >= 0),
  CONSTRAINT listing_pricing_snapshots_exchange_rate_valid CHECK (exchange_rate <> 'NaN'::numeric AND exchange_rate >= 0),
  CONSTRAINT listing_pricing_snapshots_route_cost_twd_valid CHECK (route_cost_twd <> 'NaN'::numeric AND route_cost_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_loss_protection_twd_valid CHECK (loss_protection_twd <> 'NaN'::numeric AND loss_protection_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_protected_route_cost_twd_valid CHECK (protected_route_cost_twd <> 'NaN'::numeric AND protected_route_cost_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_international_shipping_twd_valid CHECK (international_shipping_twd <> 'NaN'::numeric AND international_shipping_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_purchase_payment_fee_rate_valid CHECK (purchase_payment_fee_rate <> 'NaN'::numeric AND purchase_payment_fee_rate >= 0),
  CONSTRAINT listing_pricing_snapshots_purchase_payment_fee_twd_valid CHECK (purchase_payment_fee_twd <> 'NaN'::numeric AND purchase_payment_fee_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_route_payment_fee_rate_valid CHECK (route_payment_fee_rate <> 'NaN'::numeric AND route_payment_fee_rate >= 0),
  CONSTRAINT listing_pricing_snapshots_department_store_fee_rate_valid CHECK (department_store_fee_rate <> 'NaN'::numeric AND department_store_fee_rate >= 0),
  CONSTRAINT listing_pricing_snapshots_department_store_fee_twd_valid CHECK (department_store_fee_twd <> 'NaN'::numeric AND department_store_fee_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_original_price_twd_valid CHECK (original_price_twd <> 'NaN'::numeric AND original_price_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_effective_product_cost_twd_valid CHECK (effective_product_cost_twd <> 'NaN'::numeric AND effective_product_cost_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_total_cost_twd_valid CHECK (total_cost_twd <> 'NaN'::numeric AND total_cost_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_target_price_twd_valid CHECK (target_price_twd <> 'NaN'::numeric AND target_price_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_weight_grams_valid CHECK (weight_grams <> 'NaN'::numeric AND weight_grams >= 0),
  CONSTRAINT listing_pricing_snapshots_general_final_price_twd_valid CHECK (general_final_price_twd <> 'NaN'::numeric AND general_final_price_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_vip_final_price_twd_valid CHECK (vip_final_price_twd <> 'NaN'::numeric AND vip_final_price_twd >= 0),
  CONSTRAINT listing_pricing_snapshots_general_net_profit_twd_valid CHECK (general_net_profit_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_general_profit_rate_valid CHECK (general_profit_rate <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_general_contribution_profit_twd_valid CHECK (general_contribution_profit_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_general_contribution_profit__1 CHECK (general_contribution_profit_rate <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_general_perceived_difference_2 CHECK (general_perceived_difference_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_vip_net_profit_twd_valid CHECK (vip_net_profit_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_vip_profit_rate_valid CHECK (vip_profit_rate <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_vip_contribution_profit_twd_valid CHECK (vip_contribution_profit_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_vip_contribution_profit_rate_valid CHECK (vip_contribution_profit_rate <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_vip_perceived_difference_twd_valid CHECK (vip_perceived_difference_twd <> 'NaN'::numeric),
  CONSTRAINT listing_pricing_snapshots_exchange_positive CHECK (exchange_rate > 0),
  CONSTRAINT listing_pricing_snapshots_general_profit_level_valid CHECK (general_profit_level IN ('LOSS','LOW','MEDIUM','HIGH')),
  CONSTRAINT listing_pricing_snapshots_vip_profit_level_valid CHECK (vip_profit_level IN ('LOSS','LOW','MEDIUM','HIGH'))
);

CREATE TABLE listing_current_pricing_snapshots (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  product_id integer NOT NULL,
  snapshot_id integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_current_pricing_snapshots_store_id_key UNIQUE (store_id, id),
  CONSTRAINT listing_current_pricing_snapshots_listing_key UNIQUE (store_id, product_id)
);

CREATE TABLE order_items (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  order_id integer NOT NULL,
  catalog_product_id integer,
  listing_product_id integer,
  product_name_snapshot text NOT NULL,
  barcode_snapshot text,
  quantity integer NOT NULL,
  unit_price_twd numeric(10,2) NOT NULL,
  subtotal_twd numeric(30,12) NOT NULL,
  original_price_jpy_snapshot numeric(30,12),
  effective_cost_jpy_snapshot numeric(30,12),
  exchange_rate_snapshot numeric(30,12),
  route_cost_twd_snapshot numeric(30,12),
  loss_protection_twd_snapshot numeric(30,12),
  protected_route_cost_twd_snapshot numeric(30,12),
  international_shipping_twd_snapshot numeric(30,12),
  purchase_payment_fee_rate_snapshot numeric(30,12),
  purchase_payment_fee_twd_snapshot numeric(30,12),
  route_payment_fee_rate_snapshot numeric(30,12),
  department_store_fee_rate_snapshot numeric(30,12),
  department_store_fee_twd_snapshot numeric(30,12),
  total_cost_twd_snapshot numeric(30,12),
  weight_grams_snapshot numeric(12,2),
  trip_route_id_snapshot integer,
  international_shipping_profile_snapshot jsonb,
  unit_profit_twd_snapshot numeric(30,12),
  profit_rate_snapshot numeric(30,12),
  contribution_profit_twd_snapshot numeric(30,12),
  contribution_profit_rate_snapshot numeric(30,12),
  perceived_difference_twd_snapshot numeric(30,12),
  profit_level_snapshot text,
  profit_snapshot_status text NOT NULL DEFAULT 'PENDING',
  customer_tier_snapshot text NOT NULL DEFAULT 'UNKNOWN',
  price_source_snapshot text NOT NULL DEFAULT 'UNKNOWN',
  formula_version text,
  settings_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_store_id_key UNIQUE (store_id, id),
  CONSTRAINT order_items_original_price_jpy_snapshot_valid CHECK (original_price_jpy_snapshot <> 'NaN'::numeric AND original_price_jpy_snapshot >= 0),
  CONSTRAINT order_items_effective_cost_jpy_snapshot_valid CHECK (effective_cost_jpy_snapshot <> 'NaN'::numeric AND effective_cost_jpy_snapshot >= 0),
  CONSTRAINT order_items_exchange_rate_snapshot_valid CHECK (exchange_rate_snapshot <> 'NaN'::numeric AND exchange_rate_snapshot >= 0),
  CONSTRAINT order_items_route_cost_twd_snapshot_valid CHECK (route_cost_twd_snapshot <> 'NaN'::numeric AND route_cost_twd_snapshot >= 0),
  CONSTRAINT order_items_loss_protection_twd_snapshot_valid CHECK (loss_protection_twd_snapshot <> 'NaN'::numeric AND loss_protection_twd_snapshot >= 0),
  CONSTRAINT order_items_protected_route_cost_twd_snapshot_valid CHECK (protected_route_cost_twd_snapshot <> 'NaN'::numeric AND protected_route_cost_twd_snapshot >= 0),
  CONSTRAINT order_items_international_shipping_twd_snapshot_valid CHECK (international_shipping_twd_snapshot <> 'NaN'::numeric AND international_shipping_twd_snapshot >= 0),
  CONSTRAINT order_items_purchase_payment_fee_rate_snapshot_valid CHECK (purchase_payment_fee_rate_snapshot <> 'NaN'::numeric AND purchase_payment_fee_rate_snapshot >= 0),
  CONSTRAINT order_items_purchase_payment_fee_twd_snapshot_valid CHECK (purchase_payment_fee_twd_snapshot <> 'NaN'::numeric AND purchase_payment_fee_twd_snapshot >= 0),
  CONSTRAINT order_items_route_payment_fee_rate_snapshot_valid CHECK (route_payment_fee_rate_snapshot <> 'NaN'::numeric AND route_payment_fee_rate_snapshot >= 0),
  CONSTRAINT order_items_department_store_fee_rate_snapshot_valid CHECK (department_store_fee_rate_snapshot <> 'NaN'::numeric AND department_store_fee_rate_snapshot >= 0),
  CONSTRAINT order_items_department_store_fee_twd_snapshot_valid CHECK (department_store_fee_twd_snapshot <> 'NaN'::numeric AND department_store_fee_twd_snapshot >= 0),
  CONSTRAINT order_items_total_cost_twd_snapshot_valid CHECK (total_cost_twd_snapshot <> 'NaN'::numeric AND total_cost_twd_snapshot >= 0),
  CONSTRAINT order_items_unit_price_twd_valid CHECK (unit_price_twd <> 'NaN'::numeric AND unit_price_twd >= 0),
  CONSTRAINT order_items_subtotal_twd_valid CHECK (subtotal_twd <> 'NaN'::numeric AND subtotal_twd >= 0),
  CONSTRAINT order_items_weight_grams_snapshot_valid CHECK (weight_grams_snapshot <> 'NaN'::numeric AND weight_grams_snapshot >= 0),
  CONSTRAINT order_items_unit_profit_twd_snapshot_valid CHECK (unit_profit_twd_snapshot <> 'NaN'::numeric),
  CONSTRAINT order_items_profit_rate_snapshot_valid CHECK (profit_rate_snapshot <> 'NaN'::numeric),
  CONSTRAINT order_items_contribution_profit_twd_snapshot_valid CHECK (contribution_profit_twd_snapshot <> 'NaN'::numeric),
  CONSTRAINT order_items_contribution_profit_rate_snapshot_valid CHECK (contribution_profit_rate_snapshot <> 'NaN'::numeric),
  CONSTRAINT order_items_perceived_difference_twd_snapshot_valid CHECK (perceived_difference_twd_snapshot <> 'NaN'::numeric),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_subtotal_exact CHECK (subtotal_twd = unit_price_twd * quantity),
  CONSTRAINT order_items_exchange_positive CHECK (exchange_rate_snapshot > 0),
  CONSTRAINT order_items_profit_snapshot_status_valid CHECK (profit_snapshot_status IN ('PENDING','CAPTURED','EXEMPT')),
  CONSTRAINT order_items_customer_tier_snapshot_valid CHECK (customer_tier_snapshot IN ('general','vip','wholesale','partner','UNKNOWN')),
  CONSTRAINT order_items_price_source_snapshot_valid CHECK (price_source_snapshot IN ('general','tier','UNKNOWN')),
  CONSTRAINT order_items_profit_level_snapshot_valid CHECK (profit_level_snapshot IN ('LOSS','LOW','MEDIUM','HIGH'))
);

CREATE TABLE order_completion_events (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  order_id integer NOT NULL,
  event_key text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  occurred_at timestamptz NOT NULL,
  completed_at timestamptz,
  source text NOT NULL,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_completion_events_store_id_key UNIQUE (store_id, id),
  CONSTRAINT order_completion_events_event_key UNIQUE (store_id, event_key),
  CONSTRAINT order_completion_events_from_status_valid CHECK (from_status IN ('pending','awaiting_payment','preparing','shipped','completed','cancelled')),
  CONSTRAINT order_completion_events_to_status_valid CHECK (to_status IN ('pending','awaiting_payment','preparing','shipped','completed','cancelled')),
  CONSTRAINT order_completion_events_transition_valid CHECK (from_status <> to_status AND (from_status = 'completed' OR to_status = 'completed')),
  CONSTRAINT order_completion_events_completion_time CHECK ((to_status = 'completed' AND completed_at IS NOT NULL AND completed_at = occurred_at) OR (to_status <> 'completed' AND completed_at IS NULL))
);

CREATE TABLE sheet_import_batches (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  spreadsheet_id text NOT NULL,
  spreadsheet_title text NOT NULL,
  sheet_title text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  exchange_rate_snapshot numeric(30,12),
  requested_by text NOT NULL,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  committed_at timestamptz,
  CONSTRAINT sheet_import_batches_store_id_key UNIQUE (store_id, id),
  CONSTRAINT sheet_import_batches_source_key UNIQUE (store_id, spreadsheet_id, sheet_title, source_hash),
  CONSTRAINT sheet_import_batches_status_valid CHECK (status IN ('DRAFT','PREVIEWED','APPROVED','COMMITTED','ROLLED_BACK','FAILED')),
  CONSTRAINT sheet_import_batches_exchange_rate_snapshot_valid CHECK (exchange_rate_snapshot <> 'NaN'::numeric AND exchange_rate_snapshot > 0)
);

CREATE TABLE sheet_import_rows (
  id serial PRIMARY KEY NOT NULL,
  store_id integer NOT NULL,
  batch_id integer NOT NULL,
  source_row_number integer NOT NULL,
  raw_values jsonb NOT NULL,
  raw_formulas jsonb NOT NULL,
  row_hash text NOT NULL,
  row_kind text NOT NULL,
  source_group text,
  normalized_name text,
  barcode_candidate text,
  weight_candidate numeric(12,2),
  original_price_jpy_candidate numeric(30,12),
  effective_cost_jpy_candidate numeric(30,12),
  match_status text NOT NULL,
  matched_catalog_product_id integer,
  warnings jsonb NOT NULL,
  resolution jsonb,
  committed_at timestamptz,
  CONSTRAINT sheet_import_rows_store_id_key UNIQUE (store_id, id),
  CONSTRAINT sheet_import_rows_row_key UNIQUE (batch_id, source_row_number),
  CONSTRAINT sheet_import_rows_row_positive CHECK (source_row_number > 0),
  CONSTRAINT sheet_import_rows_weight_candidate_valid CHECK (weight_candidate <> 'NaN'::numeric AND weight_candidate >= 0),
  CONSTRAINT sheet_import_rows_original_price_jpy_candidate_valid CHECK (original_price_jpy_candidate <> 'NaN'::numeric AND original_price_jpy_candidate >= 0),
  CONSTRAINT sheet_import_rows_effective_cost_jpy_candidate_valid CHECK (effective_cost_jpy_candidate <> 'NaN'::numeric AND effective_cost_jpy_candidate >= 0),
  CONSTRAINT sheet_import_rows_row_kind_valid CHECK (row_kind IN ('PRODUCT','SOURCE_GROUP','HEADER','TEST','EMPTY','UNKNOWN')),
  CONSTRAINT sheet_import_rows_match_status_valid CHECK (match_status IN ('SAFE_CANDIDATE','CONFLICT','NEW','IGNORED'))
);

ALTER TABLE products ADD COLUMN catalog_product_id integer;
ALTER TABLE products ADD CONSTRAINT products_store_id_key UNIQUE (store_id,id);
ALTER TABLE orders ADD CONSTRAINT orders_store_id_key UNIQUE (store_id,id);
ALTER TABLE product_categories ADD CONSTRAINT pdb_categories_store_id_key UNIQUE (store_id,id);
ALTER TABLE trip_routes ADD CONSTRAINT pdb_routes_store_id_key UNIQUE (store_id,id);
ALTER TABLE products ADD CONSTRAINT products_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products(store_id,id) ON DELETE RESTRICT;
ALTER TABLE international_shipping_profiles ADD CONSTRAINT international_shipping_profiles_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE pricing_templates ADD CONSTRAINT pricing_templates_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE pricing_templates ADD CONSTRAINT pricing_templates_shipping_fk FOREIGN KEY (store_id,default_shipping_profile_id) REFERENCES international_shipping_profiles (store_id,id) ON DELETE RESTRICT;
ALTER TABLE store_pricing_settings ADD CONSTRAINT store_pricing_settings_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_category_fk FOREIGN KEY (category_id) REFERENCES product_categories (id) ON DELETE SET NULL;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_route_fk FOREIGN KEY (last_used_trip_route_id) REFERENCES trip_routes (id) ON DELETE SET NULL;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_template_fk FOREIGN KEY (store_id,default_pricing_template_id) REFERENCES pricing_templates (store_id,id) ON DELETE RESTRICT;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_shipping_fk FOREIGN KEY (store_id,default_shipping_profile_id) REFERENCES international_shipping_profiles (store_id,id) ON DELETE RESTRICT;
CREATE INDEX catalog_products_barcode_idx ON catalog_products (store_id,barcode);
CREATE INDEX catalog_products_normalized_name_idx ON catalog_products (store_id,normalized_name);
CREATE INDEX catalog_products_status_idx ON catalog_products (store_id,status);
CREATE INDEX catalog_products_category_id_idx ON catalog_products (store_id,category_id);
ALTER TABLE catalog_product_aliases ADD CONSTRAINT catalog_product_aliases_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE catalog_product_aliases ADD CONSTRAINT catalog_product_aliases_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE product_cost_records ADD CONSTRAINT product_cost_records_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE product_cost_records ADD CONSTRAINT product_cost_records_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE product_cost_records ADD CONSTRAINT product_cost_records_supersedes_fk FOREIGN KEY (store_id,catalog_product_id,supersedes_cost_record_id) REFERENCES product_cost_records (store_id,catalog_product_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX product_cost_records_one_current ON product_cost_records (store_id,catalog_product_id) WHERE status = 'ACTIVE' AND is_current;
ALTER TABLE shopee_price_observations ADD CONSTRAINT shopee_price_observations_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE shopee_price_observations ADD CONSTRAINT shopee_price_observations_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE product_relationships ADD CONSTRAINT product_relationships_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE product_relationships ADD CONSTRAINT product_relationships_source_fk FOREIGN KEY (store_id,source_catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE product_relationships ADD CONSTRAINT product_relationships_target_fk FOREIGN KEY (store_id,target_catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE listing_pricing_snapshots ADD CONSTRAINT listing_pricing_snapshots_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE listing_pricing_snapshots ADD CONSTRAINT listing_pricing_snapshots_product_fk FOREIGN KEY (store_id,product_id) REFERENCES products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE listing_pricing_snapshots ADD CONSTRAINT listing_pricing_snapshots_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE listing_current_pricing_snapshots ADD CONSTRAINT listing_current_pricing_snapshots_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE listing_current_pricing_snapshots ADD CONSTRAINT listing_current_pricing_snapshots_product_fk FOREIGN KEY (store_id,product_id) REFERENCES products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE listing_current_pricing_snapshots ADD CONSTRAINT listing_current_pricing_snapshots_snapshot_fk FOREIGN KEY (store_id,product_id,snapshot_id) REFERENCES listing_pricing_snapshots (store_id,product_id,id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_fk FOREIGN KEY (store_id,order_id) REFERENCES orders (store_id,id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_catalog_fk FOREIGN KEY (store_id,catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_listing_fk FOREIGN KEY (store_id,listing_product_id) REFERENCES products (store_id,id) ON DELETE RESTRICT;
ALTER TABLE order_completion_events ADD CONSTRAINT order_completion_events_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE order_completion_events ADD CONSTRAINT order_completion_events_order_fk FOREIGN KEY (store_id,order_id) REFERENCES orders (store_id,id) ON DELETE RESTRICT;
ALTER TABLE sheet_import_batches ADD CONSTRAINT sheet_import_batches_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE sheet_import_rows ADD CONSTRAINT sheet_import_rows_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT;
ALTER TABLE sheet_import_rows ADD CONSTRAINT sheet_import_rows_batch_fk FOREIGN KEY (store_id,batch_id) REFERENCES sheet_import_batches (store_id,id) ON DELETE RESTRICT;
ALTER TABLE sheet_import_rows ADD CONSTRAINT sheet_import_rows_catalog_fk FOREIGN KEY (store_id,matched_catalog_product_id) REFERENCES catalog_products (store_id,id) ON DELETE RESTRICT;

-- SQL-only guards: preserve tenant id when an optional legacy hint is deleted.
ALTER TABLE catalog_products ADD CONSTRAINT pdb_catalog_category_tenant_fk FOREIGN KEY (store_id,category_id) REFERENCES product_categories(store_id,id) ON DELETE SET NULL (category_id);
ALTER TABLE catalog_products ADD CONSTRAINT pdb_catalog_route_tenant_fk FOREIGN KEY (store_id,last_used_trip_route_id) REFERENCES trip_routes(store_id,id) ON DELETE SET NULL (last_used_trip_route_id);

CREATE FUNCTION pdb_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable product database history: %', TG_TABLE_NAME USING ERRCODE='23514';
END $$;
CREATE TRIGGER pdb_listing_immutable BEFORE UPDATE OR DELETE ON listing_pricing_snapshots FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE TRIGGER pdb_completion_immutable BEFORE UPDATE OR DELETE ON order_completion_events FOR EACH ROW EXECUTE FUNCTION pdb_reject_history_mutation();
CREATE FUNCTION pdb_guard_cost_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cost history cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','is_current','void_reason_code','void_reason_text','voided_at','voided_by']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','is_current','void_reason_code','void_reason_text','voided_at','voided_by']) THEN
    RAISE EXCEPTION 'cost history content is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status = 'VOIDED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'voided cost history cannot change or revive' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pdb_cost_immutable BEFORE UPDATE OR DELETE ON product_cost_records FOR EACH ROW EXECUTE FUNCTION pdb_guard_cost_history();
COMMIT;
