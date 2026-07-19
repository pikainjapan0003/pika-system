import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalFetch = globalThis.fetch;
const originalReact = globalThis.React;
globalThis.React = React;

const order = {
  publicToken: "fake-public-token",
  productName: "假商品",
  quantity: 1,
  unitPrice: 100,
  totalPrice: 100,
  orderTotal: 100,
  specValues: {},
  status: "awaiting_payment",
  statusLabel: "待付款",
  pickupMethod: "self_pickup",
  createdAt: "2026-07-19T09:00:00.000Z",
  paymentLast5: null,
};

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetPublicOrder: () => ({ data: order, isLoading: false, error: null }),
  },
});

mock.module("wouter", {
  namedExports: {
    useLocation: () => ["/track/fake-public-token", () => undefined],
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { default: TrackOrderPage } = await import("../pages/TrackOrder.tsx");

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function renderPage() {
  return render(
    React.createElement(TrackOrderPage, { publicToken: "fake-public-token" }),
  );
}

test("a rejected last-five update displays the validation message", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({
      error: "paymentLast5 must contain exactly five digits",
    }),
  });
  const view = renderPage();
  const input = view.container.querySelector('input[pattern="[0-9]{5}"]');
  assert.ok(input);
  fireEvent.change(input, { target: { value: "12345" } });
  const save = [...view.container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("儲存付款末五碼"),
  );
  assert.ok(save);
  fireEvent.click(save);

  await waitFor(() =>
    assert.match(
      view.container.textContent,
      /paymentLast5 must contain exactly five digits/,
    ),
  );
});

test("a successful update displays the returned last-five value", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ paymentLast5: "54321" }),
  });
  const view = renderPage();
  const input = view.container.querySelector('input[pattern="[0-9]{5}"]');
  assert.ok(input);
  fireEvent.change(input, { target: { value: "12345" } });
  const save = [...view.container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("儲存付款末五碼"),
  );
  assert.ok(save);
  fireEvent.click(save);

  await waitFor(() => assert.equal(input.value, "54321"));
});
