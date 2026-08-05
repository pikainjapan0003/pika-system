import assert from "node:assert/strict";
import test from "node:test";
import { compareFixedCostEntries } from "./fixedCostVariance.ts";

const base = { mode: "ESTIMATE", currency: "TWD", categoryId: 1, categoryName: "人事費用" };

test("matched category reports exact estimate, actual and favorable direction", () => {
  const rows = compareFixedCostEntries(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "80" }],
    "0.2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "matched");
  assert.equal(rows[0].variance.direction, "favorable");
});

test("matched category reports unfavorable when actual is higher", () => {
  const rows = compareFixedCostEntries(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "120" }],
    "0.2",
  );
  assert.equal(rows[0].variance.direction, "unfavorable");
});

test("equal category is neutral", () => {
  const rows = compareFixedCostEntries(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "100" }],
    "0.2",
  );
  assert.equal(rows[0].variance.direction, "neutral");
});

test("estimate-only category is marked 未發生", () => {
  const rows = compareFixedCostEntries([{ ...base, originalAmount: "100" }], [], "0.2");
  assert.equal(rows[0].state, "未發生");
  assert.equal(rows[0].actualTwd, null);
});

test("actual-only category is marked 預算外", () => {
  const rows = compareFixedCostEntries(
    [],
    [{ ...base, mode: "ACTUAL", originalAmount: "100" }],
    "0.2",
  );
  assert.equal(rows[0].state, "預算外");
  assert.equal(rows[0].estimatedTwd, null);
});

test("custom labels match by text and VOID entries are excluded", () => {
  const rows = compareFixedCostEntries(
    [{ mode: "ESTIMATE", currency: "JPY", originalAmount: "100", customLabel: "導遊" }],
    [
      { mode: "ACTUAL", currency: "JPY", originalAmount: "110", customLabel: "導遊" },
      { mode: "ACTUAL", currency: "TWD", originalAmount: "999", customLabel: "作廢", status: "VOID" },
    ],
    "0.2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "導遊");
  assert.equal(rows[0].actualTwd.toDecimalPlaces(2), "22.00");
});
