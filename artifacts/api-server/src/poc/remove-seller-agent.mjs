import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertPocDatabase } from "./database-guard.mjs";

// One-off migration only; never called by regular API startup.
assertPocDatabase();
assert.equal(process.env.PIKA_PRIVATE_POC, "true");
assert.equal(process.env.RAILWAY_PROJECT_ID, "de13e86c-9d70-4396-85be-79cd73cd412f");
assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, "143266a9-b10c-4dec-9b8f-f4eec9bec86a");
assert.equal(process.env.RAILWAY_SERVICE_ID, "1068b8cf-3623-4b85-a702-d7bb7b70080e");
const action = process.argv[2];
assert.ok(["inspect", "drop", "verify"].includes(action));
const tables = ["agent_run_logs", "seller_agent_tokens", "seller_agent_settings"];
const { pool } = await import("@workspace/db");
const client = await pool.connect();
try {
  const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS username");
  assert.deepEqual(identity, { database: "pika_sites_poc", username: "pika_poc" });
  const { rows: [store] } = await client.query("SELECT merchant_id FROM stores WHERE id = $1", [Number(process.env.PIKA_OWNER_STORE_ID)]);
  assert.equal(store?.merchant_id, process.env.PIKA_OWNER_CLERK_USER_ID);
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const counts = {};
  for (const table of tables) {
    const { rows: [exists] } = await client.query("SELECT to_regclass($1)::text AS name", [`public.${table}`]);
    if (!exists.name) { counts[table] = null; continue; }
    await client.query(`LOCK TABLE public.${table} IN ACCESS EXCLUSIVE MODE`);
    counts[table] = Number((await client.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count);
  }
  const businessCounts = async () => {
    const result = {};
    for (const table of ["stores", "products", "orders", "customers", "store_credit_transactions",
      "shipment_trackings", "shipment_tracking_events", "shipment_tracking_run_logs",
      "shipment_tracking_exceptions", "logistics_import_batches", "logistics_import_rows", "invoice_ocr_runs"]) {
      result[table] = Number((await client.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count);
    }
    return result;
  };
  const before = await businessCounts();
  if (action === "drop") {
    // Empty tables need only their schema from the checkpoint for rollback.
    // If unexpected data exists, stop before destruction so it can be preserved.
    assert.ok(Object.values(counts).every(n => n === 0 || n === null), "Agent data exists; preserve it before migration");
    const sql = await readFile(new URL("../../../../lib/db/migrations/0044_remove_seller_agent.sql", import.meta.url), "utf8");
    await client.query(sql);
    assert.deepEqual(await businessCounts(), before);
  }
  if (action === "verify") assert.ok(Object.values(counts).every(n => n === null));
  const remainingAgentTables = [];
  for (const table of tables) {
    const { rows: [exists] } = await client.query("SELECT to_regclass($1)::text AS name", [`public.${table}`]);
    if (exists.name) remainingAgentTables.push(table);
  }
  if (action !== "inspect") assert.deepEqual(remainingAgentTables, []);
  await client.query("COMMIT");
  console.log(JSON.stringify({ action, ...identity, agentCounts: counts, remainingAgentTables, businessCounts: before, businessUnchanged: true }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await pool.end(); }
