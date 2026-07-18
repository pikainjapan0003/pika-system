import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrderDisplayTotal } from "./orderDisplayTotal.ts";

test("display total prefers the backend orderTotal when it is present", () => {
  assert.equal(
    resolveOrderDisplayTotal({
      orderTotal: "250",
      totalPrice: "200",
      shippingFee: "20",
    }),
    250,
  );
});

test("display total uses the existing subtotal plus shipping fallback", () => {
  assert.equal(
    resolveOrderDisplayTotal({ totalPrice: "200", shippingFee: "20" }),
    220,
  );
});

test("display total treats a missing display-only shipping fee as zero", () => {
  assert.equal(
    resolveOrderDisplayTotal({ totalPrice: "200", shippingFee: null }),
    200,
  );
});
