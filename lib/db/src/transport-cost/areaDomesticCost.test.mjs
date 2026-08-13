import assert from "node:assert/strict";
import test from "node:test";

import { ExactDecimal } from "./index.ts";
import { calculateAreaDomesticCost } from "./areaDomesticCost.ts";

test("Sheet 26.03 Tokyo area domestic cost matches E77, H77 and I77", () => {
  const result = calculateAreaDomesticCost({
    cardboardUnitJpy: "340",
    shippingUnitJpy: "2310",
    parcelCount: 3,
    estimatedItemQuantity: 465,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("39.75")), true);
  assert.equal(result.totalTwd.equals(ExactDecimal.from("1694.5425")), true);
  assert.equal(result.unitDomesticTwd.toFractionString(), "225939/62000");
  assert.equal(result.unitDomesticTwd.toDecimalPlaces(15), "3.644177419354839");
});

test("Sheet 26.03 Hokkaido area domestic cost matches E78, H78 and I78", () => {
  const result = calculateAreaDomesticCost({
    cardboardUnitJpy: "340",
    shippingUnitJpy: "3068",
    parcelCount: 3,
    estimatedItemQuantity: 605,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("51.12")), true);
  assert.equal(result.totalTwd.equals(ExactDecimal.from("2179.2456")), true);
  assert.equal(result.unitDomesticTwd.toFractionString(), "2724057/756250");
  assert.equal(result.unitDomesticTwd.toDecimalPlaces(15), "3.602058842975207");
});

test("Sheet 26.03 Shikoku area domestic cost matches E79, H79 and I79", () => {
  const result = calculateAreaDomesticCost({
    cardboardUnitJpy: "340",
    shippingUnitJpy: "2190",
    parcelCount: 3,
    estimatedItemQuantity: 600,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.fee1_5Pct.equals(ExactDecimal.from("37.95")), true);
  assert.equal(result.totalTwd.equals(ExactDecimal.from("1617.8085")), true);
  assert.equal(result.unitDomesticTwd.toFractionString(), "1078539/400000");
  assert.equal(
    result.unitDomesticTwd.equals(ExactDecimal.from("2.6963475")),
    true,
  );
});

test("missing, zero or negative estimated quantity fails closed", () => {
  for (const estimatedItemQuantity of [
    undefined,
    null,
    "",
    0,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.deepEqual(
      calculateAreaDomesticCost({
        cardboardUnitJpy: "340",
        shippingUnitJpy: "2310",
        parcelCount: 3,
        estimatedItemQuantity,
        exchangeRate: "0.21",
      }),
      {
        status: "pending_confirmation",
        label: "待確認",
        reason: "missing_estimated_item_quantity",
      },
    );
  }
});

test("missing exchange rate fails closed", () => {
  for (const exchangeRate of [undefined, null, "", "  "]) {
    const result = calculateAreaDomesticCost({
      cardboardUnitJpy: "340",
      shippingUnitJpy: "2310",
      parcelCount: 3,
      estimatedItemQuantity: 465,
      exchangeRate,
    });

    assert.equal(result.status, "pending_confirmation");
    assert.equal(result.reason, "missing_exchange_rate");
  }
});

test("zero parcels is a ready zero cost", () => {
  const result = calculateAreaDomesticCost({
    cardboardUnitJpy: "340",
    shippingUnitJpy: "2310",
    parcelCount: 0,
    estimatedItemQuantity: 465,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.fee1_5Pct.toDecimalPlaces(2), "39.75");
  assert.equal(result.totalTwd.equals(ExactDecimal.zero()), true);
  assert.equal(result.unitDomesticTwd.equals(ExactDecimal.zero()), true);
});

test("negative monetary values and parcel count are rejected", () => {
  const complete = {
    cardboardUnitJpy: "340",
    shippingUnitJpy: "2310",
    parcelCount: 3,
    estimatedItemQuantity: 465,
    exchangeRate: "0.21",
  };

  assert.throws(
    () => calculateAreaDomesticCost({ ...complete, cardboardUnitJpy: "-1" }),
    /cardboardUnitJpy cannot be negative/,
  );
  assert.throws(
    () => calculateAreaDomesticCost({ ...complete, shippingUnitJpy: "-1" }),
    /shippingUnitJpy cannot be negative/,
  );
  assert.throws(
    () => calculateAreaDomesticCost({ ...complete, parcelCount: -1 }),
    /parcelCount cannot be negative/,
  );
  assert.throws(
    () =>
      calculateAreaDomesticCost({
        ...complete,
        parcelCount: Number.MAX_SAFE_INTEGER + 1,
      }),
    /parcelCount requires an integer value/,
  );
  assert.throws(
    () => calculateAreaDomesticCost({ ...complete, exchangeRate: "-0.01" }),
    /exchangeRate cannot be negative/,
  );
});
