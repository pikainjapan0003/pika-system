#!/usr/bin/env node

/**
 * Read-only data integrity audit. It accepts only an explicit disposable/test
 * database URL and runs SELECT statements; it never inserts, updates, deletes,
 * or falls back to DATABASE_URL.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("../lib/db/node_modules/pg");

const CHECKS = [
  {
    name: "foreign_key_orphans",
    sql: `
      SELECT COUNT(*)::int AS count FROM (
        SELECT o.id FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE s.id IS NULL
        UNION ALL
        SELECT o.id FROM orders o LEFT JOIN products p ON p.id = o.product_id WHERE p.id IS NULL
        UNION ALL
        SELECT o.id FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.customer_id IS NOT NULL AND c.id IS NULL
        UNION ALL
        SELECT p.id FROM products p LEFT JOIN stores s ON s.id = p.store_id WHERE s.id IS NULL
        UNION ALL
        SELECT r.id FROM trip_routes r LEFT JOIN trips t ON t.id = r.trip_id WHERE t.id IS NULL
      ) anomalies`,
  },
  {
    name: "invalid_status_values",
    sql: `
      SELECT COUNT(*)::int AS count FROM (
        SELECT id FROM orders WHERE status NOT IN
          ('pending','awaiting_payment','preparing','shipped','completed','cancelled')
        UNION ALL
        SELECT id FROM orders WHERE payment_status NOT IN
          ('unpaid','pending','partially_paid','paid','refunded','failed')
        UNION ALL
        SELECT id FROM orders WHERE shipping_status NOT IN
          ('not_shipped','preparing','shipped','arrived','picked_up','returned','cancelled')
        UNION ALL
        SELECT id FROM orders WHERE profit_snapshot_status IS NOT NULL
          AND profit_snapshot_status NOT IN ('captured','pending','exempt')
        UNION ALL
        SELECT id FROM orders WHERE cart_profit_snapshot_status IS NOT NULL
          AND cart_profit_snapshot_status NOT IN ('captured','pending')
      ) anomalies`,
  },
  {
    name: "negative_or_nonpositive_amounts",
    sql: `
      SELECT COUNT(*)::int AS count FROM (
        SELECT id FROM orders WHERE quantity <= 0 OR unit_price < 0 OR shipping_fee < 0
          OR total_price < 0 OR discount_amount < 0 OR credit_spent < 0
        UNION ALL
        SELECT id FROM products WHERE price < 0 OR cost_jpy < 0
        UNION ALL
        SELECT id FROM trips WHERE exchange_rate < 0
        UNION ALL
        SELECT id FROM trip_routes WHERE est_qty <= 0 OR etc_jpy < 0 OR train_jpy < 0
          OR fuel_jpy < 0 OR parking_jpy < 0 OR cardboard_jpy < 0 OR shipping_jpy < 0
      ) anomalies`,
  },
  {
    name: "token_or_code_shape",
    sql: `
      SELECT COUNT(*)::int AS count FROM (
        SELECT id FROM orders WHERE length(trim(public_token)) < 16
        UNION ALL
        SELECT id FROM products WHERE length(trim(share_token)) < 16
        UNION ALL
        SELECT id FROM customers WHERE length(trim(code)) = 0
      ) anomalies`,
  },
  {
    name: "duplicate_business_keys",
    sql: `
      SELECT COUNT(*)::int AS count FROM (
        SELECT store_id, code FROM customers GROUP BY store_id, code HAVING COUNT(*) > 1
        UNION ALL
        SELECT store_id, public_token FROM orders GROUP BY store_id, public_token HAVING COUNT(*) > 1
        UNION ALL
        SELECT store_id, share_token FROM products GROUP BY store_id, share_token HAVING COUNT(*) > 1
      ) anomalies`,
  },
];

function usage(message) {
  if (message) console.error(`ERROR: ${message}`);
  console.error(
    "Usage: node scripts/audit-data-integrity.mjs --database-url <disposable-url>",
  );
  process.exitCode = 2;
}

function parseDatabaseUrl(argv) {
  if (argv.length !== 2 || argv[0] !== "--database-url") {
    usage("exactly one explicit --database-url is required");
    return null;
  }
  const value = argv[1];
  if (typeof value !== "string" || value.trim() === "") {
    usage("--database-url must be non-empty");
    return null;
  }
  if (/(replit|production|prod)/i.test(value)) {
    usage("refusing a Replit/production-looking database URL");
    return null;
  }
  const url = new URL(value);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) {
    usage("database URL must use postgres:// or postgresql://");
    return null;
  }
  return value;
}

async function main() {
  const databaseUrl = parseDatabaseUrl(process.argv.slice(2));
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let anomalyCount = 0;
  try {
    for (const check of CHECKS) {
      const result = await pool.query(check.sql);
      const count = Number(result.rows[0]?.count ?? 0);
      anomalyCount += count;
      console.log(`INTEGRITY_${check.name}=${count}`);
    }
  } finally {
    await pool.end();
  }
  console.log(`INTEGRITY_TOTAL_ANOMALIES=${anomalyCount}`);
  if (anomalyCount > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(
    `INTEGRITY_AUDIT=fail: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
