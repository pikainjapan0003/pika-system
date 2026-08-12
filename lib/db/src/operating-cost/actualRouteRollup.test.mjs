import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateActualQuantityRollup,
  calculateActualRouteCostRollup,
} from "./actualRouteRollup.ts";

test("actual costs group route and trip-wide entries with exact currency subtotals", () => {
  const result = calculateActualRouteCostRollup({
    actualExchangeRate: "0.205",
    entries: [
      {
        tripRouteId: 7,
        mode: "ACTUAL",
        status: "ACTIVE",
        currency: "JPY",
        originalAmount: "1000.25",
      },
      {
        tripRouteId: 7,
        mode: "ACTUAL",
        status: "ACTIVE",
        currency: "TWD",
        originalAmount: "50.75",
      },
      {
        tripRouteId: null,
        mode: "ACTUAL",
        status: "ACTIVE",
        currency: "JPY",
        originalAmount: "100",
      },
      {
        tripRouteId: 7,
        mode: "ACTUAL",
        status: "VOID",
        currency: "JPY",
        originalAmount: "9999",
      },
      {
        tripRouteId: 7,
        mode: "ESTIMATE",
        status: "ACTIVE",
        currency: "TWD",
        originalAmount: "9999",
      },
    ],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.groups.length, 2);
  const tripWide = result.groups.find((group) => group.tripRouteId === null);
  const route = result.groups.find((group) => group.tripRouteId === 7);
  assert.equal(tripWide.status, "ready");
  assert.equal(tripWide.originalJpyTotal.toDecimalPlaces(2), "100.00");
  assert.equal(tripWide.totalTwd.toDecimalPlaces(3), "20.500");
  assert.equal(route.status, "ready");
  assert.equal(route.originalJpyTotal.toDecimalPlaces(2), "1000.25");
  assert.equal(route.originalTwdTotal.toDecimalPlaces(2), "50.75");
  assert.equal(route.totalTwd.toDecimalPlaces(5), "255.80125");
});

test("JPY actual cost without actual exchange rate fails closed while TWD-only group stays ready", () => {
  const result = calculateActualRouteCostRollup({
    actualExchangeRate: null,
    entries: [
      {
        tripRouteId: 1,
        mode: "ACTUAL",
        status: "ACTIVE",
        currency: "JPY",
        originalAmount: "1",
      },
      {
        tripRouteId: 2,
        mode: "ACTUAL",
        status: "ACTIVE",
        currency: "TWD",
        originalAmount: "25",
      },
    ],
  });

  assert.equal(result.status, "pending_confirmation");
  assert.deepEqual(
    result.groups.find((group) => group.tripRouteId === 1),
    {
      status: "pending_confirmation",
      label: "待確認",
      reason: "missing_actual_exchange_rate",
      tripRouteId: 1,
      originalJpyTotal: result.groups[0].originalJpyTotal,
      originalTwdTotal: result.groups[0].originalTwdTotal,
      convertedJpyTotalTwd: null,
      totalTwd: null,
    },
  );
  const twdOnly = result.groups.find((group) => group.tripRouteId === 2);
  assert.equal(twdOnly.status, "ready");
  assert.equal(twdOnly.totalTwd.toDecimalPlaces(0), "25");
});

test("actual quantities include exactly four statuses and exclude unlinked products", () => {
  const result = calculateActualQuantityRollup([
    { tripRouteId: 1, status: "awaiting_payment", quantity: 2 },
    { tripRouteId: 1, status: "preparing", quantity: 3 },
    { tripRouteId: 1, status: "shipped", quantity: 5 },
    { tripRouteId: 2, status: "completed", quantity: 7 },
    { tripRouteId: 1, status: "pending", quantity: 100 },
    { tripRouteId: 2, status: "cancelled", quantity: 100 },
    { tripRouteId: null, status: "completed", quantity: 100 },
  ]);

  assert.deepEqual(result.routes, [
    { tripRouteId: 1, actualQuantity: 10n },
    { tripRouteId: 2, actualQuantity: 7n },
  ]);
  assert.equal(result.totalActualQuantity, 17n);
});
