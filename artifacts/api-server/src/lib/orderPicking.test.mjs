import assert from "node:assert/strict";
import test from "node:test";

import { buildOrderPickingItems, isPickingReadOnly } from "./orderPicking.ts";

const base = {
  id: 11,
  productId: 7,
  productName: "假商品",
  specValues: { color: "粉", size: "M" },
  quantity: 2,
  items: null,
  status: "preparing",
  shippingStatus: "preparing",
};

test("single-order item keys are stable across spec key order", () => {
  const first = buildOrderPickingItems(base)[0];
  const second = buildOrderPickingItems({
    ...base,
    specValues: { size: "M", color: "粉" },
  })[0];
  assert.equal(first.itemKey, second.itemKey);
  assert.equal(first.quantity, 2);
});

test("cart items receive distinct stable snapshot keys", () => {
  const items = buildOrderPickingItems({
    ...base,
    items: [
      {
        productId: 7,
        productName: "假商品",
        quantity: 1,
        specValues: {},
      },
      {
        productId: 7,
        productName: "假商品",
        quantity: 1,
        specValues: {},
      },
    ],
  });
  assert.equal(items.length, 2);
  assert.notEqual(items[0].itemKey, items[1].itemKey);
});

test("shipped or completed orders are read-only", () => {
  assert.equal(isPickingReadOnly({ ...base, shippingStatus: "shipped" }), true);
  assert.equal(isPickingReadOnly({ ...base, status: "completed" }), true);
  assert.equal(isPickingReadOnly(base), false);
});
