#!/usr/bin/env node

// Supported entrypoint from the repository root:
// corepack pnpm --filter ./scripts exec tsx ./backfill-trip-store.mjs \
//   --database-url <disposable-url> --store-id <id> [--apply]
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { parseBackfillTripStoreOptions } from "./src/backfillTripStoreSafety.ts";

const require = createRequire(import.meta.url);
const { Pool } = require("../lib/db/node_modules/pg");

const SNAPSHOT_SQL = `
  SELECT
    count(*)::text AS count,
    sum(profit_snapshot_transport_cost_twd)::text AS transport_sum
  FROM orders
  WHERE profit_snapshot_status = 'captured'
`;

async function readSnapshot(client) {
  const result = await client.query(SNAPSHOT_SQL);
  return {
    count: result.rows[0].count,
    transportSum: result.rows[0].transport_sum,
  };
}

function snapshotsMatch(before, after) {
  return (
    before.count === after.count && before.transportSum === after.transportSum
  );
}

export async function backfillTripStore(options) {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 1 });
  const client = await pool.connect();
  let inTransaction = false;

  try {
    const storeResult = await client.query(
      "SELECT id FROM stores WHERE id = $1 LIMIT 1",
      [options.storeId],
    );
    if (storeResult.rowCount !== 1) {
      throw new Error(`Store ${options.storeId} does not exist`);
    }

    const countsResult = await client.query(`
      SELECT
        (SELECT count(*)::int FROM trips WHERE store_id IS NULL) AS trips,
        (SELECT count(*)::int FROM trip_routes WHERE store_id IS NULL) AS routes
    `);
    const planned = {
      trips: countsResult.rows[0].trips,
      routes: countsResult.rows[0].routes,
    };
    const before = await readSnapshot(client);

    if (!options.apply) {
      return { mode: "dry-run", storeId: options.storeId, planned, before };
    }

    await client.query("BEGIN");
    inTransaction = true;
    const tripUpdate = await client.query(
      "UPDATE trips SET store_id = $1 WHERE store_id IS NULL",
      [options.storeId],
    );
    const routeUpdate = await client.query(
      `UPDATE trip_routes AS route
       SET store_id = trip.store_id
       FROM trips AS trip
       WHERE route.trip_id = trip.id
         AND route.store_id IS NULL
         AND trip.store_id = $1`,
      [options.storeId],
    );

    if (
      tripUpdate.rowCount !== planned.trips ||
      routeUpdate.rowCount !== planned.routes
    ) {
      throw new Error(
        `Backfill row count drifted: planned ${planned.trips}/${planned.routes}, updated ${tripUpdate.rowCount}/${routeUpdate.rowCount}`,
      );
    }

    const after = await readSnapshot(client);
    if (!snapshotsMatch(before, after)) {
      throw new Error(
        `Captured transport snapshot changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
    }

    await client.query("COMMIT");
    inTransaction = false;
    return {
      mode: "apply",
      storeId: options.storeId,
      planned,
      updated: { trips: tripUpdate.rowCount, routes: routeUpdate.rowCount },
      before,
      after,
    };
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const options = parseBackfillTripStoreOptions(process.argv.slice(2));
  const result = await backfillTripStore(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
