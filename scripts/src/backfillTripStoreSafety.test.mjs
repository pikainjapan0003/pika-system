import assert from "node:assert/strict";
import test from "node:test";

import { parseBackfillTripStoreOptions } from "./backfillTripStoreSafety.ts";

const URL = "postgresql://postgres:test@127.0.0.1:55490/pika_disposable";

test("requires an explicit database URL", () => {
  assert.throws(
    () => parseBackfillTripStoreOptions(["--store-id", "1"]),
    /--database-url is required/,
  );
});

test("requires an explicit store id", () => {
  assert.throws(
    () => parseBackfillTripStoreOptions(["--database-url", URL]),
    /--store-id is required/,
  );
});

test("rejects production and Replit targets", () => {
  for (const url of [
    "postgresql://user:pass@prod-db.example/pika",
    "postgresql://user:pass@db.example/replit_main",
  ]) {
    assert.throws(
      () =>
        parseBackfillTripStoreOptions([
          "--database-url",
          url,
          "--store-id",
          "1",
        ]),
      /Replit\/production marker/,
    );
  }
});

test("rejects invalid store ids", () => {
  for (const storeId of ["0", "-1", "1.5", "abc"]) {
    assert.throws(
      () =>
        parseBackfillTripStoreOptions([
          "--database-url",
          URL,
          "--store-id",
          storeId,
        ]),
      /positive integer/,
    );
  }
});

test("defaults to dry-run", () => {
  assert.deepEqual(
    parseBackfillTripStoreOptions(["--database-url", URL, "--store-id", "7"]),
    { databaseUrl: URL, storeId: 7, apply: false },
  );
});

test("only an explicit apply flag enables writes", () => {
  assert.deepEqual(
    parseBackfillTripStoreOptions([
      "--database-url",
      URL,
      "--store-id=7",
      "--apply",
    ]),
    { databaseUrl: URL, storeId: 7, apply: true },
  );
  assert.throws(
    () =>
      parseBackfillTripStoreOptions([
        "--database-url",
        URL,
        "--store-id",
        "7",
        "--apply",
        "--apply",
      ]),
    /--apply may only be provided once/,
  );
});

test("rejects unknown and repeated arguments", () => {
  assert.throws(
    () =>
      parseBackfillTripStoreOptions([
        "--database-url",
        URL,
        "--store-id",
        "7",
        "--wat",
      ]),
    /Unknown argument/,
  );
  assert.throws(
    () =>
      parseBackfillTripStoreOptions([
        "--database-url",
        URL,
        "--database-url",
        URL,
        "--store-id",
        "7",
      ]),
    /may only be provided once/,
  );
});
