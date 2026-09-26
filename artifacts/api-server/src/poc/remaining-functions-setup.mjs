import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertPocDatabase } from "./database-guard.mjs";

// Explicit one-off POC setup, never a startup hook or a production migration.
assertPocDatabase();
assert.equal(process.env.PIKA_PRIVATE_POC, "true");
const storeId = Number(process.env.PIKA_OWNER_STORE_ID);
assert.ok(Number.isSafeInteger(storeId) && storeId > 0);
const { pool } = await import("@workspace/db");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { rows: [store] } = await client.query("SELECT merchant_id FROM stores WHERE id = $1", [storeId]);
  assert.equal(store?.merchant_id, process.env.PIKA_OWNER_CLERK_USER_ID);
  const migration = await readFile(new URL("../../../../lib/db/migrations/0043_order_request_identity.sql", import.meta.url), "utf8");
  await client.query(migration);
  for (const [provider, id, name] of [["seven", "901001", "7-11 合成測試店"], ["family", "901002", "全家合成測試店"]]) {
    const { rows: [existing] } = await client.query("SELECT source FROM cvs_stores WHERE provider = $1 AND store_id = $2", [provider, id]);
    assert.ok(!existing || existing.source === "poc_synthetic_remaining", "Never overwrite an existing real/unknown store");
    await client.query(`INSERT INTO cvs_stores (provider, store_id, store_name, store_address, city, district, source)
      VALUES ($1,$2,$3,'合成地址，不可寄件','合成市','測試區','poc_synthetic_remaining')
      ON CONFLICT (provider,store_id) DO NOTHING`, [provider, id, name]);
  }
  // Selection and order snapshots only; no shipping provider is invoked.
  await client.query("UPDATE stores SET shipping_cvs_enabled = true WHERE id = $1", [storeId]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ action: "remaining_functions_setup", storeId, migration: "0043", syntheticCvsProviders: ["seven", "family"] }));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }
