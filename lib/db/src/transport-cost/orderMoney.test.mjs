import assert from "node:assert/strict";
import test from "node:test";
import { multiplyMoneyByQuantity } from "./orderMoney.ts";

test("money × quantity stays exact for the classic 0.1 × 3 float trap", () => {
  assert.equal(multiplyMoneyByQuantity("0.1", 3), "0.30");
  // The old Number path produced this IEEE-754 artefact instead of the money value.
  assert.notEqual(multiplyMoneyByQuantity("0.1", 3), "0.30000000000000004");
});

test("money × quantity preserves two-decimal order totals", () => {
  assert.equal(multiplyMoneyByQuantity("19.99", 3), "59.97");
});
