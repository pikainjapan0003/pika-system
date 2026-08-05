import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
globalThis.React = React;
mock.module("@clerk/react", { namedExports: { useAuth: () => ({ getToken: async () => "fake-token" }) } });
mock.module("wouter", { namedExports: { useLocation: () => ["/trips/1/actual", () => undefined] } });
mock.module("@workspace/api-client-react", { namedExports: { useGetMyStore: () => ({ data: { id: 1 } }) } });
mock.module("../pages/Dashboard.tsx", { namedExports: { BottomNav: () => React.createElement("nav", null, "bottom-nav") } });

const { default: TripActualPage } = await import("../pages/TripActual.tsx");
const summary = {
  categories: [{ id: 1, name: "人事費用" }, { id: 2, name: "交通費用" }],
  entries: [{ id: 1, categoryId: 1, categoryName: "人事費用", currency: "TWD", originalAmount: "120", photoUrl: null, status: "ACTIVE" }],
  exchangeRate: "0.2",
};

function response(body, ok = true) { return { ok, json: async () => body }; }

async function renderPage() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(React.createElement(TripActualPage, { tripId: 1 }));
  for (let i = 0; i < 20 && !container.textContent?.includes("已記錄費用"); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  return { container, root };
}

afterEach(() => { mock.restoreAll(); document.body.innerHTML = ""; });

test("actual page lists existing invoice rows", async () => {
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage();
  assert.match(container.textContent, /人事費用/);
  assert.match(container.textContent, /無單據/);
  root.unmount();
});

test("actual page exposes all required receipt fields", async () => {
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage();
  assert.ok(container.querySelector("input[aria-label='實際費用金額']"));
  assert.ok(container.querySelector("input[aria-label='實際費用日期']"));
  assert.ok(container.querySelector("input[aria-label='收據照片']"));
  root.unmount();
});

test("actual page accepts a custom category", async () => {
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage();
  assert.ok(container.querySelector("input[aria-label='自訂項目名稱']"));
  root.unmount();
});

test("saving an actual row uses ACTUAL mode and a decimal string", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return String(url).includes("operating-summary") ? response(summary) : response({ id: 2 });
  };
  const { container, root } = await renderPage();
  container.querySelector("input[aria-label='實際費用金額']").value = "12.50";
  container.querySelector("input[aria-label='實際費用金額']").dispatchEvent(new Event("input", { bubbles: true }));
  container.querySelector("input[aria-label='自訂項目名稱']").value = "其他費用";
  container.querySelector("input[aria-label='自訂項目名稱']").dispatchEvent(new Event("input", { bubbles: true }));
  container.querySelector("button").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entryCall = calls.find((call) => String(call.url).endsWith("/cost-entries"));
  assert.ok(entryCall);
  assert.match(entryCall.init.body, /\"mode\":\"ACTUAL\"/);
  assert.match(entryCall.init.body, /\"originalAmount\":\"12.50\"/);
  root.unmount();
});

after(() => restoreDom());
