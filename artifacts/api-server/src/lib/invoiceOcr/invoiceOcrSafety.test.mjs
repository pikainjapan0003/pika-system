import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../../routes/invoiceOcr.ts", import.meta.url);
const supportUrl = new URL(
  "../../routes/invoiceOcrSupport.ts",
  import.meta.url,
);

test("every invoice route is protected by Clerk auth and owner/allowlist access", async () => {
  const [route, support] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(supportUrl, "utf8"),
  ]);
  const routeDeclarations = route.match(/router\.(?:get|post|patch)\(/g) ?? [];
  const authGuards = route.match(/\n\s*requireAuth,/g) ?? [];
  assert.equal(routeDeclarations.length, 7);
  assert.equal(authGuards.length, routeDeclarations.length);
  assert.match(route, /loadInvoiceOcrAccess\(request, response\)/);
  assert.match(support, /verifyStoreOwner/);
  assert.match(support, /allowedClerkUserIds\.has\(request\.userId\)/);
  assert.match(route, /Cache-Control[\s\S]*no-store/);
});

test("Ground Truth is loaded only after the isolated OpenAI call", async () => {
  const route = await readFile(routeUrl, "utf8");
  const callIndex = route.indexOf("extractInvoiceWithOpenAI(");
  const groundTruthLoadIndex = route.indexOf("const [groundTruthRow]");
  assert.ok(callIndex > 0);
  assert.ok(groundTruthLoadIndex > callIndex);
  const callBlock = route.slice(callIndex, groundTruthLoadIndex);
  assert.doesNotMatch(callBlock, /groundTruthMerchantName|groundTruthTotalAmount/);
});

test("invoice route never imports or writes formal accounting tables", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.doesNotMatch(
    route,
    /costEntriesTable|ordersTable|productsTable|paidAmount|totalPrice/,
  );
  assert.match(route, /invoiceOcrTestCasesTable/);
  assert.match(route, /invoiceOcrRunsTable/);
  assert.match(route, /invoiceOcrReviewsTable/);
});

test("API key names and image Base64 are absent from browser files and responses", async () => {
  const browserFiles = await Promise.all([
    readFile(
      new URL(
        "../../../../shop-app/src/lib/invoiceOcrUi.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../../shop-app/src/pages/InvoiceOcrTest.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const browserSource = browserFiles.join("\n");
  assert.doesNotMatch(browserSource, /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
  assert.doesNotMatch(browserSource, /data:image\/.+;base64/);
});

test("the benchmark migration atomically keeps the first phase to ten distinct merchants", async () => {
  const migrationUrl = new URL(
    "../../../../../lib/db/migrations/0041_invoice_ocr_benchmark.sql",
    import.meta.url,
  );
  const rollbackUrl = new URL(
    "../../../../../lib/db/migrations/rollback/0041_invoice_ocr_benchmark_rollback.sql",
    import.meta.url,
  );
  const [migration, rollback, route] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(rollbackUrl, "utf8"),
    readFile(routeUrl, "utf8"),
  ]);

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /invoice_ocr_test_cases_max_ten/);
  assert.match(
    migration,
    /invoice_ocr_test_cases_store_merchant_unique/,
  );
  assert.match(
    rollback,
    /DROP TRIGGER IF EXISTS invoice_ocr_test_cases_validate_insert/,
  );
  assert.match(
    rollback,
    /DROP FUNCTION IF EXISTS invoice_ocr_validate_test_case_insert\(\)/,
  );
  assert.match(route, /constraintName === "invoice_ocr_test_cases_max_ten"/);
  assert.doesNotMatch(route, /databaseCode === "23514"/);
});
