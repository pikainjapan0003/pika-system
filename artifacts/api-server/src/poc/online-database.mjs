import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertPocDatabase } from "./database-guard.mjs";

// One-off commands run in the test service's private network, never on startup.
assertPocDatabase();
const action = process.argv[2];
assert.ok(["inspect", "initialize", "verify"].includes(action), "Unknown POC database action");
const owner = process.env.PIKA_OWNER_CLERK_USER_ID;
assert.ok(owner?.startsWith("user_") && owner !== "user_poc_test_owner", "Explicit test owner required");
const { pool } = await import("@workspace/db");
try {
  const { rows: [identity] } = await pool.query("SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS server_address, current_setting('server_version') AS version");
  assert.equal(identity.database, "pika_sites_poc");
  assert.equal(identity.username, "pika_poc");
  console.log("POC_DATABASE_IDENTITY", JSON.stringify({ ...identity,
    projectId: process.env.RAILWAY_PROJECT_ID, serviceId: process.env.RAILWAY_SERVICE_ID,
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID }));

  if (action === "initialize") {
    const { rows: [state] } = await pool.query("SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'");
    assert.equal(state.tables, 0, "Initialization only accepts a new empty test database");
  } else if (action === "verify") {
    const marker = process.argv[3];
    assert.match(marker ?? "", /^PIKA-ONLINE-[A-Za-z0-9-]+$/);
    const { rows } = await pool.query(`
      SELECT p.id AS product_id, p.store_id, p.price, p.inventory,
             o.id AS order_id, o.store_id AS order_store_id,
             o.quantity, o.total_price, o.shipping_fee, s.merchant_id
      FROM products p JOIN orders o ON o.product_id = p.id
      JOIN stores s ON s.id = p.store_id WHERE p.name = $1`, [marker]);
    assert.equal(rows.length, 1, "Exactly one correlated synthetic order must persist");
    const row = rows[0];
    assert.equal(row.merchant_id, owner);
    assert.equal(row.store_id, Number(process.env.PIKA_OWNER_STORE_ID));
    assert.equal(row.order_store_id, row.store_id);
    assert.equal(Number(row.price), 100);
    assert.equal(row.quantity, 2);
    assert.equal(Number(row.total_price), 200);
    assert.equal(Number(row.shipping_fee), 0);
    assert.equal(row.inventory, 1);
    const { merchant_id, ...proof } = row;
    console.log("POC_ORDER_PROOF", JSON.stringify({ marker, ...proof }));
  }
} finally { await pool.end(); }

if (action === "initialize") {
  const dbDirectory = fileURLToPath(new URL("../../../../lib/db/", import.meta.url));
  // Use the installed binary directly; no package download or force/schema reset.
  execFileSync(`${dbDirectory}node_modules/.bin/drizzle-kit`, ["push", "--config", "./drizzle.config.ts"], {
    cwd: dbDirectory, stdio: "inherit",
  });
  for (const script of ["initialize.mjs", "seed.mjs"]) {
    execFileSync(process.execPath, ["--import", "tsx/esm", fileURLToPath(new URL(script, import.meta.url))], {
      stdio: "inherit",
    });
  }
}
