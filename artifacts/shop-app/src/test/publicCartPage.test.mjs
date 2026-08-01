import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

let cart = [];
let shippingFee = 0;

const item = {
  itemKey: "demo-item",
  shareToken: "demo-share-token",
  productId: 1,
  productName: "Demo cart item",
  productImageUrl: null,
  unitPrice: 100,
  quantity: 2,
  specValues: {},
};

mock.module("@/lib/cartStorage", {
  namedExports: {
    getCart: () => cart,
    updateCartQty: (itemKey, quantity) => {
      cart = cart.map((entry) =>
        entry.itemKey === itemKey ? { ...entry, quantity } : entry,
      );
      return cart;
    },
    removeFromCart: (itemKey) => {
      cart = cart.filter((entry) => entry.itemKey !== itemKey);
      return cart;
    },
    clearCart: () => {
      cart = [];
    },
    cartTotalQty: (items) =>
      items.reduce((sum, entry) => sum + entry.quantity, 0),
  },
});
mock.module("@/lib/cvs711", {
  namedExports: {
    isStorePickupMethod: () => false,
    isFamilyMartMethod: () => false,
    isSevenElevenMethod: () => false,
    getPickupProvider: () => "seven",
    getShippingFee: () => shippingFee,
    openCvsStoreMap: () => undefined,
    loadCvsStore: () => null,
    clearCvsStore: () => undefined,
  },
});
mock.module("@/lib/taiwanZipcodes", {
  namedExports: { TAIWAN_ZIPCODE_REGIONS: [], getDistricts: () => [] },
});
mock.module("@/components/RecipientAddressFields", {
  namedExports: { RecipientAddressFields: () => null },
});
mock.module("@/lib/brandColor", {
  namedExports: {
    applyBrandColor: () => undefined,
    DEFAULT_BRAND_PRIMARY_COLOR: "#ff6666",
  },
});
mock.module("@/lib/actionableError", {
  namedExports: { formatActionableError: ({ reason }) => reason },
});

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { formatShippingFeeLabel } = await import("@workspace/shipping");
const { default: PublicCartPage } = await import("../pages/PublicCart.tsx");

afterEach(() => {
  cleanup();
  cart = [];
  shippingFee = 0;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("cart item and total render from the stored item quantity", async () => {
  cart = [item];
  const view = render(React.createElement(PublicCartPage));

  await waitFor(() =>
    assert.match(view.container.textContent, /Demo cart item/),
  );
  assert.match(view.container.textContent, /NT\$ 200/);
  assert.match(view.container.textContent, /2/);
});

test("pickup choices show the canonical free-shipping label when fee is zero", async () => {
  cart = [item];
  shippingFee = 0;
  const view = render(React.createElement(PublicCartPage));

  await waitFor(() =>
    assert.match(view.container.textContent, /Demo cart item/),
  );
  const freeLabel = formatShippingFeeLabel("any-method");
  assert.ok(
    [...view.container.querySelectorAll("button")].some((button) =>
      button.textContent?.includes(freeLabel),
    ),
  );
});

test("an empty cart does not render the checkout form", async () => {
  cart = [];
  const view = render(React.createElement(PublicCartPage));

  await waitFor(() => assert.ok(view.container.textContent));
  assert.equal(view.container.querySelector("form"), null);
  assert.doesNotMatch(view.container.textContent, /Demo cart item/);
});
