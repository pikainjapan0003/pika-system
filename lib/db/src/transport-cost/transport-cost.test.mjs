import assert from "node:assert/strict";
import test from "node:test";
import {
  ExactDecimal,
  PENDING_CONFIRMATION_LABEL,
  calculateTransportCost,
} from "./index.ts";

function requireReady(result) {
  assert.equal(result.status, "ready");
  return result;
}

test("Fixture A: 新千歲空港 matches the Sheet calculation chain", () => {
  const result = requireReady(calculateTransportCost({
    estQty: 180,
    exchangeRate: "0.199",
    trainJpy: "0",
    fuelJpy: "8371",
    parkingJpy: "5000",
    cardboardJpy: "1360",
    shippingJpy: "6136",
  }));

  assert.equal(result.etcJpy.toDecimalPlaces(0), "5400");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "112.44");
  assert.equal(result.totalJpy.toDecimalPlaces(2), "26379.44");
  assert.equal(result.domesticPerItem.toDecimalPlaces(8), "41.64444444");
  assert.equal(result.transportPerItem.toDecimalPlaces(3), "104.908");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(8), "29.16393644");
  assert.equal(result.displayFinalCostTwd, "29");
});

test("Fixture B: 小樽 matches the authoritative Sheet row and product lookup value", () => {
  // Source: Google Sheet ID 17U5QBLqbIl0nj6eMSFflDl2s6E1a5amj7JCTG57Oa4I,
  // tab "規劃成本暫存區", row 5, Sheets API UNFORMATTED_VALUE,
  // service-account read-only fetch on 2026-07-14.
  const result = requireReady(calculateTransportCost({
    estQty: 160,
    exchangeRate: "0.199",
    trainJpy: "0",
    fuelJpy: "3515",
    parkingJpy: "2100",
    cardboardJpy: "1360",
    shippingJpy: "6136",
  }));

  assert.equal(result.etcJpy.toDecimalPlaces(0), "4800");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "112.44");
  assert.equal(result.totalJpy.toDecimalPlaces(2), "18023.44");
  assert.equal(result.domesticPerItem.toDecimalPlaces(2), "46.85");
  assert.equal(result.transportPerItem.toDecimalPlaces(4), "65.7965");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(7), "22.4166535");

  const productTransportVariableCost = ExactDecimal.from("22.4166535");
  assert.equal(result.finalCostPerItem.equals(productTransportVariableCost), true);
});

test("Fixture C: invalid est_qty stays pending instead of becoming zero", () => {
  for (const estQty of [0, "", -1]) {
    assert.deepEqual(calculateTransportCost({ estQty, exchangeRate: "0.2" }), {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "invalid_est_qty",
    });
  }
});

test("Fixture C: missing exchange_rate stays pending instead of becoming zero", () => {
  for (const exchangeRate of [null, undefined, ""]) {
    assert.deepEqual(calculateTransportCost({ estQty: 1, exchangeRate }), {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_exchange_rate",
    });
  }
});

test("Fixture C: all zero JPY fields produce an exact zero cost", () => {
  const result = requireReady(calculateTransportCost({
    estQty: 1,
    exchangeRate: "0.2",
    overrides: {
      etcJpy: { isOverridden: true, value: "0" },
    },
  }));

  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "0.00");
  assert.equal(result.totalJpy.toDecimalPlaces(2), "0.00");
  assert.equal(result.domesticPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "0.0");
  assert.equal(result.displayFinalCostTwd, "0");
});

test("manual overrides are explicit and feed only the formulas that reference their field", () => {
  const result = requireReady(calculateTransportCost({
    estQty: 2,
    exchangeRate: "0.2",
    cardboardJpy: "100",
    shippingJpy: "100",
    overrides: {
      etcJpy: { isOverridden: true, value: "20" },
      fee1_5Pct: { isOverridden: true, value: "4" },
      totalJpy: { isOverridden: true, value: "999" },
      domesticPerItem: { isOverridden: true, value: "101" },
      transportPerItem: { isOverridden: true, value: "12" },
      finalCostPerItem: { isOverridden: true, value: "23.4" },
    },
  }));

  assert.equal(result.etcJpy.toDecimalPlaces(0), "20");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(0), "4");
  assert.equal(result.totalJpy.toDecimalPlaces(0), "999");
  assert.equal(result.domesticPerItem.toDecimalPlaces(0), "101");
  assert.equal(result.transportPerItem.toDecimalPlaces(0), "12");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "23.4");
  assert.equal(result.displayFinalCostTwd, "23");
});

test("an etcJpy override flows into downstream transport and final cost", () => {
  const result = requireReady(calculateTransportCost({
    estQty: 2,
    exchangeRate: "0.2",
    cardboardJpy: "100",
    shippingJpy: "100",
    overrides: {
      etcJpy: { isOverridden: true, value: "20" },
    },
  }));

  assert.equal(result.etcJpy.toDecimalPlaces(0), "20");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(0), "3");
  assert.equal(result.transportPerItem.toDecimalPlaces(1), "11.5");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "22.3");
});

test("display rounds an exact .5 TWD boundary half-up", () => {
  const result = requireReady(calculateTransportCost({
    estQty: 1,
    exchangeRate: "0.5",
    trainJpy: "27",
  }));

  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "28.5");
  assert.equal(result.displayFinalCostTwd, "29");
});
