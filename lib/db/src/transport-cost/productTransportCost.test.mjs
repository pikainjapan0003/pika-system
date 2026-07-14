import assert from "node:assert/strict";
import test from "node:test";
import { PENDING_CONFIRMATION_LABEL } from "./index.ts";
import { resolveProductTransportCost } from "./productTransportCost.ts";

const product = { tripRouteId: 5 };
const trip = { id: 2, exchangeRate: "0.199" };
const route = {
  id: 5,
  tripId: 2,
  estQty: 160,
  trainJpy: "0",
  fuelJpy: "3515",
  parkingJpy: "2100",
  cardboardJpy: "1360",
  shippingJpy: "6136",
  etcJpyOverride: null,
  etcJpyIsOverridden: false,
  fee1_5PctOverride: null,
  fee1_5PctIsOverridden: false,
  totalJpyOverride: null,
  totalJpyIsOverridden: false,
  domesticPerItemOverride: null,
  domesticPerItemIsOverridden: false,
  transportPerItemOverride: null,
  transportPerItemIsOverridden: false,
  finalCostPerItemOverride: null,
  finalCostPerItemIsOverridden: false,
};

function resolve(overrides = {}) {
  return resolveProductTransportCost({ product, route, trip, ...overrides });
}

function requireReady(result) {
  assert.equal(result.status, "ready");
  return result;
}

test("Fixture B: attached product resolves the current 小樽 route cost", () => {
  // Source: Google Sheet ID 17U5QBLqbIl0nj6eMSFflDl2s6E1a5amj7JCTG57Oa4I,
  // tab "規劃成本暫存區", row 5, fetched read-only on 2026-07-14.
  const result = requireReady(resolve());

  assert.equal(result.finalCostPerItem.toDecimalPlaces(7), "22.4166535");
});

test("an unattached product stays pending instead of becoming zero", () => {
  assert.deepEqual(resolve({ product: { tripRouteId: null } }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_trip_route_attachment",
  });
});

test("a missing attached route stays pending instead of becoming zero", () => {
  assert.deepEqual(resolve({ route: null }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_trip_route",
  });
});

test("a route ID mismatch stays pending instead of resolving another route", () => {
  assert.deepEqual(resolve({ route: { ...route, id: 6 } }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_trip_route",
  });
});

test("a missing parent trip stays pending instead of becoming zero", () => {
  assert.deepEqual(resolve({ trip: null }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_trip",
  });
});

test("a trip ID mismatch stays pending instead of using an unrelated trip rate", () => {
  assert.deepEqual(resolve({ trip: { ...trip, id: 9 } }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_trip",
  });
});

test("an invalid route est_qty stays pending instead of becoming zero", () => {
  assert.deepEqual(resolve({ route: { ...route, estQty: 0 } }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "invalid_est_qty",
  });
});

test("a missing trip exchange rate stays pending instead of becoming zero", () => {
  assert.deepEqual(resolve({ trip: { ...trip, exchangeRate: null } }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_exchange_rate",
  });
});

test("the same attached product dynamically reflects changed route inputs", () => {
  const original = requireReady(resolve());
  const changed = requireReady(resolve({ route: { ...route, fuelJpy: "4515" } }));

  assert.equal(original.finalCostPerItem.toDecimalPlaces(7), "22.4166535");
  assert.equal(changed.finalCostPerItem.toDecimalPlaces(7), "23.6604035");
  assert.equal(original.finalCostPerItem.equals(changed.finalCostPerItem), false);
});

test("a route fee override maps into fee and downstream total", () => {
  const result = requireReady(resolve({
    route: {
      ...route,
      fee1_5PctIsOverridden: true,
      fee1_5PctOverride: "4",
    },
  }));

  assert.equal(result.fee1_5Pct.toDecimalPlaces(0), "4");
  assert.equal(result.totalJpy.toDecimalPlaces(0), "17915");
});

test("Q61: product transport cost uses only trip.exchange_rate", () => {
  // Owner decision Q61: product purchase-rate concepts are deliberately absent;
  // the resolver must source its exchange rate only from trip.exchangeRate.
  const result = requireReady(resolve({ trip: { ...trip, exchangeRate: "0.2" } }));

  assert.equal(result.finalCostPerItem.toDecimalPlaces(4), "22.5293");
});
