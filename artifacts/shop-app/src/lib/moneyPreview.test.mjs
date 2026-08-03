import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMoneyPreview,
  formatMoneyForDisplay,
  hasPositiveMoney,
} from "./moneyPreview.ts";

test("API decimal strings are formatted for display without number coercion", () => {
  assert.equal(formatMoneyForDisplay("5000.000000000000"), "5,000");
  assert.equal(formatMoneyForDisplay("0.100000000000"), "0.1");
  assert.equal(
    formatMoneyForDisplay("999999999999.990000000000"),
    "999,999,999,999.99",
  );
  assert.equal(hasPositiveMoney("0.000000000000"), false);
  assert.equal(hasPositiveMoney("0.000000000001"), true);
});

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

test("unsafe, zero, and negative quantities contribute zero", () => {
  for (const quantity of [Number.MAX_SAFE_INTEGER + 1, 0, -1]) {
    const result = calculateMoneyPreview({
      lines: [{ unitPrice: "99.5", quantity }],
    });

    assert.equal(result.itemSubtotal, "0");
    assert.equal(result.orderTotal, "0");
  }
});

test("garbage money fails closed while surrounding whitespace is accepted", () => {
  const garbage = calculateMoneyPreview({
    lines: [{ unitPrice: "not-money", quantity: 3 }],
  });
  const whitespace = calculateMoneyPreview({
    lines: [{ unitPrice: " 0.1 ", quantity: 3 }],
  });

  assert.equal(garbage.unitPrice, "0");
  assert.equal(garbage.itemSubtotal, "0");
  assert.equal(whitespace.unitPrice, "0.1");
  assert.equal(whitespace.itemSubtotal, "0.3");
});

test("multiple lines intentionally expose no single unit price", () => {
  const result = calculateMoneyPreview({
    lines: [
      { unitPrice: "10", quantity: 1 },
      { unitPrice: "20", quantity: 1 },
    ],
  });

  assert.equal(result.unitPrice, "0");
  assert.equal(result.itemSubtotal, "30");
});
