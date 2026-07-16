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
