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

const ZERO_AREA_UNIT_TWD = ExactDecimal.zero();
const HOKKAIDO_AREA_UNIT_TWD = ExactDecimal.from("2065.09464").divide(
  ExactDecimal.from("605"),
);

test("26.03 Sheet reconciliation: 新千歲空港主表 T22", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 120,
      exchangeRate: "0.21",
      etcJpy: "0",
      trainJpy: "0",
      fuelJpy: "6270",
      parkingJpy: "0",
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
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
      areaUnitDomesticTwd: HOKKAIDO_AREA_UNIT_TWD,
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "5400");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "281.565");
  assert.equal(result.totalJpy.toDecimalPlaces(3), "19052.565");
  assert.equal(
    result.areaUnitDomesticTwd.toDecimalPlaces(15),
    "3.413379570247934",
  );
  assert.equal(result.transportPerItem.toDecimalPlaces(8), "105.84758333");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(8), "24.47704865");
  assert.equal(result.displayFinalCostTwd, "24");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("394.005")), false);
  assert.equal(
    result.finalCostPerItem.equals(ExactDecimal.from("29.475222194444444")),
    false,
  );
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
      areaUnitDomesticTwd: HOKKAIDO_AREA_UNIT_TWD,
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "4800");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "156.225");
  assert.equal(result.totalJpy.toDecimalPlaces(3), "10571.225");
  assert.equal(
    result.areaUnitDomesticTwd.toDecimalPlaces(15),
    "3.413379570247934",
  );
  assert.equal(result.transportPerItem.toDecimalPlaces(8), "66.07015625");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(8), "16.56134066");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("268.665")), false);

  const productTransportVariableCost = ExactDecimal.from("22.61095834375");
  assert.equal(
    result.finalCostPerItem.equals(productTransportVariableCost),
    false,
  );
});

test("the route 1.5% fee base includes only ETC, train, fuel and parking", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 10,
      exchangeRate: "0.2",
      etcJpy: "10",
      trainJpy: "20",
      fuelJpy: "30",
      parkingJpy: "40",
      areaUnitDomesticTwd: ExactDecimal.from("50"),
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(3), "1.500");
  assert.equal(result.areaUnitDomesticTwd.toDecimalPlaces(0), "50");
});

test("area domestic TWD is added outside the route exchange-rate conversion", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 2,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: "0",
      areaUnitDomesticTwd: ExactDecimal.from("100"),
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "0.00");
  assert.equal(result.areaUnitDomesticTwd.toDecimalPlaces(2), "100.00");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(2), "100.00");
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
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
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

test("all five legacy overrides cannot bypass a missing trip area", () => {
  assert.deepEqual(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.2",
      etcJpy: "0",
      fuelJpy: "0",
      areaUnitDomesticTwd: null,
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
      reason: "missing_trip_area",
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
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
    }),
  );

  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "0.00");
  assert.equal(result.totalJpy.toDecimalPlaces(2), "0.00");
  assert.equal(result.areaUnitDomesticTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "0.00");
  assert.equal(result.hepPerItemTwd.toDecimalPlaces(2), "0.00");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(1), "0.0");
  assert.equal(result.displayFinalCostTwd, "0");
});

test("missing HEP values stay ready with an exact zero third segment", () => {
  for (const hepTotalJpy of [null, undefined, "", "  "]) {
    const result = requireReady(
      calculateTransportCost({
        estQty: 1,
        exchangeRate: "0.21",
        etcJpy: "0",
        fuelJpy: "0",
        areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
        hepTotalJpy,
      }),
    );

    assert.equal(result.hepPerItemTwd.equals(ExactDecimal.zero()), true);
    assert.equal(result.finalCostPerItem.equals(ExactDecimal.zero()), true);
  }
});

test("present HEP fails closed when total item quantity is missing or invalid", () => {
  for (const totalItemQuantity of [null, undefined, "", 0, -1, 1.5]) {
    assert.deepEqual(
      calculateTransportCost({
        estQty: 1,
        exchangeRate: "0.21",
        etcJpy: "0",
        fuelJpy: "0",
        areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
        hepTotalJpy: "19200",
        totalItemQuantity,
      }),
      {
        status: "pending_confirmation",
        label: PENDING_CONFIRMATION_LABEL,
        reason: "missing_hep_item_quantity",
      },
    );
  }
});

test("HEP is converted per total item and added as a third TWD segment", () => {
  const withoutHep = requireReady(
    calculateTransportCost({
      estQty: 120,
      exchangeRate: "0.21",
      etcJpy: "0",
      fuelJpy: "6270",
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
    }),
  );
  const withHep = requireReady(
    calculateTransportCost({
      estQty: 120,
      exchangeRate: "0.21",
      etcJpy: "0",
      fuelJpy: "6270",
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
      hepTotalJpy: "19200",
      totalItemQuantity: 670,
    }),
  );

  assert.equal(withHep.hepPerItemTwd.toDecimalPlaces(15), "6.017910447761194");
  assert.equal(
    withHep.finalCostPerItem.equals(
      withoutHep.finalCostPerItem.add(withHep.hepPerItemTwd),
    ),
    true,
  );
});

test("manual overrides cannot bypass a missing HEP item quantity", () => {
  assert.deepEqual(
    calculateTransportCost({
      estQty: 1,
      exchangeRate: "0.21",
      etcJpy: "0",
      fuelJpy: "0",
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
      hepTotalJpy: "19200",
      totalItemQuantity: null,
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
      reason: "missing_hep_item_quantity",
    },
  );
});

test("negative HEP keeps the existing non-negative decimal guard", () => {
  assert.throws(
    () =>
      calculateTransportCost({
        estQty: 1,
        exchangeRate: "0.21",
        etcJpy: "0",
        fuelJpy: "0",
        areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
        hepTotalJpy: "-1",
        totalItemQuantity: 1,
      }),
    /hepTotalJpy cannot be negative/,
  );
});

test("manual overrides are explicit and feed only the formulas that reference their field", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 2,
      exchangeRate: "0.2",
      etcJpy: "20",
      fuelJpy: "0",
      areaUnitDomesticTwd: ExactDecimal.from("7"),
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
  assert.equal(result.areaUnitDomesticTwd.toDecimalPlaces(0), "7");
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
      areaUnitDomesticTwd: ExactDecimal.from("5"),
    }),
  );

  assert.equal(result.etcJpy.toDecimalPlaces(0), "20");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(1), "0.3");
  assert.equal(result.transportPerItem.toDecimalPlaces(2), "10.15");
  assert.equal(result.finalCostPerItem.toDecimalPlaces(2), "7.03");
});

test("ETC is the entered route total and is never recalculated from estimated quantity", () => {
  const result = requireReady(
    calculateTransportCost({
      estQty: 160,
      exchangeRate: "0.2",
      etcJpy: "1234",
      fuelJpy: "0",
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
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
      areaUnitDomesticTwd: ZERO_AREA_UNIT_TWD,
    }),
  );

  assert.equal(result.finalCostPerItem.toDecimalPlaces(4), "28.9275");
  assert.equal(result.displayFinalCostTwd, "29");
});
