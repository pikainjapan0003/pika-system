import assert from "node:assert/strict";
import test from "node:test";

import { calculateFuelCost } from "./fuelCost.ts";

test("actual fuel cost wins even when estimate inputs are present", () => {
  const result = calculateFuelCost({
    actualFuelJpy: "800",
    distanceKm: "100",
    fuelPriceJpyPerLiter: "180",
    fuelEfficiencyKmPerLiter: "10",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source, "actual");
  assert.equal(result.fuelJpy.toDecimalPlaces(4), "800.0000");
});

test("an explicit actual zero remains authoritative", () => {
  const result = calculateFuelCost({ actualFuelJpy: "0" });

  assert.equal(result.status, "ready");
  assert.equal(result.source, "actual");
  assert.equal(result.fuelJpy.toDecimalPlaces(0), "0");
});

test("estimate uses exact distance times price divided by efficiency", () => {
  const result = calculateFuelCost({
    distanceKm: "123.4",
    fuelPriceJpyPerLiter: "179.8",
    fuelEfficiencyKmPerLiter: "12.5",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source, "estimated");
  assert.equal(result.fuelJpy.toDecimalPlaces(6), "1774.985600");
});

test("missing estimate inputs fail closed as pending", () => {
  const result = calculateFuelCost({
    distanceKm: "100",
    fuelPriceJpyPerLiter: "180",
  });

  assert.deepEqual(result, {
    status: "pending_confirmation",
    label: "待確認",
    reason: "缺少油資估算資料",
  });
});

test("zero efficiency returns pending instead of Infinity", () => {
  const result = calculateFuelCost({
    distanceKm: "100",
    fuelPriceJpyPerLiter: "180",
    fuelEfficiencyKmPerLiter: "0",
  });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "燃油效率不可為 0");
});

test("negative money or distance inputs are rejected", () => {
  assert.throws(
    () => calculateFuelCost({ actualFuelJpy: "-1" }),
    /actualFuelJpy cannot be negative/,
  );
});
