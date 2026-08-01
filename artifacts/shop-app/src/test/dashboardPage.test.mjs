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
let visibility = {
  loaded: true,
  enabledSkillCount: 1,
  isVisible: () => true,
  refresh: async () => undefined,
};

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
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
mock.module("../lib/dailySkillVisibilityContext.tsx", {
  namedExports: { useDailySkillVisibility: () => visibility },
});
mock.module("../lib/OnboardingQuestionnaireCard", {
  namedExports: {
    OnboardingQuestionnaire: () =>
      React.createElement(
        "div",
        { "data-testid": "onboarding-questionnaire" },
        "進階功能引導卡",
      ),
  },
});

const { cleanup, getByTestId, queryByText, render, waitFor } =
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
  visibility = {
    loaded: true,
    enabledSkillCount: 1,
    isVisible: () => true,
    refresh: async () => undefined,
  };
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("zero enabled skills show the onboarding card", async () => {
  visibility = { ...visibility, enabledSkillCount: 0 };
  installFetch();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() =>
    assert.ok(getByTestId(view.container, "onboarding-questionnaire")),
  );
  assert.match(view.container.textContent, /進階功能引導卡/);
});

test("recent order uses the resolved NT$ display total", async () => {
  orders = [makeOrder()];
  installFetch();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() => assert.match(view.container.textContent, /NT\$120/));
  assert.match(view.container.textContent, /測試商品/);
});

test("disabled product skill hides the dashboard product entry", async () => {
  visibility = {
    ...visibility,
    isVisible: (surface) => surface !== "products",
  };
  installFetch();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() => assert.match(view.container.textContent, /店鋪設定/));
  assert.equal(queryByText(view.container, "新增、編輯商品"), null);
  assert.match(view.container.textContent, /查看訂單/);
});
