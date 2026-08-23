import assert from "node:assert/strict";
import test from "node:test";

import {
  decimalStringAtMost,
  formatApiTwd,
  formatConvertedAmount,
  trimAmountForDisplay,
} from "./operatingCostDisplay.ts";

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

test("trimAmountForDisplay strips insignificant trailing zeros on the display layer", () => {
  assert.equal(trimAmountForDisplay("0.000000000000"), "0");
  assert.equal(trimAmountForDisplay("6000.000000000000"), "6000");
  assert.equal(
    trimAmountForDisplay("120000000000000.0000000"),
    "120000000000000",
  );
  assert.equal(trimAmountForDisplay("123.450000"), "123.45");
  assert.equal(trimAmountForDisplay("0.10"), "0.1");
  assert.equal(trimAmountForDisplay("6000."), "6000.");
  assert.equal(trimAmountForDisplay("6000.05"), "6000.05");
  assert.equal(trimAmountForDisplay(""), "");
  assert.equal(trimAmountForDisplay("720"), "720");
  assert.equal(trimAmountForDisplay("-1.5000"), "-1.5");
});

test("decimalStringAtMost compares decimal strings without Number coercion", () => {
  // 污染案例（O-2）：15 位整數必超單筆金額上限 100000000
  assert.equal(
    decimalStringAtMost("120000000000000.0000000", "100000000"),
    false,
  );
  assert.equal(decimalStringAtMost("99999999.9999", "100000000"), true);
  assert.equal(decimalStringAtMost("100000000", "100000000"), true);
  assert.equal(decimalStringAtMost("100000001", "100000000"), false);
  assert.equal(decimalStringAtMost("0.000000000000", "100000000"), true);
  // 件數：720 與 100000
  assert.equal(decimalStringAtMost("720", "100000"), true);
  assert.equal(decimalStringAtMost("100001", "100000"), false);
  // 前導零：打字殘留 "0720" 等同 720
  assert.equal(decimalStringAtMost("0720", "100000"), true);
  // 空串與不合文法：不攔截（交由後端 400）
  assert.equal(decimalStringAtMost("", "100000"), true);
  assert.equal(decimalStringAtMost("12a", "100000"), true);
});
