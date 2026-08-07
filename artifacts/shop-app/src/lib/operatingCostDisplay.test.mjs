import assert from "node:assert/strict";
import test from "node:test";

import { formatApiTwd, formatConvertedAmount } from "./operatingCostDisplay.ts";

test("TWD conversion validates input and adds grouping", () => {
  assert.equal(formatConvertedAmount("12345.6", "TWD", ""), "NT$12,345.6");
  assert.equal(formatConvertedAmount("abc", "TWD", "0.205"), "待確認");
  assert.equal(formatConvertedAmount("-1", "TWD", "0.205"), "待確認");
});

test("JPY conversion fails closed without rate and keeps two decimals", () => {
  assert.equal(
    formatConvertedAmount("63943", "JPY", "0.205"),
    "≈ NT$13,108.32",
  );
  assert.equal(formatConvertedAmount("63943", "JPY", ""), "待確認");
  assert.equal(formatConvertedAmount("63943", "JPY", "-0.1"), "待確認");
});

test("API money display preserves negative profit instead of clamping", () => {
  assert.equal(formatApiTwd("33791.4894"), "NT$33,791.49");
  assert.equal(formatApiTwd("-120.679921"), "NT$-120.68");
  assert.equal(formatApiTwd(null), "待確認");
});
