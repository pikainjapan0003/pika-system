import assert from "node:assert/strict";
import test from "node:test";

import { formatProductEstimatedProfit } from "./productEstimatedProfit.ts";

test("ready estimates expose only the exact display value and exemption status", () => {
  const result = formatProductEstimatedProfit({
    status: "ready",
    transportStatus: "exempt",
    label: "免攤",
    displayUnitProfitTwd: "220",
  });

  assert.deepEqual(result, {
    status: "ready",
    transportStatus: "exempt",
    unitProfitTwd: "220",
  });
});

test("pending estimates stay explicitly pending instead of becoming zero", () => {
  const result = formatProductEstimatedProfit({
    status: "pending_confirmation",
    label: "待確認",
    reason: "missing_product_cost_jpy",
  });

  assert.deepEqual(result, {
    status: "pending_confirmation",
    label: "待確認",
    reason: "missing_product_cost_jpy",
  });
  assert.equal("unitProfitTwd" in result, false);
});
