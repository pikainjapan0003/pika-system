import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetMyStore: () => ({
      data: { id: 1 },
      isLoading: false,
      error: null,
      refetch: async () => undefined,
    }),
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

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { RouteCostRankingChartView } =
  await import("../components/charts/RouteCostRankingChart.tsx");
const { AreaScatterChartView } =
  await import("../components/charts/AreaScatterChart.tsx");
const { HistoryTrendChartView } =
  await import("../components/charts/HistoryTrendChart.tsx");
const { chartTwdAriaLabel, formatChartTwd } =
  await import("../components/charts/exactChart.ts");

afterEach(cleanup);

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("route ranking sorts exact strings and keeps pending reasons fail-closed", () => {
  const view = render(
    React.createElement(RouteCostRankingChartView, {
      loading: false,
      onRetry: () => undefined,
      data: {
        status: "pending_confirmation",
        items: [
          {
            routeId: 1,
            tripId: 1,
            name: "東京",
            tripName: "春季行程",
            unitCostTwd: "20.000000000000",
            status: "ready",
            reason: null,
          },
          {
            routeId: 2,
            tripId: 1,
            name: "大阪",
            tripName: "春季行程",
            unitCostTwd: "100.000000000000",
            status: "ready",
            reason: null,
          },
          {
            routeId: 3,
            tripId: 2,
            name: "北海道",
            tripName: "冬季行程",
            unitCostTwd: null,
            status: "pending_confirmation",
            reason: "missing_fuel_jpy",
          },
        ],
      },
    }),
  );

  const text = view.container.textContent ?? "";
  assert.match(text, /已確認路線中，大阪的單件路線成本最高/);
  assert.ok(text.indexOf("1. 大阪") < text.indexOf("2. 東京"));
  assert.match(text, /北海道：待確認｜尚未填寫燃油費/);
  assert.doesNotMatch(text, /北海道[^◆]*NT\$0/);
});

test("history keeps partial exact ACTUAL data and exposes keyboard tooltip", () => {
  const view = render(
    React.createElement(HistoryTrendChartView, {
      loading: false,
      onRetry: () => undefined,
      data: {
        status: "pending_confirmation",
        mode: "ACTUAL",
        items: [
          {
            month: "2026-06",
            tripCount: 2,
            profitTwd: "100.000000000000",
            status: "ready",
            reason: null,
          },
          {
            month: "2026-07",
            tripCount: 1,
            profitTwd: null,
            status: "pending_confirmation",
            reason: "missing_actual_exchange_rate",
          },
          {
            month: "2026-08",
            tripCount: 3,
            profitTwd: "120.000000000000",
            status: "ready",
            reason: null,
          },
        ],
      },
    }),
  );

  assert.match(
    view.container.textContent ?? "",
    /最新可確認月份的實際淨利較最早可確認月份高/,
  );
  assert.match(view.container.textContent ?? "", /2026-07/);
  assert.match(view.container.textContent ?? "", /尚未填寫實際匯率/);
  const monthButton = [...view.container.querySelectorAll("button")].find(
    (button) => button.textContent?.includes("2026-06"),
  );
  assert.ok(monthButton);
  fireEvent.focus(monthButton);
  assert.match(
    view.container.querySelector("[role='tooltip']")?.textContent ?? "",
    /實際最終淨利 NT\$\u00a0100\.00/,
  );
});

test("area scatter preserves ready details and excludes pending points", () => {
  const view = render(
    React.createElement(AreaScatterChartView, {
      loading: false,
      onRetry: () => undefined,
      data: {
        status: "pending_confirmation",
        items: [
          {
            areaName: "關東",
            tripCount: 2,
            itemQuantity: "20",
            revenueTwd: "4000.000000000000",
            averageUnitProfitTwd: "100.000000000000",
            status: "ready",
            reason: null,
          },
          {
            areaName: "關西",
            tripCount: 1,
            itemQuantity: "100",
            revenueTwd: "9000.000000000000",
            averageUnitProfitTwd: "80.000000000000",
            status: "ready",
            reason: null,
          },
          {
            areaName: "北海道",
            tripCount: 1,
            itemQuantity: null,
            revenueTwd: null,
            averageUnitProfitTwd: null,
            status: "pending_confirmation",
            reason: "missing_actual_quantity",
          },
        ],
      },
    }),
  );

  const text = view.container.textContent ?? "";
  assert.match(text, /已確認大區中，關東的平均單件毛利最高/);
  assert.match(text, /關西100 件 · NT\$\u00a080\.00/);
  assert.match(text, /北海道：待確認｜尚無納入計算的實際商品件數/);
  assert.doesNotMatch(text, /北海道[^◆]*NT\$0/);
});

test("chart views distinguish empty and endpoint error states", () => {
  const empty = render(
    React.createElement(RouteCostRankingChartView, {
      data: { status: "ready", items: [] },
      loading: false,
      onRetry: () => undefined,
    }),
  );
  assert.match(empty.container.textContent ?? "", /尚無路線成本資料/);
  empty.unmount();

  const failed = render(
    React.createElement(AreaScatterChartView, {
      loading: false,
      error: new Error("HTTP 503"),
      onRetry: () => undefined,
    }),
  );
  assert.match(failed.container.textContent ?? "", /無法讀取大區比較/);
  assert.match(failed.container.textContent ?? "", /HTTP 503/);
  assert.match(failed.container.textContent ?? "", /重試/);
  failed.unmount();

  const cached = render(
    React.createElement(AreaScatterChartView, {
      data: {
        status: "ready",
        items: [
          {
            areaName: "關東",
            tripCount: 2,
            itemQuantity: "20",
            revenueTwd: "4000",
            averageUnitProfitTwd: "100",
            status: "ready",
            reason: null,
          },
          {
            areaName: "關西",
            tripCount: 1,
            itemQuantity: "10",
            revenueTwd: "1000",
            averageUnitProfitTwd: "50",
            status: "ready",
            reason: null,
          },
        ],
      },
      loading: false,
      error: new Error("HTTP 503"),
      onRetry: () => undefined,
    }),
  );
  assert.match(cached.container.textContent ?? "", /目前顯示上次成功資料/);
  assert.match(cached.container.textContent ?? "", /關東20 件/);
});

test("chart money formatter keeps ExactDecimal display rules and fails closed", () => {
  assert.equal(formatChartTwd("13108.325"), "NT$\u00a013,108.33");
  assert.equal(formatChartTwd("-245.5"), "−NT$\u00a0245.50");
  assert.equal(chartTwdAriaLabel("-245.5"), "負新台幣 245.50 元");
  assert.equal(formatChartTwd("0"), "NT$\u00a00.00");
  assert.equal(formatChartTwd("not-a-decimal"), "待確認");
  assert.equal(formatChartTwd(null), "待確認");
});
