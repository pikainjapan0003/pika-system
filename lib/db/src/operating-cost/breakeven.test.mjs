import assert from "node:assert/strict";
import test from "node:test";

import { calculateBreakeven } from "./breakeven.ts";

const BASE_INPUT = {
  fixedCostTotalTwd: "20000",
  variableCostBaseTotalTwd: "5000",
  creditCardRebateTwd: "500",
  unitGrossProfitTwd: "130",
  salaryTargetTwd: "7500",
};

const REBATE_EXCEEDS_COST_INPUT = {
  fixedCostTotalTwd: "0",
  variableCostBaseTotalTwd: "0",
  creditCardRebateTwd: "500",
  unitGrossProfitTwd: "130",
  salaryTargetTwd: "0",
};

test("breakeven quantities ceil the approved formula", () => {
  const result = calculateBreakeven(BASE_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "375.00");
  assert.equal(result.netCostToRecoverTwd.toDecimalPlaces(2), "24875.00");
  assert.equal(result.breakevenQuantity, 192n);
  assert.equal(result.salaryTargetQuantity, 250n);
  assert.equal(
    result.conclusion,
    "以單件毛利 130.00 元計，至少需賣 192 件回本；達日薪目標需 250 件。",
  );
});

test("rebate above all costs clamps both quantities to zero", () => {
  const result = calculateBreakeven(REBATE_EXCEEDS_COST_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.breakevenQuantity, 0n);
  assert.equal(result.salaryTargetQuantity, 0n);
});

test("zero-quantity conclusion never prints a negative item count", () => {
  const result = calculateBreakeven(REBATE_EXCEEDS_COST_INPUT);

  assert.equal(result.status, "ready");
  assert.equal(result.conclusion.includes("-"), false);
  assert.match(result.conclusion, /至少需賣 0 件回本；達日薪目標需 0 件/);
});

test("conclusion preserves two decimal places for unit gross profit", () => {
  const result = calculateBreakeven({
    ...BASE_INPUT,
    unitGrossProfitTwd: "130.6",
  });

  assert.equal(result.status, "ready");
  assert.match(result.conclusion, /單件毛利 130\.60 元/);
  assert.doesNotMatch(result.conclusion, /單件毛利 131 元/);
});

test("exact division does not add an unnecessary extra item", () => {
  const result = calculateBreakeven({
    fixedCostTotalTwd: "985",
    variableCostBaseTotalTwd: "0",
    creditCardRebateTwd: "0",
    unitGrossProfitTwd: "100",
    salaryTargetTwd: "500",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.paymentFeeTwd.toDecimalPlaces(2), "14.78");
  assert.equal(result.breakevenQuantity, 10n);
  assert.equal(result.salaryTargetQuantity, 15n);
});

test("rebate reduces both required quantities", () => {
  const withoutRebate = calculateBreakeven({
    ...BASE_INPUT,
    creditCardRebateTwd: "0",
  });
  const withRebate = calculateBreakeven(BASE_INPUT);

  assert.equal(withoutRebate.status, "ready");
  assert.equal(withRebate.status, "ready");
  assert.equal(withoutRebate.breakevenQuantity, 196n);
  assert.equal(withRebate.breakevenQuantity, 192n);
});

test("zero unit gross profit fails closed", () => {
  const result = calculateBreakeven({ ...BASE_INPUT, unitGrossProfitTwd: "0" });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "單件毛利必須大於 0");
});

test("negative unit gross profit also fails closed", () => {
  const result = calculateBreakeven({
    ...BASE_INPUT,
    unitGrossProfitTwd: "-0.01",
  });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.reason, "單件毛利必須大於 0");
});

test("missing input is pending and negative costs are rejected", () => {
  assert.equal(
    calculateBreakeven({ ...BASE_INPUT, salaryTargetTwd: null }).reason,
    "缺少損益平衡資料",
  );
  assert.throws(
    () => calculateBreakeven({ ...BASE_INPUT, fixedCostTotalTwd: "-1" }),
    /fixedCostTotalTwd cannot be negative/,
  );
});
