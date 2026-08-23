import assert from "node:assert/strict";
import test from "node:test";

import { calculateBreakevenSensitivity } from "./breakevenSensitivity.ts";

const BASE_INPUT = {
  fixedCostTotalTwd: "20000",
  variableCostBaseTotalTwd: "5000",
  creditCardRebateTwd: "500",
  unitGrossProfitTwd: "130",
  salaryTargetTwd: "7500",
};

test("sensitivity matrix inverts the existing breakeven identity exactly", () => {
  const result = calculateBreakevenSensitivity({
    ...BASE_INPUT,
    quantities: ["90", "100", "200"],
    unitGrossProfits: ["40", "60", "150"],
  });

  assert.equal(result.status, "ready");
  // netCostToRecover = 25000 + 375 payment fee - 500 rebate = 24875
  assert.equal(result.netCostToRecoverTwd.toDecimalPlaces(2), "24875.00");
  assert.equal(result.breakevenQuantity, 192n);
  assert.equal(result.salaryTargetQuantity, 250n);
  assert.deepEqual(result.rows, ["90", "100", "200"]);
  assert.deepEqual(result.columns, ["40", "60", "150"]);
  assert.deepEqual(result.cells, [
    ["-21275.000000000000", "-19475.000000000000", "-11375.000000000000"],
    ["-20875.000000000000", "-18875.000000000000", "-9875.000000000000"],
    ["-16875.000000000000", "-12875.000000000000", "5125.000000000000"],
  ]);
});

test("sensitivity matrix supports the split fixed-cost input shape", () => {
  const result = calculateBreakevenSensitivity({
    fixedCostJpyOriginTwd: "2000",
    fixedCostTwdDirectTwd: "3000",
    variableCostBaseTotalTwd: "5000",
    creditCardRebateTwd: "500",
    unitGrossProfitTwd: "130",
    salaryTargetTwd: "7500",
    quantities: ["90"],
    unitGrossProfits: ["40"],
  });

  assert.equal(result.status, "ready");
  // feeBase = 2000 + 5000; payment fee 105; costBase = 7000 + 3000; net = 10000 + 105 - 500
  assert.equal(result.netCostToRecoverTwd.toDecimalPlaces(2), "9605.00");
  assert.deepEqual(result.cells, [["-6005.000000000000"]]);
});

test("sensitivity matrix keeps fractional column entries exact", () => {
  const result = calculateBreakevenSensitivity({
    ...BASE_INPUT,
    quantities: ["10"],
    unitGrossProfits: ["130.5"],
  });

  assert.equal(result.status, "ready");
  // 10 * 130.5 - 24875 = -23570
  assert.deepEqual(result.cells, [["-23570.000000000000"]]);
});

test("missing breakeven inputs fail closed through calculateBreakeven", () => {
  const result = calculateBreakevenSensitivity({
    fixedCostTotalTwd: "20000",
    quantities: ["90"],
    unitGrossProfits: ["40"],
  });

  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.label, "待確認");
  assert.equal(result.reason, "缺少損益平衡資料");
});

test("zero or oversized sweep axes fail closed", () => {
  const empty = calculateBreakevenSensitivity({
    ...BASE_INPUT,
    quantities: [],
    unitGrossProfits: ["40"],
  });
  assert.equal(empty.status, "pending_confirmation");
  assert.equal(empty.reason, "缺少敏感度矩陣範圍");

  const oversized = calculateBreakevenSensitivity({
    ...BASE_INPUT,
    quantities: Array.from({ length: 21 }, (_, index) => String(index + 1)),
    unitGrossProfits: ["40"],
  });
  assert.equal(oversized.status, "pending_confirmation");
  assert.equal(oversized.reason, "缺少敏感度矩陣範圍");
});

test("malformed sweep values are rejected, never rounded", () => {
  assert.throws(
    () =>
      calculateBreakevenSensitivity({
        ...BASE_INPUT,
        quantities: ["90", "abc"],
        unitGrossProfits: ["40"],
      }),
    /positive integer/,
  );
  assert.throws(
    () =>
      calculateBreakevenSensitivity({
        ...BASE_INPUT,
        quantities: ["90"],
        unitGrossProfits: ["40.5.5"],
      }),
    /non-negative decimal/,
  );
  assert.throws(
    () =>
      calculateBreakevenSensitivity({
        ...BASE_INPUT,
        quantities: ["0"],
        unitGrossProfits: ["40"],
      }),
    /positive integer/,
  );
});
