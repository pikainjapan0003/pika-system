#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

if (!process.env.__TRACKING_PHASE1_TSX) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"),
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, __TRACKING_PHASE1_TSX: "1" },
    },
  );
  process.exit(result.status ?? 1);
}

const { and, eq, inArray, isNull, lte, or, sql } = await import(
  pathToFileURL(
    path.join(ROOT, "artifacts/api-server/node_modules/drizzle-orm/index.js"),
  )
);
const { auditLogsTable, db, ordersTable, pool, shipmentTrackingsTable } =
  await import(pathToFileURL(path.join(ROOT, "lib/db/src/index.ts")));
const { trackSevenElevenShipment } = await import(
  pathToFileURL(
    path.join(
      ROOT,
      "artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts",
    ),
  )
);
const { runTrackingWorkerPhase1 } = await import(
  pathToFileURL(
    path.join(
      ROOT,
      "artifacts/api-server/src/lib/logistics/workers/trackingWorkerPhase1.ts",
    ),
  )
);

const limit = process.env.LIMIT ? Number(process.env.LIMIT) : 20;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
  throw new RangeError("LIMIT must be an integer between 1 and 100");
}

const now = new Date();
const conditions = [
  eq(shipmentTrackingsTable.trackingProvider, "711"),
  eq(shipmentTrackingsTable.isActive, true),
  inArray(shipmentTrackingsTable.trackingStatus, [
    "pending",
    "checking",
    "active",
    "failed",
  ]),
  or(
    isNull(shipmentTrackingsTable.nextCheckAt),
    lte(shipmentTrackingsTable.nextCheckAt, now),
  ),
];
if (process.env.STORE_ID) {
  const storeId = Number(process.env.STORE_ID);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new RangeError("STORE_ID must be a positive integer");
  }
  conditions.push(eq(ordersTable.storeId, storeId));
}

const jobs = await db
  .select({
    shipmentTrackingId: shipmentTrackingsTable.id,
    storeId: ordersTable.storeId,
    trackingCode: shipmentTrackingsTable.trackingCode,
    currentStatusText: shipmentTrackingsTable.latestEventDescription,
    failureCount: shipmentTrackingsTable.failureCount,
  })
  .from(shipmentTrackingsTable)
  .innerJoin(ordersTable, eq(shipmentTrackingsTable.orderId, ordersTable.id))
  .where(and(...conditions))
  .orderBy(shipmentTrackingsTable.id)
  .limit(limit);

const leaseClient = await pool.connect();
const leaseKey = "pika:tracking-worker:phase1:711";
let acquired = false;
try {
  const result = await runTrackingWorkerPhase1(jobs, {
    acquireLease: async () => {
      const lock = await leaseClient.query(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [leaseKey],
      );
      acquired = lock.rows[0]?.acquired === true;
      return {
        acquired,
        release: async () => {
          if (acquired) {
            await leaseClient.query("SELECT pg_advisory_unlock(hashtext($1))", [
              leaseKey,
            ]);
            acquired = false;
          }
        },
      };
    },
    querySevenEleven: (trackingCode) =>
      trackSevenElevenShipment({ trackingCode }),
    recordReport: async (report) => {
      await db.insert(auditLogsTable).values(report);
    },
    runId: randomUUID,
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  if (acquired) {
    await leaseClient.query("SELECT pg_advisory_unlock(hashtext($1))", [
      leaseKey,
    ]);
  }
  leaseClient.release();
  await pool.end();
}
