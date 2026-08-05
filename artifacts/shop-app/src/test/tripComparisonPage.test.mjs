import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";
import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
globalThis.React = React;
mock.module("@clerk/react", {
  namedExports: { useAuth: () => ({ getToken: async () => "fake-token" }) },
});
mock.module("wouter", {
  namedExports: { useLocation: () => ["/trips/1/comparison", () => undefined] },
});
mock.module("@workspace/api-client-react", {
  namedExports: { useGetMyStore: () => ({ data: { id: 1 } }) },
});
mock.module("../pages/Dashboard.tsx", {
  namedExports: {
    BottomNav: () => React.createElement("nav", null, "bottom-nav"),
  },
});

const { default: TripComparisonPage } =
  await import("../pages/TripComparison.tsx");
const payload = {
  status: "ready",
  rows: [
    {
      key: "category:1",
      label: "人事費用",
      state: "matched",
      estimatedTwd: "100.00",
      actualTwd: "80.00",
      variance: {
        difference: "-20.00",
        percent: "-0.20",
        direction: "favorable",
      },
    },
    {
      key: "category:2",
      label: "機票費用",
      state: "estimate-only",
      estimatedTwd: "50.00",
      actualTwd: null,
      variance: null,
    },
    {
      key: "category:3",
      label: "自訂",
      state: "actual-only",
      estimatedTwd: null,
      actualTwd: "10.00",
      variance: null,
    },
  ],
};

async function renderPage(responseBody = payload) {
  globalThis.fetch = async () => ({ ok: true, json: async () => responseBody });
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(React.createElement(TripComparisonPage, { tripId: 1 }));
  for (let i = 0; i < 20 && !container.textContent?.includes("人事費用"); i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  return { container, root };
}

afterEach(() => {
  mock.restoreAll();
  document.body.innerHTML = "";
});

test("comparison renders estimate and actual columns", async () => {
  const { container, root } = await renderPage();
  assert.match(container.textContent, /預估/);
  assert.match(container.textContent, /實際/);
  assert.match(container.textContent, /NT\$100.00/);
  root.unmount();
});

test("comparison renders favorable and unfavorable direction labels", async () => {
  const { container, root } = await renderPage({
    ...payload,
    rows: [
      {
        ...payload.rows[0],
        variance: { ...payload.rows[0].variance, direction: "unfavorable" },
      },
    ],
  });
  assert.match(container.textContent, /不利/);
  root.unmount();
});

test("comparison distinguishes missing estimate and actual rows", async () => {
  const { container, root } = await renderPage();
  assert.match(container.textContent, /未發生/);
  assert.match(container.textContent, /預算外/);
  root.unmount();
});

after(() => restoreDom());
