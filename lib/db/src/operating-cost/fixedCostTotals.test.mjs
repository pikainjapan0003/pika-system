import test from "node:test";
import assert from "node:assert/strict";
import { calculateFixedCostTotals } from "./fixedCostTotals.ts";

test("converts active JPY and TWD entries with exact arithmetic", () => {
  const result = calculateFixedCostTotals({
    exchangeRate: "0.21",
    entries: [
      { currency: "JPY", originalAmount: "1000" },
      { currency: "TWD", originalAmount: "300" },
      { currency: "JPY", originalAmount: "50", status: "VOID" },
    ],
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.fixedCostJpyOriginTwd.toDecimalPlaces(2), "210.00");
    assert.equal(result.fixedCostTwdDirectTwd.toDecimalPlaces(2), "300.00");
    assert.equal(result.fixedCostTotalTwd.toDecimalPlaces(2), "510.00");
  }
});

test("returns pending when JPY exists without a side FX", () => {
  const result = calculateFixedCostTotals({
    entries: [{ currency: "JPY", originalAmount: "1" }],
  });
  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少匯率");
});

test("TWD-only entries do not require FX", () => {
  const result = calculateFixedCostTotals({
    entries: [{ currency: "TWD", originalAmount: "123.45" }],
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.fixedCostJpyOriginTwd.toDecimalPlaces(2), "0.00");
    assert.equal(result.fixedCostTotalTwd.toDecimalPlaces(2), "123.45");
  }
});

test("custom labels and estimate/actual modes are still included", () => {
  const result = calculateFixedCostTotals({
    exchangeRate: "0.2",
    entries: [
      { mode: "ESTIMATE", currency: "JPY", originalAmount: "10" },
      { mode: "ACTUAL", currency: "TWD", originalAmount: "20" },
    ],
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.fixedCostTotalTwd.toDecimalPlaces(2), "22.00");
  }
});
