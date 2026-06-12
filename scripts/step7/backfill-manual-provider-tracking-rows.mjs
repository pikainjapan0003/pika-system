#!/usr/bin/env node
/**
 * Step 7N-I8B — backfill shipment_trackings for manually-entered postoffice / tcat orders.
 *
 * 找出 orders.tracking_code 非空、tracking_provider in (postoffice, tcat)、
 * 但沒有 active shipment_trackings row 的訂單，補建 row（pending / manual）。
 * 與 PATCH seed 共用 ensureManualProviderTrackingRow，不打外部查詢、
 * 不寫 events / snapshot、不改 orders、不碰 711 / familymart。
 *
 * Usage:
 *   node scripts/step7/backfill-manual-provider-tracking-rows.mjs           # dry-run（預設）
 *   node scripts/step7/backfill-manual-provider-tracking-rows.mjs --apply   # 實際寫入
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (!process.env.__TSX_BOOTSTRAPPED) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--import", path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"), fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __TSX_BOOTSTRAPPED: "1" } },
  );
  process.exit(r.status ?? 1);
}

const apply = process.argv.includes("--apply");

const { pool } = await import(pathToFileURL(path.join(ROOT, "lib/db/src/index.ts")));
const { ensureManualProviderTrackingRow, MANUAL_SEED_PROVIDERS } = await import(
  pathToFileURL(path.join(ROOT, "artifacts/api-server/src/lib/logistics/trackingSeed.ts"))
);

const { rows: candidates } = await pool.query(
  `SELECT o.id AS order_id, o.store_id, o.tracking_code, o.tracking_provider
   FROM orders o
   WHERE o.tracking_provider = ANY($1)
     AND o.tracking_code IS NOT NULL
     AND btrim(o.tracking_code) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM shipment_trackings st
       WHERE st.order_id = o.id AND st.is_active = true
     )
   ORDER BY o.id`,
  [[...MANUAL_SEED_PROVIDERS]],
);

console.log(`mode: ${apply ? "APPLY" : "DRY-RUN"}`);
console.log(`providers: ${MANUAL_SEED_PROVIDERS.join(", ")}`);
console.log(`candidates: ${candidates.length}`);
for (const c of candidates) {
  console.log(`  order #${c.order_id} (store ${c.store_id}) ${c.tracking_provider} ${c.tracking_code}`);
}

let inserted = 0;
let skipped = 0;
if (apply) {
  for (const c of candidates) {
    const result = await ensureManualProviderTrackingRow({
      orderId: c.order_id,
      trackingCode: c.tracking_code,
      trackingProvider: c.tracking_provider,
    });
    if (result.action === "skipped") {
      skipped++;
      console.log(`  SKIP order #${c.order_id}: ${result.reason}`);
    } else {
      inserted++;
      console.log(`  ${result.action.toUpperCase()} order #${c.order_id} → tracking id ${result.trackingId}`);
    }
  }
}

console.log(`inserted: ${inserted}`);
console.log(`skipped: ${skipped}`);
if (!apply && candidates.length > 0) {
  console.log("dry-run only — re-run with --apply to write.");
}
await pool.end();
process.exit(0);
