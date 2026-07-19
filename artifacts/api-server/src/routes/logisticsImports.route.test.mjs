/**
 * Step 7B — logistics import dry-run persistence + confirm tests.
 *
 * Pattern follows the other route tests: node:test, Clerk mocked via
 * x-test-user-id header, real dev DB. Test data (store/product/orders/batches)
 * is created in before() and fully deleted in after() — store cascade cleans
 * batches/rows/exceptions/orders/trackings; run logs are deleted explicitly.
 *
 * Run via: node scripts/step7/test-logistics-file-upload-dry-run.mjs
 */

import { mock, describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const FIXTURES = path.join(ROOT, "data/step7-fixtures");

mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req) => {
      const userId = req.headers?.["x-test-user-id"] ?? null;
      return {
        userId: userId || null,
        sessionClaims: userId ? { userId } : undefined,
      };
    },
    clerkMiddleware: () => (_req, _res, next) => next(),
  },
});

const { default: express } = await import("express");
const { pool } = await import("@workspace/db");
const { default: logisticsRouter } = await import(
  path.join(ROOT, "artifacts/api-server/src/routes/logisticsImports.ts")
);

const app = express();
app.use(express.json());
app.use("/api", logisticsRouter);

const TEST_USER = "logistics-import-test-user";
let server, baseUrl, storeId, productId, orderMatchId, orderOtherId;

const fixtures = readdirSync(FIXTURES);
const sevenFile = fixtures.find(
  (f) => f.includes("賣貨便") && f.endsWith(".xlsx"),
);
const famiFile = fixtures.find((f) => /^[0-9a-f]{24}\.xlsx$/.test(f));

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}/api`;

  // Fixture row 2 (familymart): 林*賢 / 0*7*****9* / 全家大里大發店 / 16341539811.
  // Synthetic order crafted to satisfy the masks (placeholder middle chars).
  const store = await pool.query(
    `INSERT INTO stores (merchant_id, name, slug) VALUES ($1, 'logistics-test', 'logistics-test-' || floor(random()*1e9)) RETURNING id`,
    [TEST_USER],
  );
  storeId = store.rows[0].id;
  const product = await pool.query(
    `INSERT INTO products (store_id, name, price, share_token) VALUES ($1, 'test-product', 100, 'lt-' || floor(random()*1e9)) RETURNING id`,
    [storeId],
  );
  productId = product.rows[0].id;
  const mkOrder = (name, phone, cvs) =>
    pool.query(
      `INSERT INTO orders (product_id, store_id, public_token, buyer_name, buyer_phone, pickup_method,
         quantity, unit_price, total_price, status, shipping_method, cvs_store_name)
       VALUES ($1, $2, 'lt-' || floor(random()*1e12), $3, $4, 'cvs', 1, 100, 100, 'preparing', 'convenience_store', $5)
       RETURNING id`,
      [productId, storeId, name, phone, cvs],
    );
  orderMatchId = (await mkOrder("林模賢", "0970000090", "全家大里大發店"))
    .rows[0].id;
  orderOtherId = (await mkOrder("測模試", "0911000022", "全家不存在店")).rows[0]
    .id;
});

after(async () => {
  await pool.query(
    `DELETE FROM shipment_tracking_run_logs WHERE store_id = $1`,
    [storeId],
  );
  await pool.query(`DELETE FROM stores WHERE id = $1`, [storeId]); // cascades orders/batches/rows/exceptions/trackings
  server?.close();
  await pool.end();
});

function upload({
  provider,
  filePath,
  fileName,
  contentType,
  auth = true,
  omitFile = false,
}) {
  const form = new FormData();
  if (provider != null) form.append("provider", provider);
  if (!omitFile) {
    form.append(
      "file",
      new Blob([readFileSync(filePath)], {
        type:
          contentType ??
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      fileName,
    );
  }
  return fetch(`${baseUrl}/stores/${storeId}/logistics/imports/dry-run`, {
    method: "POST",
    headers: auth ? { "x-test-user-id": TEST_USER } : {},
    body: form,
  });
}

function confirm(batchId, body, userId = TEST_USER) {
  return fetch(
    `${baseUrl}/stores/${storeId}/logistics/imports/${batchId}/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

const famiUpload = () =>
  upload({
    provider: "familymart",
    filePath: path.join(FIXTURES, famiFile),
    fileName: famiFile,
  });

describe("logistics import dry-run persistence + confirm", () => {
  test("requires auth", async () => {
    const res = await upload({
      provider: "711",
      filePath: path.join(FIXTURES, sevenFile),
      fileName: sevenFile,
      auth: false,
    });
    assert.equal(res.status, 401);
  });

  test("7-11 dry-run still parses (regression)", async () => {
    const res = await upload({
      provider: "711",
      filePath: path.join(FIXTURES, sevenFile),
      fileName: sevenFile,
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.dryRun.totalRows, 50);
    assert.ok(body.batchId > 0);
  });

  test("invalid provider / missing file / wrong extension / wrong columns", async () => {
    const seven = path.join(FIXTURES, sevenFile);
    assert.equal(
      (
        await (
          await upload({
            provider: "tcat",
            filePath: seven,
            fileName: sevenFile,
          })
        ).json()
      ).errorCode,
      "INVALID_PROVIDER",
    );
    assert.equal(
      (await (await upload({ provider: "711", omitFile: true })).json())
        .errorCode,
      "MISSING_FILE",
    );
    assert.equal(
      (
        await (
          await upload({
            provider: "711",
            filePath: seven,
            fileName: "a.csv",
            contentType: "text/csv",
          })
        ).json()
      ).errorCode,
      "UNSUPPORTED_FILE_TYPE",
    );
    assert.equal(
      (
        await (
          await upload({
            provider: "familymart",
            filePath: seven,
            fileName: sevenFile,
          })
        ).json()
      ).errorCode,
      "REQUIRED_COLUMNS_MISSING",
    );
  });

  test("dry-run persists batch + rows with masked PII only", async () => {
    const res = await famiUpload();
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.dryRun.totalRows, 172);
    assert.ok(
      body.dryRun.matchedRows >= 1,
      "expected the synthetic order to match",
    );

    const batch = await pool.query(
      `SELECT * FROM logistics_import_batches WHERE id = $1`,
      [body.batchId],
    );
    assert.equal(batch.rows[0].status, "dry_run");
    assert.equal(batch.rows[0].store_id, storeId);
    assert.equal(batch.rows[0].total_rows, 172);

    const rows = await pool.query(
      `SELECT * FROM logistics_import_rows WHERE batch_id = $1`,
      [body.batchId],
    );
    assert.equal(rows.rows.length, 172);
    for (const r of rows.rows) {
      if (r.recipient_name_masked)
        assert.ok(r.recipient_name_masked.includes("*"), "name must be masked");
      if (r.recipient_phone_masked)
        assert.ok(
          r.recipient_phone_masked.includes("*"),
          "phone must be masked",
        );
      const raw = JSON.stringify(r.raw_row_json ?? {});
      assert.ok(
        !raw.includes("林模賢") && !raw.includes("0970000090"),
        "raw_row_json must not contain raw PII",
      );
    }
  });

  test("confirm imports matched rows and updates everything", async () => {
    const { batchId, dryRun } = await (await famiUpload()).json();
    assert.ok(dryRun.matchedRows >= 1);

    const res = await confirm(batchId, { confirmAllMatched: true });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.importedCount, dryRun.matchedRows);

    const order = await pool.query(
      `SELECT tracking_code, tracking_provider FROM orders WHERE id = $1`,
      [orderMatchId],
    );
    assert.equal(order.rows[0].tracking_code, "16341539811");
    assert.equal(order.rows[0].tracking_provider, "familymart");

    const tracking = await pool.query(
      `SELECT * FROM shipment_trackings WHERE order_id = $1 AND tracking_code = '16341539811'`,
      [orderMatchId],
    );
    assert.equal(tracking.rows.length, 1);
    assert.equal(tracking.rows[0].source_type, "file_import");
    assert.equal(tracking.rows[0].tracking_status, "pending");
    assert.equal(tracking.rows[0].is_active, true);

    const imported = await pool.query(
      `SELECT count(*)::int n FROM logistics_import_rows WHERE batch_id = $1 AND match_status = 'imported'`,
      [batchId],
    );
    assert.equal(imported.rows[0].n, dryRun.matchedRows);

    const batch = await pool.query(
      `SELECT status, confirmed_at FROM logistics_import_batches WHERE id = $1`,
      [batchId],
    );
    assert.equal(batch.rows[0].status, "confirmed");
    assert.ok(batch.rows[0].confirmed_at);

    const log = await pool.query(
      `SELECT * FROM shipment_tracking_run_logs WHERE store_id = $1 AND run_type = 'import_confirm' ORDER BY id DESC LIMIT 1`,
      [storeId],
    );
    assert.equal(log.rows[0].status, "success");
    assert.equal(log.rows[0].success_count, dryRun.matchedRows);

    const again = await confirm(batchId, { confirmAllMatched: true });
    assert.equal(again.status, 409);
    assert.equal((await again.json()).errorCode, "BATCH_ALREADY_CONFIRMED");
  });

  test("idempotent re-run: same order + same code is imported again, no duplicate, no conflict", async () => {
    const { batchId } = await (await famiUpload()).json();
    const rows = await pool.query(
      `SELECT id FROM logistics_import_rows WHERE batch_id = $1 AND tracking_code = '16341539811'`,
      [batchId],
    );
    assert.ok(rows.rows.length >= 1);
    const notFound = await pool.query(
      `SELECT id FROM logistics_import_rows WHERE batch_id = $1 AND match_status = 'not_found' LIMIT 1`,
      [batchId],
    );
    const ids = [...rows.rows.map((r) => r.id), notFound.rows[0].id];

    const res = await confirm(batchId, { rowIds: ids });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(
      body.importedCount,
      rows.rows.length,
      "same-order same-code re-run counts as success",
    );
    assert.ok(
      !body.rows.some((r) => r.errorCode === "TRACKING_CODE_CONFLICT"),
      "must not conflict on idempotent re-run",
    );
    const skipped = body.rows.filter((r) => r.status === "skipped");
    assert.ok(skipped.some((r) => r.errorCode === "ROW_NOT_IMPORTABLE"));

    const trackingCount = await pool.query(
      `SELECT count(*)::int n FROM shipment_trackings WHERE tracking_code = '16341539811'`,
    );
    assert.equal(trackingCount.rows[0].n, 1, "tracking must not be duplicated");
    const tracking = await pool.query(
      `SELECT source_type, tracking_status, is_active FROM shipment_trackings WHERE tracking_code = '16341539811'`,
    );
    assert.equal(tracking.rows[0].is_active, true);
    assert.equal(
      tracking.rows[0].tracking_status,
      "pending",
      "status must not regress or change",
    );

    const rowState = await pool.query(
      `SELECT match_status FROM logistics_import_rows WHERE id = $1`,
      [rows.rows[0].id],
    );
    assert.equal(rowState.rows[0].match_status, "imported");

    const log = await pool.query(
      `SELECT * FROM shipment_tracking_run_logs WHERE store_id = $1 AND run_type = 'import_confirm' ORDER BY id DESC LIMIT 1`,
      [storeId],
    );
    assert.equal(
      log.rows[0].success_count,
      rows.rows.length,
      "re-run counted in success_count",
    );

    const exc = await pool.query(
      `SELECT error_code, message FROM shipment_tracking_exceptions WHERE import_batch_id = $1`,
      [batchId],
    );
    assert.ok(
      !exc.rows.some((e) => e.error_code === "TRACKING_CODE_CONFLICT"),
      "no conflict exception on re-run",
    );
    for (const e of exc.rows)
      assert.ok(
        !/林模賢|0970000090/.test(e.message ?? ""),
        "exception message must not contain PII",
      );
  });

  test("same order + different code → ORDER_ALREADY_HAS_TRACKING, no overwrite", async () => {
    // The dry-run matcher already filters this out, so simulate the order's code
    // changing between dry-run and confirm — the confirm-side guard must hold.
    const { batchId } = await (await famiUpload()).json();
    await pool.query(
      `UPDATE orders SET tracking_code = 'OTHERCODE999' WHERE id = $1`,
      [orderMatchId],
    );
    try {
      const res = await confirm(batchId, { confirmAllMatched: true });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(
        body.rows.some(
          (r) =>
            r.status === "skipped" &&
            r.errorCode === "ORDER_ALREADY_HAS_TRACKING",
        ),
      );

      const order = await pool.query(
        `SELECT tracking_code FROM orders WHERE id = $1`,
        [orderMatchId],
      );
      assert.equal(
        order.rows[0].tracking_code,
        "OTHERCODE999",
        "existing code must not be overwritten",
      );

      const exc = await pool.query(
        `SELECT error_code FROM shipment_tracking_exceptions WHERE import_batch_id = $1`,
        [batchId],
      );
      assert.ok(
        exc.rows.some((e) => e.error_code === "ORDER_ALREADY_HAS_TRACKING"),
      );
    } finally {
      await pool.query(
        `UPDATE orders SET tracking_code = '16341539811', tracking_provider = 'familymart' WHERE id = $1`,
        [orderMatchId],
      );
    }
  });

  test("different order + same code → TRACKING_CODE_CONFLICT", async () => {
    // Point the existing tracking at another order and free the matched order.
    await pool.query(
      `UPDATE shipment_trackings SET order_id = $1 WHERE tracking_code = '16341539811'`,
      [orderOtherId],
    );
    await pool.query(
      `UPDATE orders SET tracking_code = NULL, tracking_provider = NULL WHERE id = $1`,
      [orderMatchId],
    );
    try {
      const { batchId } = await (await famiUpload()).json();
      const res = await confirm(batchId, { confirmAllMatched: true });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(
        body.rows.some(
          (r) =>
            r.status === "skipped" && r.errorCode === "TRACKING_CODE_CONFLICT",
        ),
      );

      const order = await pool.query(
        `SELECT tracking_code FROM orders WHERE id = $1`,
        [orderMatchId],
      );
      assert.equal(
        order.rows[0].tracking_code,
        null,
        "conflicting code must not be written to the order",
      );
      const trackingCount = await pool.query(
        `SELECT count(*)::int n FROM shipment_trackings WHERE tracking_code = '16341539811'`,
      );
      assert.equal(trackingCount.rows[0].n, 1);

      const exc = await pool.query(
        `SELECT error_code FROM shipment_tracking_exceptions WHERE import_batch_id = $1`,
        [batchId],
      );
      assert.ok(
        exc.rows.some((e) => e.error_code === "TRACKING_CODE_CONFLICT"),
      );
    } finally {
      await pool.query(
        `UPDATE shipment_trackings SET order_id = $1 WHERE tracking_code = '16341539811'`,
        [orderMatchId],
      );
      await pool.query(
        `UPDATE orders SET tracking_code = '16341539811', tracking_provider = 'familymart' WHERE id = $1`,
        [orderMatchId],
      );
    }
  });

  test("confirm without rowIds/confirmAllMatched → INVALID_CONFIRM_REQUEST", async () => {
    const { batchId } = await (await famiUpload()).json();
    const res = await confirm(batchId, {});
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, "INVALID_CONFIRM_REQUEST");
  });

  test("other user cannot confirm this store's batch", async () => {
    const { batchId } = await (await famiUpload()).json();
    const res = await confirm(
      batchId,
      { confirmAllMatched: true },
      "someone-else",
    );
    assert.equal(res.status, 403);
  });
});
