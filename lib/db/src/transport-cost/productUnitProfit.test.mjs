import assert from "node:assert/strict";
import test from "node:test";
import { PENDING_CONFIRMATION_LABEL } from "./index.ts";
import {
  TRANSPORT_EXEMPT_LABEL,
  calculateProductUnitProfit,
} from "./productUnitProfit.ts";

const product = { tripRouteId: 5 };
const trip = { id: 2, exchangeRate: "0.199" };
const route = {
  id: 5,
  tripId: 2,
  estQty: 160,
  trainJpy: "0",
  fuelJpy: "3515",
  parkingJpy: "2100",
  etcJpy: "4800",
  cardboardJpy: "1360",
  shippingJpy: "6136",
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

function calculate(overrides = {}) {
  return calculateProductUnitProfit({
    unitPriceTwd: "800",
    costJpy: "2970",
    storePurchaseExchangeRate: "0.199",
    isTransportCostExempt: false,
    transport: { product, route, trip },
    ...overrides,
  });
}

function requireReady(result) {
  assert.equal(result.status, "ready");
  return result;
}

test("Fixture A: roadmap product cost and full profit are exact when transport is exempt", () => {
  // Independently fixed expectation: 8000 × 0.21 = 1680; 1900 - 1680 = 220.
  const result = requireReady(
    calculate({
      unitPriceTwd: "1900",
      costJpy: "8000",
      storePurchaseExchangeRate: "0.21",
      isTransportCostExempt: true,
      transport: { product: { tripRouteId: null }, route: null, trip: null },
    }),
  );

  assert.equal(result.transportStatus, "exempt");
  assert.equal(result.label, TRANSPORT_EXEMPT_LABEL);
  assert.equal(result.productCostTwd.toDecimalPlaces(0), "1680");
  assert.equal(result.unitTransportCostTwd.toDecimalPlaces(0), "0");
  assert.equal(result.unitProfitTwd.toDecimalPlaces(0), "220");
  assert.equal(result.fullUnitProfitTwd.toDecimalPlaces(0), "220");
});

test("Fixture B: 小樽 transport is deducted from unit profit but not full profit", () => {
  // Purchase calculation: 2970 × 0.199 = 591.03.
  // Sheet-authoritative transport fixture: 22.4166535 TWD.
  // Unit profit: 800 - 591.03 - 22.4166535 = 186.5533465.
  // Full profit: 800 - 591.03 = 208.97.
  const result = requireReady(calculate());

  assert.equal(result.transportStatus, "allocated");
  assert.equal(result.productCostTwd.toDecimalPlaces(2), "591.03");
  assert.equal(result.unitTransportCostTwd.toDecimalPlaces(7), "22.4166535");
  assert.equal(result.unitProfitTwd.toDecimalPlaces(7), "186.5533465");
  assert.equal(result.fullUnitProfitTwd.toDecimalPlaces(2), "208.97");
  assert.equal(result.displayUnitProfitTwd, "187");
  assert.equal(result.displayFullUnitProfitTwd, "209");
});

test("Fixture C: transport exemption is explicit while an unattached non-exempt product stays pending", () => {
  const unattachedTransport = {
    product: { tripRouteId: null },
    route: null,
    trip: null,
  };
  const exempt = requireReady(
    calculate({
      isTransportCostExempt: true,
      transport: unattachedTransport,
    }),
  );
  assert.equal(exempt.transportStatus, "exempt");
  assert.equal(exempt.label, TRANSPORT_EXEMPT_LABEL);
  assert.equal(exempt.unitProfitTwd.equals(exempt.fullUnitProfitTwd), true);

  assert.deepEqual(calculate({ transport: unattachedTransport }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "transport_pending_confirmation",
    transportReason: "missing_trip_route_attachment",
  });
});

test("Fixture D: missing cost or store rate stays pending instead of becoming zero", () => {
  assert.deepEqual(calculate({ costJpy: null }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_product_cost_jpy",
  });
  assert.deepEqual(calculate({ storePurchaseExchangeRate: "" }), {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason: "missing_store_purchase_exchange_rate",
  });
});

test("Fixture D: changing the store rate immediately recalculates profit without caching transport", () => {
  const original = requireReady(calculate());
  const changed = requireReady(
    calculate({ storePurchaseExchangeRate: "0.21" }),
  );

  assert.equal(original.productCostTwd.toDecimalPlaces(2), "591.03");
  assert.equal(original.unitProfitTwd.toDecimalPlaces(7), "186.5533465");
  assert.equal(changed.productCostTwd.toDecimalPlaces(1), "623.7");
  assert.equal(changed.unitTransportCostTwd.toDecimalPlaces(7), "22.4166535");
  assert.equal(changed.unitProfitTwd.toDecimalPlaces(7), "153.8833465");
  assert.equal(changed.fullUnitProfitTwd.toDecimalPlaces(1), "176.3");
});

test("Fixture E: display rounds an exact 28.5 TWD profit half-up to 29", () => {
  // 143 × 0.5 = 71.5; 100 - 71.5 = 28.5. Half-even would return 28.
  const result = requireReady(
    calculate({
      unitPriceTwd: "100",
      costJpy: "143",
      storePurchaseExchangeRate: "0.5",
      isTransportCostExempt: true,
    }),
  );

  assert.equal(result.unitProfitTwd.toDecimalPlaces(1), "28.5");
  assert.equal(result.displayUnitProfitTwd, "29");
  assert.equal(result.displayFullUnitProfitTwd, "29");
});

test("negative monetary inputs are rejected instead of producing a low cost", () => {
  assert.throws(
    () => calculate({ costJpy: "-1" }),
    /costJpy cannot be negative/,
  );
  assert.throws(
    () => calculate({ storePurchaseExchangeRate: "-0.1" }),
    /storePurchaseExchangeRate cannot be negative/,
  );
});
