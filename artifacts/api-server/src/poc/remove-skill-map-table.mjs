import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertPocDatabase } from "./database-guard.mjs";

// One-off maintenance, never called by API startup. Only this isolated POC.
assertPocDatabase();
assert.equal(process.env.PIKA_PRIVATE_POC, "true");
assert.equal(process.env.RAILWAY_PROJECT_ID, "de13e86c-9d70-4396-85be-79cd73cd412f");
assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, "143266a9-b10c-4dec-9b8f-f4eec9bec86a");
assert.equal(process.env.RAILWAY_SERVICE_ID, "1068b8cf-3623-4b85-a702-d7bb7b70080e");
const action = process.argv[2];
assert.ok(["backup", "drop", "verify"].includes(action));
const { pool } = await import("@workspace/db");
const client = await pool.connect();
try {
  const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS username");
  assert.deepEqual(identity, { database: "pika_sites_poc", username: "pika_poc" });
  const { rows: [store] } = await client.query("SELECT merchant_id FROM stores WHERE id = $1", [Number(process.env.PIKA_OWNER_STORE_ID)]);
  assert.equal(store?.merchant_id, process.env.PIKA_OWNER_CLERK_USER_ID);
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const { rows: [exists] } = await client.query("SELECT to_regclass('public.store_skill_states')::text AS table_name");
  if (action === "verify") {
    assert.equal(exists.table_name, null);
    console.log(JSON.stringify({ action, absent: true, ...identity }));
  } else {
    assert.equal(exists.table_name, "store_skill_states");
    await client.query("LOCK TABLE public.store_skill_states IN ACCESS EXCLUSIVE MODE");
    const { rows } = await client.query("SELECT * FROM public.store_skill_states ORDER BY store_id, skill_key");
    assert.ok(rows.every(row => row.store_id === Number(process.env.PIKA_OWNER_STORE_ID)), "Unexpected store scope");
    const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    if (action === "backup") {
      console.log(JSON.stringify({ action, ...identity, table: "store_skill_states", schemaMigration: "0019_store_skill_states.sql", hash, rows }));
    } else {
      assert.match(process.argv[3] ?? "", /^[a-f0-9]{64}$/, "Previously saved backup hash required");
      assert.equal(hash, process.argv[3], "Rows changed after backup; do not drop");
      const count = async () => (await client.query("SELECT (SELECT count(*) FROM stores)::int AS stores, (SELECT count(*) FROM products)::int AS products, (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM customers)::int AS customers, (SELECT count(*) FROM store_credit_transactions)::int AS ledger")).rows[0];
      const before = await count();
      const migration = await readFile(new URL("../../../../lib/db/migrations/0042_drop_store_skill_states.sql", import.meta.url), "utf8");
      await client.query(migration);
      assert.deepEqual(await count(), before);
      console.log(JSON.stringify({ action, ...identity, removedRows: rows.length, backupHash: hash, businessCounts: before }));
    }
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await pool.end(); }
