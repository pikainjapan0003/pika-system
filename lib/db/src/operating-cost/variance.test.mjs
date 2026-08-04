import assert from "node:assert/strict";
import test from "node:test";

import { calculateVariance } from "./variance.ts";

test("higher actual income is favorable", () => {
  const result = calculateVariance({
    estimated: "100",
    actual: "120",
    metricKind: "income",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.difference.toDecimalPlaces(2), "20.00");
  assert.equal(result.percent.toDecimalPlaces(4), "0.2000");
  assert.equal(result.direction, "favorable");
});

test("higher actual cost is unfavorable", () => {
  const result = calculateVariance({
    estimated: "100",
    actual: "120",
    metricKind: "cost",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.direction, "unfavorable");
});

test("lower actual cost is favorable and keeps a signed percent", () => {
  const result = calculateVariance({
    estimated: "100",
    actual: "80",
    metricKind: "cost",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.difference.toDecimalPlaces(0), "-20");
  assert.equal(result.percent.toDecimalPlaces(2), "-0.20");
  assert.equal(result.direction, "favorable");
});

test("negative profit estimate uses its absolute value as denominator", () => {
  const result = calculateVariance({
    estimated: "-100",
    actual: "-80",
    metricKind: "profit",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.difference.toDecimalPlaces(0), "20");
  assert.equal(result.percent.toDecimalPlaces(2), "0.20");
  assert.equal(result.direction, "favorable");
});

test("zero estimate returns null percent instead of dividing by zero", () => {
  const result = calculateVariance({
    estimated: "0",
    actual: "10",
    metricKind: "income",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.percent, null);
  assert.equal(result.direction, "favorable");
});

test("equal values are neutral", () => {
  const result = calculateVariance({
    estimated: "15.25",
    actual: "15.25",
    metricKind: "cost",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.difference.toDecimalPlaces(2), "0.00");
  assert.equal(result.percent.toDecimalPlaces(2), "0.00");
  assert.equal(result.direction, "neutral");
});

test("missing values fail closed", () => {
  assert.deepEqual(
    calculateVariance({ estimated: null, actual: "10", metricKind: "income" }),
    {
      status: "pending_confirmation",
      label: "待確認",
      reason: "缺少預估或實際資料",
    },
  );
});
