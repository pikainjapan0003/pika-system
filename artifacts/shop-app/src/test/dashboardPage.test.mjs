import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
const originalEvent = globalThis.Event;
const originalCustomEvent = globalThis.CustomEvent;
const originalNodeFilter = globalThis.NodeFilter;
const originalHtmlInputElement = globalThis.HTMLInputElement;
globalThis.React = React;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.NodeFilter = window.NodeFilter;
globalThis.HTMLInputElement = window.HTMLInputElement;

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
    useListRouteCostRanking: () => ({
      data: { status: "ready", items: [] },
      isLoading: false,
      error: null,
      refetch: async () => undefined,
    }),
    useListAreaScatter: () => ({
      data: { status: "ready", items: [] },
      isLoading: false,
      error: null,
      refetch: async () => undefined,
    }),
    useListHistoryTrend: () => ({
      data: { status: "ready", mode: "ACTUAL", items: [] },
      isLoading: false,
      error: null,
      refetch: async () => undefined,
    }),
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
mock.module("../components/SonarBackground.tsx", {
  namedExports: {
    SonarBackground: () =>
      React.createElement("div", { "data-testid": "sonar-whale" }),
  },
});

const { cleanup, fireEvent, getByTestId, queryByText, render, waitFor } =
  await import("@testing-library/react");
const { ProfitKpiBoard } = await import("../components/ProfitKpiBoard.tsx");
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
  if (originalEvent === undefined) delete globalThis.Event;
  else globalThis.Event = originalEvent;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
  if (originalNodeFilter === undefined) delete globalThis.NodeFilter;
  else globalThis.NodeFilter = originalNodeFilter;
  if (originalHtmlInputElement === undefined)
    delete globalThis.HTMLInputElement;
  else globalThis.HTMLInputElement = originalHtmlInputElement;
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

test("the dashboard KPI summary stays compact and preserves backend outcome", async () => {
  globalThis.fetch = kpiFetchMock();
  const view = render(React.createElement(DashboardPage));
  await waitFor(() =>
    assert.ok(
      view.container.querySelector("[data-slot='profit-kpi-board-compact']"),
    ),
  );
  const compact = view.container.querySelector(
    "[data-slot='profit-kpi-board-compact']",
  );
  assert.match(compact?.textContent ?? "", /暫估淨利與目標達成/);
  const cards = view.container.querySelectorAll("[data-kpi]");
  assert.equal(cards.length, 0);
  await waitFor(() => {
    assert.match(compact?.textContent ?? "", /NT\$\s?33,791/);
    assert.match(compact?.textContent ?? "", /已達標/);
  });
  assert.match(compact?.textContent ?? "", /系統計算結果/);
  assert.match(compact?.textContent ?? "", /開啟 KPI 分析室/);
  assert.doesNotMatch(compact?.textContent ?? "", /銷售總額/);
  assert.doesNotMatch(compact?.textContent ?? "", /NT\$\s?0/);

  const fullView = render(
    React.createElement(ProfitKpiBoard, {
      trips: [{ id: 1, name: "測試行程" }],
      selectedTripId: 1,
      onSelectTrip: () => undefined,
      estimate: estimateSummaryFixture(),
      actual: null,
      comparisonRows: [],
      loading: false,
      error: null,
      presentation: "full",
    }),
  );
  const coreNames = ["最終淨利", "淨利率", "調整後收入", "總成本"];
  for (const name of coreNames) {
    assert.match(fullView.container.textContent, new RegExp(name));
  }
  assert.match(
    fullView.container.querySelector("[data-kpi='netProfitRate']")
      ?.textContent ?? "",
    /待確認/,
  );
  assert.match(
    fullView.container.querySelector("[data-kpi='totalCost']")?.textContent ??
      "",
    /待確認/,
  );
  assert.match(fullView.container.textContent, /已達標/);
  assert.equal(fullView.container.querySelectorAll("[role='tab']").length, 4);
  assert.ok(fullView.container.querySelector("[data-testid='sonar-whale']"));

  const finalProfitCard = fullView.container.querySelector(
    "[data-kpi='finalProfit']",
  );
  assert.ok(finalProfitCard);
  fireEvent.click(finalProfitCard);
  await waitFor(() =>
    assert.ok(document.querySelector("[data-testid='bottom-sheet']")),
  );
  const sheetText =
    document.querySelector("[data-testid='bottom-sheet']")?.textContent ?? "";
  for (const label of [
    "公式",
    "資料來源",
    "涵蓋範圍",
    "最後更新時間",
    "是否為預估或實際或差異",
  ]) {
    assert.match(sheetText, new RegExp(label));
  }
  fullView.unmount();
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
