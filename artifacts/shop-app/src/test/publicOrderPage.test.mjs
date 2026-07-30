import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

let product;
const submitCalls = [];

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetPublicProduct: () => ({
      data: product,
      error: null,
      isLoading: false,
    }),
    useSubmitOrder: () => ({
      isPending: false,
      mutateAsync: async (input) => {
        submitCalls.push(input);
        return {};
      },
    }),
  },
});

mock.module("@/components/RecipientAddressFields", {
  namedExports: {
    RecipientAddressFields: () => null,
  },
});

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { default: PublicOrderPage } = await import("../pages/PublicOrder.tsx");

function makeProduct(overrides = {}) {
  return {
    id: 1,
    storeId: 1,
    storeName: "假店鋪",
    name: "小數商品",
    description: "測試用假資料",
    price: "0.1",
    imageUrl: null,
    inventory: 10,
    specs: [],
    orderDeadlineAt: null,
    brandPrimaryColor: "#ff6666",
    shippingCvsEnabled: true,
    shippingBlackCatEnabled: true,
    shippingPostOfficeEnabled: true,
    shippingSelfPickupEnabled: true,
    storageTemp: null,
    shelfLife: null,
    weightKg: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  submitCalls.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function renderPage() {
  return render(
    React.createElement(PublicOrderPage, { shareToken: "fake-share-token" }),
  );
}

test("money summary keeps exact 0.1 times 3 without float noise", () => {
  product = makeProduct();
  const view = renderPage();
  fireEvent.click(view.getByRole("button", { name: "+" }));
  fireEvent.click(view.getByRole("button", { name: "+" }));
  fireEvent.click(view.getByRole("button", { name: /面交/ }));

  assert.match(view.container.textContent, /商品小計NT\$ 0\.3/);
  assert.match(view.container.textContent, /訂單總額NT\$ 0\.3/);
  assert.doesNotMatch(view.container.textContent, /0\.30000000000000004/);
});

test("zero shipping is labelled free instead of an unmarked zero", () => {
  product = makeProduct();
  const view = renderPage();
  fireEvent.click(view.getByRole("button", { name: /面交/ }));

  assert.match(view.container.textContent, /運費免費/);
});

test("closed product disables submission and shows the closed label", () => {
  product = makeProduct({ orderDeadlineAt: "2020-01-01T00:00:00.000Z" });
  const view = renderPage();
  const submitButton = view.getByRole("button", { name: "已截止收單" });

  assert.equal(submitButton.disabled, true);
  fireEvent.click(submitButton);
  assert.equal(submitCalls.length, 0);
});
