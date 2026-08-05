import assert from "node:assert/strict";
import test from "node:test";
import { compareFixedCostEntries } from "./fixedCostVariance.ts";

const base = {
  mode: "ESTIMATE",
  currency: "TWD",
  categoryId: 1,
  categoryName: "人事費用",
};

function compareReady(...args) {
  const result = compareFixedCostEntries(...args);
  assert.equal(result.status, "ready");
  return result.rows;
}

test("matched category reports exact estimate, actual and favorable direction", () => {
  const rows = compareReady(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "80" }],
    "0.2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "matched");
  assert.equal(rows[0].variance.direction, "favorable");
});

test("matched category reports unfavorable when actual is higher", () => {
  const rows = compareReady(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "120" }],
    "0.2",
  );
  assert.equal(rows[0].variance.direction, "unfavorable");
});

test("equal category is neutral", () => {
  const rows = compareReady(
    [{ ...base, originalAmount: "100" }],
    [{ ...base, mode: "ACTUAL", originalAmount: "100" }],
    "0.2",
  );
  assert.equal(rows[0].variance.direction, "neutral");
});

test("estimate-only category is marked 未發生", () => {
  const rows = compareReady(
    [{ ...base, originalAmount: "100" }],
    [],
    "0.2",
  );
  assert.equal(rows[0].state, "未發生");
  assert.equal(rows[0].actualTwd, null);
});

test("actual-only category is marked 預算外", () => {
  const rows = compareReady(
    [],
    [{ ...base, mode: "ACTUAL", originalAmount: "100" }],
    "0.2",
  );
  assert.equal(rows[0].state, "預算外");
  assert.equal(rows[0].estimatedTwd, null);
});

test("custom labels match by text and VOID entries are excluded", () => {
  const rows = compareReady(
    [
      {
        mode: "ESTIMATE",
        currency: "JPY",
        originalAmount: "100",
        customLabel: "導遊",
      },
    ],
    [
      {
        mode: "ACTUAL",
        currency: "JPY",
        originalAmount: "110",
        customLabel: "導遊",
      },
      {
        mode: "ACTUAL",
        currency: "TWD",
        originalAmount: "999",
        customLabel: "作廢",
        status: "VOID",
      },
    ],
    "0.2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "導遊");
  assert.equal(rows[0].actualTwd.toDecimalPlaces(2), "22.00");
});

test("estimate and actual JPY entries use their own exchange rates", () => {
  const rows = compareReady(
    [{ ...base, currency: "JPY", originalAmount: "1000" }],
    [{ ...base, mode: "ACTUAL", currency: "JPY", originalAmount: "1000" }],
    { estimated: "0.2", actual: "0.25" },
  );
  assert.equal(rows[0].estimatedTwd.toDecimalPlaces(2), "200.00");
  assert.equal(rows[0].actualTwd.toDecimalPlaces(2), "250.00");
});

test("JPY estimates without an estimated exchange rate stay pending", () => {
  const result = compareFixedCostEntries(
    [{ ...base, currency: "JPY", originalAmount: "1000" }],
    [],
    { estimated: null, actual: "0.25" },
  );
  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少匯率");
});

test("JPY actuals without an actual exchange rate stay pending", () => {
  const result = compareFixedCostEntries(
    [],
    [{ ...base, mode: "ACTUAL", currency: "JPY", originalAmount: "1000" }],
    { estimated: "0.2", actual: null },
  );
  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少匯率");
});
