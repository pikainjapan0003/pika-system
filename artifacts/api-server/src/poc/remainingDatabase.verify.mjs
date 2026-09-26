import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { assertPocDatabase } from "./database-guard.mjs";

// Explicit synthetic fixture + SQL evidence, not a carrier integration or a
// scheduled job. Only this run's tagged product/order rows may be touched.
export async function verifyRemainingDatabase(pool, storeId, tag) {
  assert.match(tag, /^RM-\d+$/);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [product] } = await client.query(
      "SELECT id, category_id FROM products WHERE store_id=$1 AND name=$2",
      [storeId, `${tag} 四層假商品`]);
    assert.ok(product); assert.equal(product.category_id, null);
    const { rows: orders } = await client.query(
      "SELECT id, total_price, status, credit_spent FROM orders WHERE store_id=$1 AND product_id=$2 ORDER BY id",
      [storeId, product.id]);
    assert.equal(orders.length, 10);
    assert.deepEqual(orders.slice(0, 4).map(o => Number(o.total_price)), [240, 200, 160, 120]);
    const credit = orders.find(o => Number(o.credit_spent) === 30);
    assert.equal(credit?.status, "cancelled");
    const { rows: ledger } = await client.query(
      "SELECT type,count(*)::int n,sum(amount)::text amount FROM store_credit_transactions WHERE related_order_id=$1 GROUP BY type",
      [credit.id]);
    assert.deepEqual(Object.fromEntries(ledger.map(l => [l.type, l.n])), { reversal: 1, spend: 1 });
    const { rows: trackings } = await client.query(
      `SELECT t.id,t.tracking_provider,t.tracking_code,t.order_id FROM shipment_trackings t
       JOIN orders o ON o.id=t.order_id WHERE o.store_id=$1 AND o.product_id=$2 ORDER BY t.id`, [storeId, product.id]);
    assert.equal(trackings.length, 2);
    for (const t of trackings) {
      assert.match(t.tracking_code, /^POC-(711|familymart)-RM-L-\d+$/);
      const seven = t.tracking_provider === "711";
      assert.ok(seven || t.tracking_provider === "familymart");
      const status = seven ? "arrived_store" : "unknown";
      const occurredAt = "2026-09-27T00:00:00.000Z";
      await client.query(`INSERT INTO shipment_tracking_events
        (shipment_tracking_id,event_status,event_description,occurred_at,raw_data,idempotency_key)
        VALUES ($1,$2,'合成貨態驗證，非外部查詢',$3,'{"fixture":true,"internal":"not-public"}'::jsonb,$4)
        ON CONFLICT (shipment_tracking_id,idempotency_key) DO NOTHING`, [t.id, status, occurredAt, `${tag}-status`]);
      await client.query(`UPDATE shipment_trackings SET latest_event_status=$2,
        latest_event_description='合成貨態驗證，非外部查詢',latest_event_at=$3,
        tracking_status=$4,check_error=$5,next_check_at=NULL WHERE id=$1`,
        [t.id, status, occurredAt, seven ? "active" : "failed", seven ? null : "SYNTHETIC_INTERNAL_ERROR"]);
    }
    await client.query("COMMIT");
    return { action: "remaining_database_verified", storeId, tag, productId: product.id,
      orderIds: orders.map(o => o.id), creditOrderId: credit.id, creditEntries: ledger,
      trackingIds: trackings.map(t => t.id), logisticsSource: "synthetic_saved_fixture",
      publicStatuses: ["arrived_store", "exception"], externalCarrierCalls: 0 };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertPocDatabase(); assert.equal(process.env.PIKA_PRIVATE_POC, "true");
  const storeId = Number(process.env.PIKA_OWNER_STORE_ID);
  const { pool } = await import("@workspace/db");
  try {
    const { rows: [store] } = await pool.query("SELECT merchant_id FROM stores WHERE id=$1", [storeId]);
    assert.equal(store?.merchant_id, process.env.PIKA_OWNER_CLERK_USER_ID);
    console.log(JSON.stringify(await verifyRemainingDatabase(pool, storeId, process.argv[2])));
  } finally { await pool.end(); }
}
