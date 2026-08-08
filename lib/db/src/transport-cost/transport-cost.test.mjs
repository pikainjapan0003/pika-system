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

test("26.03 Sheet reconciliation: 新千歲空港主表 T22", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 120,
      exchangeRate: "0.21",
      etcJpy: "0",
      trainJpy: "0",
      fuelJpy: "6270",
      parkingJpy: "0",
      cardboardJpy: "0",
      shippingJpy: "0",
    }),
  );

  assert.equal(
    result.finalCostPerItem.toDecimalPlaces(15),
    "11.137087500000000",
  );
});

test("Fixture A regression lock（系統公式，非 Sheet 對帳）", () => {
  // 來源 Sheet 為 26.06，2026-08-08 已降為參考；權威為 26.03。
  // 見 PROJECT_PLAN §20.1 A。
  const result = requireReady(
    calculateTransportCost({
      estQty: 180,
      exchangeRate: "0.199",
      etcJpy: "5400",
      trainJpy: "0",
      fuelJpy: "8371",
      parkingJpy: "5000",
      cardboardJpy: "1360",
      shippingJpy: "6136",
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "5400");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "394.005");
  assert.equal(result.totalJpy.toDecimalPlaces(3), "26661.005");
  assert.equal(result.domesticPerItem.toDecimalPlaces(8), "41.64444444");
  assert.equal(result.transportPerItem.toDecimalPlaces(5), "106.47225");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(8), "29.47522219");
  assert.equal(result.displayFinalCostTwd, "29");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("112.44")), false);
});

test("Fixture B regression lock（系統公式，非 Sheet 對帳）", () => {
  // Source: Google Sheet ID 17U5QBLqbIl0nj6eMSFflDl2s6E1a5amj7JCTG57Oa4I,
  // tab "規劃成本暫存區", row 5, Sheets API UNFORMATTED_VALUE,
  // service-account read-only fetch on 2026-07-14.
  // 來源 Sheet 為 26.06，2026-08-08 已降為參考；權威為 26.03。
  // 見 PROJECT_PLAN §20.1 A。
  const result = requireReady(
    calculateTransportCost({
      estQty: 160,
      exchangeRate: "0.199",
      etcJpy: "4800",
      trainJpy: "0",
      fuelJpy: "3515",
      parkingJpy: "2100",
      cardboardJpy: "1360",
      shippingJpy: "6136",
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "4800");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "268.665");
  assert.equal(result.totalJpy.toDecimalPlaces(3), "18179.665");
  assert.equal(result.domesticPerItem.toDecimalPlaces(2), "46.85");
  assert.equal(result.transportPerItem.toDecimalPlaces(8), "66.77290625");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(8), "22.61095834");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("112.44")), false);

  const productTransportVariableCost = ExactDecimal.from("22.61095834375");
  assert.equal(
    result.finalCostPerItem.equals(productTransportVariableCost),
    true,
  );
});

test("the 1.5% fee base includes all six JPY inputs", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 10,
      exchangeRate: "0.2",
      etcJpy: "10",
      trainJpy: "20",
      fuelJpy: "30",
      parkingJpy: "40",
      cardboardJpy: "50",
      shippingJpy: "60",
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "3.150");
});

test("cardboard and shipping-only fee behavior remains unchanged", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 2,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: "0",
      cardboardJpy: "100",
      shippingJpy: "100",
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "3.00");
  assert.equal(result.domesticPerItem.toDecimalPlaces(2), "100.00");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "1.50");
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

test("Fixture C: missing manually entered ETC stays pending instead of using a formula", () => {
  for (const etcJpy of [null, undefined, ""]) {
    assert.deepEqual(
      calculateTransportCost({ estQty: 1, exchangeRate: "0.2", etcJpy }),
      {
        status: "pending_confirmation",
        label: PENDING_CONFIRMATION_LABEL,
        reason: "missing_etc_jpy",
      },
    );
  }
});

test("Fixture C: missing fuel stays pending while explicit zero remains a ready zero cost", () => {
  for (const fuelJpy of [null, undefined, "", "  "]) {
    const result = calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy,
    });

    assert.deepEqual(result, {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_fuel_jpy",
    });
    assert.equal("totalJpy" in result, false);
  }

  const explicitZero = requireReady(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: "0",
    }),
  );

  assert.equal(explicitZero.totalJpy.toDecimalPlaces(2), "0.00");
  assert.equal(explicitZero.displayFinalCostTwd, "0");
});

test("missing ETC takes precedence when ETC and fuel are both missing", () => {
  assert.deepEqual(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: null,
      fuelJpy: null,
    }),
    {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_etc_jpy",
    },
  );
});

test("manual overrides cannot bypass a missing fuel value", () => {
  assert.deepEqual(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: null,
      overrides: {
        fee1_5Pct: { isOverridden: true, value: "1" },
        totalJpy: { isOverridden: true, value: "2" },
        domesticPerItem: { isOverridden: true, value: "3" },
        transportPerItem: { isOverridden: true, value: "4" },
        finalCostPerItem: { isOverridden: true, value: "5" },
      },
    }),
    {
      status: "pending_confirmation",
      label: PENDING_CONFIRMATION_LABEL,
      reason: "missing_fuel_jpy",
    },
  );
});

test("Fixture C: all zero JPY fields produce an exact zero cost", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: "0",
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "0.00");
  assert.equal(result.totalJpy.toDecimalPlaces(2), "0.00");
  assert.equal(result.domesticPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "0.0");
  assert.equal(result.displayFinalCostTwd, "0");
});

test("manual overrides are explicit and feed only the formulas that reference their field", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 2,
      exchangeRate: "0.2",
      etcJpy: "20",
      fuelJpy: "0",
      cardboardJpy: "100",
      shippingJpy: "100",
      overrides: {
        fee1_5Pct: { isOverridden: true, value: "4" },
        totalJpy: { isOverridden: true, value: "999" },
        domesticPerItem: { isOverridden: true, value: "101" },
        transportPerItem: { isOverridden: true, value: "12" },
        finalCostPerItem: { isOverridden: true, value: "23.4" },
      },
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "20");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(0), "4");
  assert.equal(result.totalJpy.toDecimalPlaces(0), "999");
  assert.equal(result.domesticPerItem.toDecimalPlaces(0), "101");
  assert.equal(result.transportPerItem.toDecimalPlaces(0), "12");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "23.4");
  assert.equal(result.displayFinalCostTwd, "23");
});

test("manually entered ETC flows into downstream transport and final cost", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 2,
      exchangeRate: "0.2",
      etcJpy: "20",
      fuelJpy: "0",
      cardboardJpy: "100",
      shippingJpy: "100",
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "20");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(1), "3.3");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "11.65");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(2), "22.33");
});

test("ETC is the entered route total and is never recalculated from estimated quantity", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 160,
      exchangeRate: "0.2",
      etcJpy: "1234",
      fuelJpy: "0",
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "1234");
  assert.equal(result.transportPerItem.toDecimalPlaces(7), "7.8281875");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(7), "1.5656375");
});

test("display rounds an exact .5 TWD boundary half-up", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.5",
      etcJpy: "30",
      trainJpy: "27",
      fuelJpy: "0",
    }),
  );

  assert.equal(result.finalCostPerItem.toDecimalPlaces(4), "28.9275");
  assert.equal(result.displayFinalCostTwd, "29");
});
