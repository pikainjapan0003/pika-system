import assert from "node:assert/strict";
import test from "node:test";

import {
  CVS_STORE_POSSIBLY_STALE_DAYS,
  CVS_STORE_VERIFY_FIRST_DAYS,
  getCvsStoreFreshness,
} from "./cvsStoreFreshness.ts";

const NOW = new Date("2026-07-16T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

test("freshness thresholds are owner-adjustable constants", () => {
  assert.equal(CVS_STORE_POSSIBLY_STALE_DAYS, 35);
  assert.equal(CVS_STORE_VERIFY_FIRST_DAYS, 60);
});

test("35 days old remains fresh while more than 35 days warns", () => {
  assert.deepEqual(getCvsStoreFreshness(daysAgo(35), NOW), {
    level: "fresh",
    label: null,
  });
  assert.deepEqual(getCvsStoreFreshness(daysAgo(36), NOW), {
    level: "possibly_stale",
    label: "資料可能過期",
  });
});

test("more than 60 days requires manual verification", () => {
  assert.deepEqual(getCvsStoreFreshness(daysAgo(61), NOW), {
    level: "verify_first",
    label: "請先人工核對",
  });
});

test("missing or invalid source time fails safe", () => {
  for (const value of [null, "not-a-date"]) {
    assert.deepEqual(getCvsStoreFreshness(value, NOW), {
      level: "verify_first",
      label: "請先人工核對",
    });
  }
});
