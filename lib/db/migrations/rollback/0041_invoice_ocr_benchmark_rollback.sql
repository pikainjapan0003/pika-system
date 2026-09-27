BEGIN;

DROP TRIGGER IF EXISTS invoice_ocr_runs_protect_terminal
  ON invoice_ocr_runs;
DROP TRIGGER IF EXISTS invoice_ocr_runs_require_locked_ground_truth
  ON invoice_ocr_runs;
DROP TRIGGER IF EXISTS invoice_ocr_test_cases_protect_locked_ground_truth
  ON invoice_ocr_test_cases;
DROP TRIGGER IF EXISTS invoice_ocr_test_cases_validate_insert
  ON invoice_ocr_test_cases;

DROP FUNCTION IF EXISTS invoice_ocr_protect_terminal_run();
DROP FUNCTION IF EXISTS invoice_ocr_require_locked_ground_truth();
DROP FUNCTION IF EXISTS invoice_ocr_protect_locked_ground_truth();
DROP FUNCTION IF EXISTS invoice_ocr_validate_test_case_insert();

DROP TABLE IF EXISTS invoice_ocr_reviews;
DROP TABLE IF EXISTS invoice_ocr_runs;
DROP TABLE IF EXISTS invoice_ocr_test_cases;

COMMIT;
