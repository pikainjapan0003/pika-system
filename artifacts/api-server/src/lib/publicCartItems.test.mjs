import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_CART_ITEM_RESPONSE_KEYS,
  sanitizePublicCartItems,
} from "./publicCartItems.ts";

const storedCartItem = {
  productId: 17,
  shareToken: "public-product-token",
  productName: "假資料商品",
  productImageUrl: "https://example.invalid/fake.png",
  specValues: { size: "M" },
  quantity: 2,
  unitPrice: 800,
  subtotal: 1600,
  profitSnapshot: {
    profitSnapshotCostJpy: "2970.000000000000",
    profitSnapshotExchangeRate: "0.199000000000",
    profitSnapshotUnitProfitTwd: "186.553346500000",
  },
  unapprovedFutureInternalField: "must not become public",
};

test("public cart item allowlist strips nested profit snapshots and unknown fields", () => {
  const result = sanitizePublicCartItems([storedCartItem]);

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.deepEqual(
    Object.keys(result[0]).sort(),
    [...PUBLIC_CART_ITEM_RESPONSE_KEYS].sort(),
  );
  assert.equal(Object.hasOwn(result[0], "profitSnapshot"), false);
  assert.equal(Object.hasOwn(result[0], "shareToken"), false);
  assert.equal(
    Object.hasOwn(result[0], "unapprovedFutureInternalField"),
    false,
  );
});

test("public cart item sanitizer drops null and malformed elements fail-closed", () => {
  const result = sanitizePublicCartItems([
    null,
    "not-an-item",
    { ...storedCartItem, quantity: 0 },
    { ...storedCartItem, specValues: { size: { internal: true } } },
    storedCartItem,
  ]);

  assert.equal(result?.length, 1);
  assert.deepEqual(
    Object.keys(result[0]).sort(),
    [...PUBLIC_CART_ITEM_RESPONSE_KEYS].sort(),
  );
  assert.equal(sanitizePublicCartItems({ items: [storedCartItem] }), null);
  assert.equal(sanitizePublicCartItems(null), null);
});
