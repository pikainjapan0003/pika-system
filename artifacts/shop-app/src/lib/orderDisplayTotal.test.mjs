import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveOrderDisplayTotal,
  resolveOrderGrossTotal,
} from "./orderDisplayTotal.ts";

test("display total prefers the frozen payable after store credit", () => {
  assert.equal(
    resolveOrderDisplayTotal({
      payableAfterCredit: "0.000000000000",
      orderTotal: "100",
    }),
    "0",
  );
});

test("display total prefers the backend orderTotal when it is present", () => {
  assert.equal(
    resolveOrderDisplayTotal({
      orderTotal: "250",
      totalPrice: "200",
      shippingFee: "20",
    }),
    "250",
  );
});

test("display total uses the existing subtotal plus shipping fallback", () => {
  assert.equal(
    resolveOrderDisplayTotal({ totalPrice: "200", shippingFee: "20" }),
    "220",
  );
});

test("display total treats a missing display-only shipping fee as zero", () => {
  assert.equal(
    resolveOrderDisplayTotal({ totalPrice: "200", shippingFee: null }),
    "200",
  );
});

test("gross list statistics do not perform arithmetic on exact credit fields", () => {
  assert.equal(
    resolveOrderGrossTotal({
      payableAfterCredit: "0.100000000000",
      orderTotal: "250",
    }),
    250,
  );
});
