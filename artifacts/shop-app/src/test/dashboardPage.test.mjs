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

function estimateSummaryFixture() {
  return {
    status: "ready",
    mode: "ESTIMATE",
    exchangeRate: "0.205",
    totalItemQuantity: 700,
    unitGrossProfitTwd: "130",
    entries: [],
    categories: [],
    sections: {
      fixed: {
        status: "ready",
        totalTwd: "39147.715000000000",
        paymentFeeTwd: "228.235725000000",
      },
      variable: {
        status: "ready",
        totalTwd: "17642.325000000000",
        paymentFeeTwd: "190.234875000000",
      },
      purchase: {
        status: "ready",
        totalTwd: "9876.000000000000",
        paymentFeeTwd: "0.000000000000",
      },
    },
    tripProfit: {
      status: "ready",
      projections: {
        unit: {
          status: "ready",
          outcome: "SALARY_TARGET_MET",
          grossProfitTwd: "91000.000000000000",
          adjustedRevenueTwd: null,
          grossMarginRate: null,
          operatingProfitBeforeAdjustmentsTwd: "33791.489400000000",
          finalOperatingProfitTwd: "33791.489400000000",
          salaryTargetTwd: "30000.000000000000",
        },
        daily: {
          status: "ready",
          outcome: "SALARY_TARGET_MET",
          grossProfitTwd: "80000.000000000000",
          adjustedRevenueTwd: null,
          grossMarginRate: null,
          operatingProfitBeforeAdjustmentsTwd: "22791.489400000000",
          finalOperatingProfitTwd: "22791.489400000000",
          salaryTargetTwd: "30000.000000000000",
        },
      },
      fixedCostTotalTwd: "39147.715000000000",
      variableCostTotalTwd: "17642.325000000000",
      purchaseCostPrincipalTwd: "9876.000000000000",
      paymentFeeTwd: "418.470600000000",
      operatingExpenseTwd: "57208.510600000000",
    },
    estimateLocked: false,
    estimateModifiedAfterLock: false,
  };
}

function kpiFetchMock(
  summary = estimateSummaryFixture(),
  trips = [{ id: 1, name: "測試行程" }],
) {
  return async (url) => {
    const u = String(url);
    if (u.endsWith("/trips")) {
      return { ok: true, json: async () => trips };
    }
    if (u.includes("operating-summary")) {
      return { ok: true, json: async () => summary };
    }
    if (u.includes("fixed-cost-comparison")) {
      return { ok: true, json: async () => ({ status: "ready", rows: [] }) };
    }
    if (u.includes("profit-summary")) {
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

test("no trips renders the designed KPI empty state instead of zeros", async () => {
  globalThis.fetch = kpiFetchMock(estimateSummaryFixture(), []);
  const view = render(React.createElement(DashboardPage));
  await waitFor(() => assert.match(view.container.textContent, /尚無行程/));
  assert.match(view.container.textContent, /請先建立行程/);
  assert.doesNotMatch(view.container.textContent, /NT\$0/);
});

test("13 KPI cards render estimate values and never zero for missing sales", async () => {
  globalThis.fetch = kpiFetchMock();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() => assert.ok(view.container.querySelector("[data-kpi]")));
  assert.match(view.container.textContent, /成本利潤 KPI（預估）/);
  const cards = view.container.querySelectorAll("[data-kpi]");
  assert.equal(cards.length, 13);
  assert.match(view.container.textContent, /營業毛利/);
  assert.match(view.container.textContent, /固定成本/);
  assert.match(view.container.textContent, /最終營業利益/);
  const outcomeCard = view.container.querySelector("[data-kpi='outcome']");
  assert.match(outcomeCard?.textContent ?? "", /已達標/);
  const salesCard = view.container.querySelector("[data-kpi='sales']");
  assert.match(salesCard?.textContent ?? "", /待確認/);
  assert.doesNotMatch(salesCard?.textContent ?? "", /NT\$0/);
});

test("preview charts render the mandatory mock badge and heatmap legend", async () => {
  globalThis.fetch = kpiFetchMock();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() =>
    assert.match(view.container.textContent, /⚠️ 示意圖・非真實資料/),
  );
  const badges = view.container.querySelectorAll("div");
  const badgeText = view.container.textContent;
  const count = (badgeText.match(/示意圖・非真實資料/g) ?? []).length;
  assert.equal(count, 4);
  assert.ok(
    view.container.querySelector("[data-preview-chart='sensitivity-heatmap']"),
  );
  assert.match(view.container.textContent, /階1（NT\$ 0）/);
});
