import assert from "node:assert/strict";
import test from "node:test";

import { applyDatabaseSslMode } from "./databaseSslMode.ts";

const DATABASE_URL = "postgresql://user:pass@db.example.test:5432/pika?keep=1";

test("unset sslmode preserves the exact existing connection string", () => {
  assert.equal(applyDatabaseSslMode(DATABASE_URL, undefined), DATABASE_URL);
  assert.equal(applyDatabaseSslMode(DATABASE_URL, ""), DATABASE_URL);
});

test("explicit sslmode is added while preserving other query settings", () => {
  const result = new URL(applyDatabaseSslMode(DATABASE_URL, "verify-full"));
  assert.equal(result.searchParams.get("sslmode"), "verify-full");
  assert.equal(result.searchParams.get("keep"), "1");
});

test("environment sslmode replaces a URL value and invalid modes fail closed", () => {
  const existing = `${DATABASE_URL}&sslmode=disable`;
  const result = new URL(applyDatabaseSslMode(existing, "require"));
  assert.equal(result.searchParams.getAll("sslmode").length, 1);
  assert.equal(result.searchParams.get("sslmode"), "require");
  assert.throws(
    () => applyDatabaseSslMode(DATABASE_URL, "trust-everything"),
    RangeError,
  );
});
