import { readFile } from "node:fs/promises";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
const { pool } = await import("@workspace/db");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Drizzle push initializes current schema. These migration-only triggers must
  // also exist; do not replay old CREATE TABLE / ALTER migrations over it.
  for (const [file, marker, functionName] of [
    ["0021_store_credit_transactions.sql", 'CREATE FUNCTION "reject_store_credit_transaction_mutation"()', "reject_store_credit_transaction_mutation"],
    ["0041_invoice_ocr_benchmark.sql", "CREATE FUNCTION invoice_ocr_validate_test_case_insert()", "invoice_ocr_validate_test_case_insert"],
  ]) {
    const { rows } = await client.query("SELECT to_regprocedure($1) AS function", [`${functionName}()`]);
    if (rows[0].function) continue;
    const source = await readFile(new URL(`../../../../lib/db/migrations/${file}`, import.meta.url), "utf8");
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Migration trigger marker missing: ${file}`);
    await client.query(source.slice(start).replace(/COMMIT;\s*$/, ""));
  }
  const { rows } = await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE 'invoice_ocr_%' OR tgname LIKE 'store_credit_transactions_%') ORDER BY tgname");
  if (rows.length !== 6) throw new Error("Expected all six migration-only protection triggers");
  await client.query("COMMIT");
  console.log(JSON.stringify({ database: "pika_sites_poc", triggers: rows.map(row => row.tgname) }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
