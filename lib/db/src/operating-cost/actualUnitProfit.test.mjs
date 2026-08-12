import assert from "node:assert/strict";
import test from "node:test";

import { calculateActualUnitProfit } from "./actualUnitProfit.ts";

test("actual unit profit uses exact route cost, actual quantity, and actual exchange rate", () => {
  const result = calculateActualUnitProfit({
    unitPriceTwd: "600",
    costJpy: "1000",
    actualExchangeRate: "0.2",
    routeActualCostTwd: "250",
    routeActualQuantity: "6",
  });

  assert.equal(result.status, "ready");
  assert.equal(
    result.routeActualUnitTransportCostTwd.toFractionString(),
    "125/3",
  );
  assert.equal(result.productCostTwd.toDecimalPlaces(2), "200.00");
  assert.equal(result.actualUnitProfitTwd.toFractionString(), "1075/3");
  assert.equal(
    result.actualUnitProfitTwd.toDecimalPlaces(12),
    "358.333333333333",
  );
});

test("zero or missing actual quantity fails closed instead of dividing by zero", () => {
  for (const routeActualQuantity of [0, "0", null, undefined]) {
    assert.deepEqual(
      calculateActualUnitProfit({
        unitPriceTwd: "600",
        costJpy: "1000",
        actualExchangeRate: "0.2",
        routeActualCostTwd: "250",
        routeActualQuantity,
      }),
      {
        status: "pending_confirmation",
        label: "待確認",
        reason: "missing_actual_quantity",
      },
    );
  }
});

test("missing actual exchange rate fails closed even for a zero JPY cost", () => {
  assert.deepEqual(
    calculateActualUnitProfit({
      unitPriceTwd: "600",
      costJpy: "0",
      actualExchangeRate: null,
      routeActualCostTwd: "250",
      routeActualQuantity: "6",
    }),
    {
      status: "pending_confirmation",
      label: "待確認",
      reason: "missing_actual_exchange_rate",
    },
  );
});

test("transport-exempt products count in the denominator but receive no allocation", () => {
  const result = calculateActualUnitProfit({
    unitPriceTwd: "500",
    costJpy: "500",
    actualExchangeRate: "0.2",
    routeActualCostTwd: "250",
    routeActualQuantity: "6",
    isTransportCostExempt: true,
  });

  assert.equal(result.status, "ready");
  assert.equal(
    result.routeActualUnitTransportCostTwd.toFractionString(),
    "125/3",
  );
  assert.equal(
    result.allocatedActualUnitTransportCostTwd.toDecimalPlaces(0),
    "0",
  );
  assert.equal(result.actualUnitProfitTwd.toDecimalPlaces(2), "400.00");
});

test("negative actual unit profit remains an exact result rather than pending", () => {
  const result = calculateActualUnitProfit({
    unitPriceTwd: "100",
    costJpy: "1000",
    actualExchangeRate: "0.2",
    routeActualCostTwd: "60",
    routeActualQuantity: "2",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.actualUnitProfitTwd.toDecimalPlaces(2), "-130.00");
});
