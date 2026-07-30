import assert from "node:assert/strict";
import test from "node:test";

import { formatShippingFeeLabel, getShippingFee } from "./index.ts";

test("API writes and UI labels share the approved pickup fees", () => {
  assert.equal(getShippingFee("7-11 取貨（先付款）"), 60);
  assert.equal(getShippingFee("黑貓宅急便"), 100);
  assert.equal(getShippingFee("郵局宅配"), 80);
  assert.equal(getShippingFee("自取"), 0);
  assert.equal(formatShippingFeeLabel("黑貓宅急便"), "+ NT$100");
  assert.equal(formatShippingFeeLabel("自取"), "免運");
});

test("every supported pickup method keeps its canonical fee", () => {
  const expectedFees = new Map([
    ["面交", 0],
    ["自取", 0],
    ["其他", 0],
    ["7-11 貨到付款", 60],
    ["7-11 取貨（先付款）", 60],
    ["全家貨到付款", 60],
    ["全家取貨（先付款）", 60],
    ["黑貓宅急便", 100],
    ["郵局", 80],
    ["郵局宅配", 80],
    ["宅配", 100],
    ["OK Mart", 60],
    ["萊爾富物流", 60],
  ]);

  for (const [pickupMethod, expectedFee] of expectedFees) {
    assert.equal(getShippingFee(pickupMethod), expectedFee, pickupMethod);
  }
});

test("unknown and null pickup methods fail to the existing free-shipping default", () => {
  assert.equal(getShippingFee("不存在的物流"), 0);
  assert.equal(getShippingFee(null), 0);
  assert.equal(formatShippingFeeLabel("不存在的物流"), "免運");
  assert.equal(formatShippingFeeLabel(null), "免運");
});
