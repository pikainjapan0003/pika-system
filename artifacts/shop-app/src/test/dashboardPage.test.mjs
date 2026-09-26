import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
globalThis.React = React;

let orders = [];
let products = [];
const getToken = async () => "fake-token";

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken }),
    useClerk: () => ({ signOut: () => undefined }),
  },
});
mock.module("wouter", {
  namedExports: { useLocation: () => ["/dashboard", () => undefined] },
});
mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetMyStore: () => ({
      data: { id: 1, name: "測試店鋪", description: "測試說明" },
    }),
    useGetStoreStats: () => ({
      data: {
        totalOrders: orders.length,
        pendingOrders: orders.filter((order) => order.status === "pending")
          .length,
        totalRevenue: 500,
        statusBreakdown: [],
      },
    }),
    useListOrders: () => ({ data: orders }),
    useListProducts: () => ({ data: products }),
  },
});

const { cleanup, render, waitFor } =
  await import("@testing-library/react");
const { default: DashboardPage } = await import("../pages/Dashboard.tsx");

function installFetch() {
  globalThis.fetch = async (url) => {
    if (String(url).includes("/profit-summary")) {
      return {
        ok: true,
        json: async () => ({
          capturedProfitSubtotalDisplayTwd: "220",
          pendingOrderCount: 0,
          missingSnapshotOrderCount: 0,
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, items: [] }) };
  };
}

function makeOrder(overrides = {}) {
  return {
    id: 1,
    buyerName: "王○○",
    productName: "測試商品",
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    shippingFee: 20,
    orderTotal: null,
    status: "pending",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  orders = [];
  products = [];
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("dashboard shows business actions without a questionnaire or skill requests", async () => {
  installFetch();
  const businessFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.doesNotMatch(String(url), /skills|skill-packages/);
    return businessFetch(url);
  };
  const view = render(React.createElement(DashboardPage));
  await waitFor(() => assert.match(view.container.textContent, /管理商品/));
  assert.match(view.container.textContent, /查看訂單/);
  assert.doesNotMatch(view.container.textContent, /技能|問卷|套餐/);
});
