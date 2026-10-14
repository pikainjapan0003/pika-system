BEGIN;

CREATE TABLE invoice_ocr_test_cases (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL,
  original_filename text NOT NULL,
  image_sha256 text NOT NULL,
  ground_truth_merchant_name text NOT NULL,
  ground_truth_invoice_date date NOT NULL,
  ground_truth_total_amount numeric(30, 12) NOT NULL,
  ground_truth_currency text NOT NULL,
  ground_truth_locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_ocr_test_cases_creator_non_empty
    CHECK (char_length(trim(created_by_user_id)) BETWEEN 1 AND 200),
  CONSTRAINT invoice_ocr_test_cases_filename_non_empty
    CHECK (char_length(trim(original_filename)) BETWEEN 1 AND 200),
  CONSTRAINT invoice_ocr_test_cases_sha256_valid
    CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invoice_ocr_test_cases_merchant_non_empty
    CHECK (char_length(trim(ground_truth_merchant_name)) BETWEEN 1 AND 200),
  CONSTRAINT invoice_ocr_test_cases_amount_positive
    CHECK (ground_truth_total_amount > 0),
  CONSTRAINT invoice_ocr_test_cases_currency_valid
    CHECK (ground_truth_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX invoice_ocr_test_cases_store_hash_unique
  ON invoice_ocr_test_cases (store_id, image_sha256);
CREATE INDEX invoice_ocr_test_cases_store_created_idx
  ON invoice_ocr_test_cases (store_id, created_at);
CREATE INDEX invoice_ocr_test_cases_created_by_idx
  ON invoice_ocr_test_cases (created_by_user_id);

CREATE TABLE invoice_ocr_runs (
  id serial PRIMARY KEY,
  test_case_id integer NOT NULL
    REFERENCES invoice_ocr_test_cases(id) ON DELETE CASCADE,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL,
  client_request_id uuid NOT NULL,
  requested_model text NOT NULL,
  actual_model text,
  prompt_version text NOT NULL,
  image_detail text NOT NULL,
  reasoning_effort text NOT NULL,
  predicted_json jsonb,
  review_required boolean,
  review_reasons jsonb,
  evidence_json jsonb,
  openai_response_id text,
  openai_request_id text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cached_input_tokens integer,
  reasoning_tokens integer,
  latency_ms integer,
  status text NOT NULL DEFAULT 'processing',
  safe_error_code text,
  attempt_count integer NOT NULL DEFAULT 1,
  rerun_of_run_id integer REFERENCES invoice_ocr_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT invoice_ocr_runs_status_valid
    CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT invoice_ocr_runs_requested_model_valid
    CHECK (requested_model IN (
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.6-luna'
    )),
  CONSTRAINT invoice_ocr_runs_image_detail_valid
    CHECK (image_detail IN ('original', 'high', 'low', 'auto')),
  CONSTRAINT invoice_ocr_runs_reasoning_effort_valid
    CHECK (reasoning_effort IN (
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max'
    )),
  CONSTRAINT invoice_ocr_runs_attempt_count_valid
    CHECK (attempt_count BETWEEN 1 AND 2),
  CONSTRAINT invoice_ocr_runs_usage_non_negative CHECK (
    (input_tokens IS NULL OR input_tokens >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
    AND (total_tokens IS NULL OR total_tokens >= 0)
    AND (cached_input_tokens IS NULL OR cached_input_tokens >= 0)
    AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0)
    AND (latency_ms IS NULL OR latency_ms >= 0)
  ),
  CONSTRAINT invoice_ocr_runs_completed_shape CHECK (
    status <> 'completed' OR (
      actual_model IS NOT NULL
      AND predicted_json IS NOT NULL
      AND review_required IS NOT NULL
      AND review_reasons IS NOT NULL
      AND jsonb_typeof(review_reasons) = 'array'
      AND evidence_json IS NOT NULL
      AND jsonb_typeof(evidence_json) = 'object'
      AND openai_response_id IS NOT NULL
      AND latency_ms IS NOT NULL
      AND completed_at IS NOT NULL
    )
  ),
  CONSTRAINT invoice_ocr_runs_failed_shape CHECK (
    status <> 'failed' OR (
      safe_error_code IS NOT NULL
      AND completed_at IS NOT NULL
    )
  ),
  CONSTRAINT invoice_ocr_runs_error_code_safe_length CHECK (
    safe_error_code IS NULL
    OR char_length(safe_error_code) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX invoice_ocr_runs_client_request_unique
  ON invoice_ocr_runs (client_request_id);
CREATE UNIQUE INDEX invoice_ocr_runs_one_processing_per_user_unique
  ON invoice_ocr_runs (created_by_user_id)
  WHERE status = 'processing';
CREATE INDEX invoice_ocr_runs_test_case_created_idx
  ON invoice_ocr_runs (test_case_id, created_at);
CREATE INDEX invoice_ocr_runs_store_created_idx
  ON invoice_ocr_runs (store_id, created_at);
CREATE INDEX invoice_ocr_runs_benchmark_config_idx
  ON invoice_ocr_runs (
    requested_model,
    prompt_version,
    image_detail,
    reasoning_effort
  );

CREATE TABLE invoice_ocr_reviews (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES invoice_ocr_runs(id) ON DELETE CASCADE,
  merchant_name_correct boolean NOT NULL,
  invoice_date_correct boolean NOT NULL,
  total_amount_correct boolean NOT NULL,
  currency_correct boolean NOT NULL,
  unsafe_confident_error boolean NOT NULL,
  corrected_json jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_ocr_reviews_reviewer_pair
    CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT invoice_ocr_reviews_correction_requires_reviewer CHECK (
    corrected_json IS NULL
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX invoice_ocr_reviews_run_unique
  ON invoice_ocr_reviews (run_id);
CREATE INDEX invoice_ocr_reviews_reviewed_at_idx
  ON invoice_ocr_reviews (reviewed_at);

CREATE FUNCTION invoice_ocr_validate_test_case_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(20260902, NEW.store_id);

  IF (
    SELECT count(*)
    FROM invoice_ocr_test_cases
    WHERE store_id = NEW.store_id
  ) >= 10 THEN
    RAISE EXCEPTION 'invoice OCR benchmark is limited to ten test cases'
      USING
        ERRCODE = '23514',
        CONSTRAINT = 'invoice_ocr_test_cases_max_ten';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invoice_ocr_test_cases
    WHERE store_id = NEW.store_id
      AND lower(
        regexp_replace(
          trim(ground_truth_merchant_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) = lower(
        regexp_replace(
          trim(NEW.ground_truth_merchant_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
  ) THEN
    RAISE EXCEPTION 'invoice OCR benchmark merchant already exists'
      USING
        ERRCODE = '23505',
        CONSTRAINT = 'invoice_ocr_test_cases_store_merchant_unique';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_ocr_test_cases_validate_insert
BEFORE INSERT ON invoice_ocr_test_cases
FOR EACH ROW
EXECUTE FUNCTION invoice_ocr_validate_test_case_insert();

CREATE FUNCTION invoice_ocr_protect_locked_ground_truth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.ground_truth_locked_at IS NOT NULL AND (
    NEW.ground_truth_locked_at IS DISTINCT FROM OLD.ground_truth_locked_at
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.image_sha256 IS DISTINCT FROM OLD.image_sha256
    OR NEW.ground_truth_merchant_name
      IS DISTINCT FROM OLD.ground_truth_merchant_name
    OR NEW.ground_truth_invoice_date
      IS DISTINCT FROM OLD.ground_truth_invoice_date
    OR NEW.ground_truth_total_amount
      IS DISTINCT FROM OLD.ground_truth_total_amount
    OR NEW.ground_truth_currency
      IS DISTINCT FROM OLD.ground_truth_currency
  ) THEN
    RAISE EXCEPTION
      'invoice OCR Ground Truth is locked after the first model run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_ocr_test_cases_protect_locked_ground_truth
BEFORE UPDATE ON invoice_ocr_test_cases
FOR EACH ROW
EXECUTE FUNCTION invoice_ocr_protect_locked_ground_truth();

CREATE FUNCTION invoice_ocr_require_locked_ground_truth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM invoice_ocr_test_cases
  WHERE id = NEW.test_case_id
    AND store_id = NEW.store_id
    AND ground_truth_locked_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invoice OCR run requires a locked Ground Truth test case';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_ocr_runs_require_locked_ground_truth
BEFORE INSERT ON invoice_ocr_runs
FOR EACH ROW
EXECUTE FUNCTION invoice_ocr_require_locked_ground_truth();

CREATE FUNCTION invoice_ocr_protect_terminal_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('completed', 'failed') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION
      'completed or failed invoice OCR runs are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_ocr_runs_protect_terminal
BEFORE UPDATE ON invoice_ocr_runs
FOR EACH ROW
EXECUTE FUNCTION invoice_ocr_protect_terminal_run();

COMMIT;
