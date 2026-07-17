import assert from "node:assert/strict";
import test from "node:test";

import { parseExplicitDemoDatabaseUrl } from "./demoSeedSafety.ts";

test("requires an explicit CLI database URL and never falls back to the environment", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://user:pass@prod.example/replit";
  try {
    assert.throws(
      () => parseExplicitDemoDatabaseUrl([]),
      /environment DATABASE_URL is never used/,
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("accepts an explicit disposable PostgreSQL URL", () => {
  assert.equal(
    parseExplicitDemoDatabaseUrl([
      "--",
      "--database-url",
      "postgresql://demo:demo@127.0.0.1:55432/pika_demo",
    ]),
    "postgresql://demo:demo@127.0.0.1:55432/pika_demo",
  );
});

test("rejects Replit and production markers before any connection is made", () => {
  for (const url of [
    "postgresql://user:pass@ep-example.replit.com/pika_demo",
    "postgresql://user:pass@localhost/pika_production",
    "postgresql://user:pass@localhost/pika_%70rod",
  ]) {
    assert.throws(
      () => parseExplicitDemoDatabaseUrl([`--database-url=${url}`]),
      /Refusing demo seed/,
    );
  }
});

test("rejects duplicate, unknown, malformed, and non-PostgreSQL arguments", () => {
  assert.throws(
    () =>
      parseExplicitDemoDatabaseUrl([
        "--database-url",
        "postgresql://u:p@localhost/demo",
        "--database-url=x",
      ]),
    /only be provided once/,
  );
  assert.throws(
    () => parseExplicitDemoDatabaseUrl(["--force"]),
    /Unknown argument/,
  );
  assert.throws(
    () => parseExplicitDemoDatabaseUrl(["--database-url", "not-a-url"]),
    /valid PostgreSQL URL/,
  );
  assert.throws(
    () =>
      parseExplicitDemoDatabaseUrl([
        "--database-url",
        "https://localhost/demo",
      ]),
    /must use postgres/,
  );
});
