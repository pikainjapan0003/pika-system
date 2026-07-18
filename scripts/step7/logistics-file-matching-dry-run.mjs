// Step 7B — Logistics spreadsheet → order matching dry-run.
// Thin runner around the api-server importer lib (exceljs-based).
// Read-only: never writes to the DB; output contains masked PII only.
//
// Usage:
//   node scripts/step7/logistics-file-matching-dry-run.mjs            # match against real orders (read-only)
//   DRY_RUN_MOCK=1 node scripts/step7/logistics-file-matching-dry-run.mjs  # synthetic candidates, rule check
//
// Runs the lib's .ts sources directly via Node's built-in type stripping (Node >= 23.6).

import { readdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FIXTURES = path.join(ROOT, "data/step7-fixtures");
const IMPORTERS = path.join(
  ROOT,
  "artifacts/api-server/src/lib/logistics/importers",
);

const { parseSevenElevenSpreadsheet } = await import(
  path.join(IMPORTERS, "parseSevenElevenSpreadsheet.ts")
);
const { parseFamilyMartSpreadsheet } = await import(
  path.join(IMPORTERS, "parseFamilyMartSpreadsheet.ts")
);
const { matchLogisticsImportRows, normalizePhone } = await import(
  path.join(IMPORTERS, "matchLogisticsImportRows.ts")
);

const require = createRequire(path.join(ROOT, "lib/db/index.js"));

// DRY_RUN_MOCK=1 synthesizes candidate orders from the first fixture rows
// (mask wildcards filled with placeholder chars) so the rules can be exercised
// when the dev DB has no overlapping data. Mock data is synthetic.
const unmaskName = (m) => String(m || "").replace(/\*/g, "模");
const unmaskMobile = (m) => {
  const filled = normalizePhone(m).replace(/\*/g, "0");
  return /^09\d{8}$/.test(filled)
    ? filled
    : "09" + filled.slice(2, 10).padEnd(8, "0");
};

function buildMockOrders(sevenRows, famiRows) {
  const orders = [];
  let id = 9000;
  const base = {
    status: "preparing",
    shippingMethod: "convenience_store",
    trackingCode: null,
    recipientName: null,
    recipientPhone: null,
  };
  for (const r of sevenRows.filter((x) => x.recipientName).slice(0, 3)) {
    orders.push({
      ...base,
      id: ++id,
      buyerName: unmaskName(r.recipientName),
      buyerPhone: "0900000000",
      cvsStoreName: r.storeName,
    });
  }
  for (const r of famiRows.slice(0, 3)) {
    orders.push({
      ...base,
      id: ++id,
      buyerName: unmaskName(r.recipientName),
      buyerPhone: unmaskMobile(r.recipientPhone),
      cvsStoreName: r.storeName,
    });
  }
  if (orders[0]) orders.push({ ...orders[0], id: ++id }); // forces an ambiguous outcome
  return orders;
}

async function loadOrders() {
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `SELECT id, status, shipping_method, tracking_code,
            buyer_name, buyer_phone, recipient_name, recipient_phone, cvs_store_name
     FROM orders`,
  );
  await client.end();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    shippingMethod: r.shipping_method,
    trackingCode: r.tracking_code,
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    recipientName: r.recipient_name,
    recipientPhone: r.recipient_phone,
    cvsStoreName: r.cvs_store_name,
  }));
}

const fixtures = readdirSync(FIXTURES);
const sevenFile = fixtures.find(
  (f) => f.includes("賣貨便") && f.endsWith(".xlsx"),
);
const famiFile = fixtures.find((f) => /^[0-9a-f]{24}\.xlsx$/.test(f));

const sheets = [];
if (sevenFile)
  sheets.push(
    await parseSevenElevenSpreadsheet(
      path.join(FIXTURES, sevenFile),
      sevenFile,
    ),
  );
if (famiFile)
  sheets.push(
    await parseFamilyMartSpreadsheet(path.join(FIXTURES, famiFile), famiFile),
  );

const orders =
  process.env.DRY_RUN_MOCK === "1"
    ? buildMockOrders(
        sheets.find((s) => s.provider === "711")?.rows ?? [],
        sheets.find((s) => s.provider === "familymart")?.rows ?? [],
      )
    : await loadOrders();

const report = sheets.map((sheet) => ({
  headerRow: sheet.headerRow,
  columnMapping: sheet.columnMapping,
  ...matchLogisticsImportRows(sheet, orders),
}));

console.log(JSON.stringify(report, null, 2));
