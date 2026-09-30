import assert from "node:assert/strict";
import { test } from "node:test";
import { runFoundation, validateTarget } from "../../../../scripts/product-database-foundation-check.mjs";

test("foundation checker rejects missing opt-in before touching a database", () => {
  assert.throws(() => validateTarget("postgresql://pika_phase0@127.0.0.1:1/pika_phase0", undefined));
  assert.throws(() => validateTarget("postgresql://pika_phase0@example.com:5432/pika_phase0", "DB-BUILD-01"));
});

test("0041 real PostgreSQL foundation constraints and up/refuse/down/up lifecycle", { timeout: 300000 }, async () => {
  const result = await runFoundation({
    url: process.env.PIKA_PHASE1_TEST_URL,
    marker: process.env.PIKA_PHASE1_DISPOSABLE,
    log: console.log,
  });
  assert.equal(result.schemaColumns, 219);
  assert.ok(result.schemaForeignKeys >= 35);
  assert.ok(result.passed.length >= 60);
});
