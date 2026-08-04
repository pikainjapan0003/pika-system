import assert from "node:assert/strict";
import test from "node:test";

import { calculateHepCost } from "./hepCost.ts";

test("HEP Sheet sample remains exact until four-decimal display", () => {
  const result = calculateHepCost({
    hepTotalJpy: "19200",
    totalItemQuantity: 670,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.unitHepCostTwd.toFractionString(), "2016/335");
  assert.equal(result.unitHepCostTwd.toDecimalPlaces(4), "6.0179");
});

test("zero item quantity is pending with the approved reason", () => {
  assert.deepEqual(
    calculateHepCost({
      hepTotalJpy: "19200",
      totalItemQuantity: 0,
      exchangeRate: "0.21",
    }),
    {
      status: "pending_confirmation",
      label: "待確認",
      reason: "缺少商品件數",
    },
  );
});

test("null item quantity is pending instead of dividing by zero", () => {
  const result = calculateHepCost({
    hepTotalJpy: "19200",
    totalItemQuantity: null,
    exchangeRate: "0.21",
  });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "缺少商品件數");
});

test("missing HEP total or exchange rate fails closed", () => {
  assert.equal(
    calculateHepCost({ totalItemQuantity: 10, exchangeRate: "0.21" }).reason,
    "缺少 HEP 總額",
  );
  assert.equal(
    calculateHepCost({ hepTotalJpy: "7700", totalItemQuantity: 10 }).reason,
    "缺少行程匯率",
  );
});

test("negative HEP total is rejected", () => {
  assert.throws(
    () =>
      calculateHepCost({
        hepTotalJpy: "-1",
        totalItemQuantity: 10,
        exchangeRate: "0.21",
      }),
    /hepTotalJpy cannot be negative/,
  );
});
