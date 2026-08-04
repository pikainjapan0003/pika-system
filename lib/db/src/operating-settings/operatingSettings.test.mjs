import assert from "node:assert/strict";
import test from "node:test";

import { readOperatingSettings, writeOperatingSettings } from "./index.ts";

test("read returns the persisted global daily wage", async () => {
  const updatedAt = new Date("2026-08-04T00:00:00.000Z");
  const queryable = {
    async query() {
      return {
        rows: [
          {
            id: 1,
            reference_daily_wage: "1800.000000000000",
            updated_at: updatedAt,
          },
        ],
      };
    },
  };

  assert.deepEqual(await readOperatingSettings(queryable), {
    id: 1,
    referenceDailyWage: "1800.000000000000",
    updatedAt,
  });
});

test("read falls back to the Sheet daily wage when the singleton is absent", async () => {
  const queryable = {
    async query() {
      return { rows: [] };
    },
  };

  assert.deepEqual(await readOperatingSettings(queryable), {
    id: 1,
    referenceDailyWage: "1500",
    updatedAt: null,
  });
});

test("write upserts the singleton and keeps money as a decimal string", async () => {
  const calls = [];
  const updatedAt = new Date("2026-08-04T01:00:00.000Z");
  const queryable = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [
          {
            id: 1,
            reference_daily_wage: values[1],
            updated_at: updatedAt,
          },
        ],
      };
    },
  };

  const written = await writeOperatingSettings(queryable, "1500.5");

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(calls[0].values, [1, "1500.500000000000"]);
  assert.deepEqual(written, {
    id: 1,
    referenceDailyWage: "1500.500000000000",
    updatedAt,
  });
});

test("write rejects a negative global daily wage", async () => {
  const queryable = {
    async query() {
      return { rows: [] };
    },
  };
  await assert.rejects(
    writeOperatingSettings(queryable, "-1"),
    /referenceDailyWage must be non-negative/,
  );
});
