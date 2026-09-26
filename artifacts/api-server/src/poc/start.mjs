import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
if (process.env.PIKA_PRIVATE_POC !== "true" ||
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !process.env.CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    (process.env.PIKA_POC_PROXY_SECRET?.length ?? 0) < 32) {
  throw new Error("POC requires isolated Clerk TEST keys and a gateway secret");
}
// No offline signature override or production external-service secrets here.
if (["CLERK_JWT_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "CRON_SYNC_SECRET"].some(key => process.env[key])) {
  throw new Error("Unexpected external-service credential in first POC slice");
}
const { privatePocConfig } = await import("../lib/privatePoc.ts");
const owner = privatePocConfig();
if (process.env.INVOICE_OCR_ENABLED === "true" || process.env.OPENAI_API_KEY) {
  const { readInvoiceOcrConfig } = await import("../lib/invoiceOcr/config.ts");
  const ocr = readInvoiceOcrConfig();
  if (!ocr.testMode || ocr.allowedClerkUserIds.size !== 1 ||
      !ocr.allowedClerkUserIds.has(owner.ownerId) || ocr.timeoutMs > 90000 ||
      process.env.OPENAI_BASE_URL) {
    throw new Error("POC OCR requires test isolation, the designated owner, and the official provider endpoint");
  }
}
// Run the existing API build; avoid recompiling the full route graph at startup.
await import("../../dist/index.mjs");
