import assert from "node:assert/strict";
import test from "node:test";

import { calculateMoneyPreview } from "./moneyPreview.ts";

test("decimal multiplication does not accumulate IEEE-754 preview error", () => {
  const result = calculateMoneyPreview({
    lines: [{ unitPrice: "0.1", quantity: 3 }],
  });

  assert.equal(result.itemSubtotal, "0.3");
  assert.equal(result.orderTotal, "0.3");
});

test("cart lines and shipping are accumulated exactly before display", () => {
  const result = calculateMoneyPreview({
    lines: [
      { unitPrice: "10.25", quantity: 2 },
      { unitPrice: "0.1", quantity: 3 },
    ],
    shippingFee: "5.2",
  });

  assert.equal(result.itemSubtotal, "20.8");
  assert.equal(result.shippingFee, "5.2");
  assert.equal(result.orderTotal, "26");
});

test("edit preview subtracts discount and paid amount without changing writes", () => {
  const result = calculateMoneyPreview({
    lines: [{ unitPrice: "100", quantity: 2 }],
    shippingFee: "20",
    discountAmount: "30",
    paidAmount: "50",
  });

  assert.equal(result.orderTotal, "190");
  assert.equal(result.remainingAmount, "140");
  assert.equal(result.hasDiscount, true);
  assert.equal(result.discountExceedsGross, false);
});

test("preview totals clamp at zero and detect an excessive discount", () => {
  const result = calculateMoneyPreview({
    lines: [{ unitPrice: "28.5", quantity: 1 }],
    discountAmount: "29",
    paidAmount: "100",
  });

  assert.equal(result.orderTotal, "0");
  assert.equal(result.remainingAmount, "0");
  assert.equal(result.discountExceedsGross, true);
});
