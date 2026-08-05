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
  namedExports: { useLocation: () => ["/trips/1/estimate", () => undefined] },
});
mock.module("@workspace/api-client-react", {
  namedExports: { useGetMyStore: () => ({ data: { id: 1, name: "Test store" } }) },
});
mock.module("../pages/Dashboard.tsx", {
  namedExports: { BottomNav: () => React.createElement("nav", null, "bottom-nav") },
});

const { default: TripEstimatePage } = await import("../pages/TripEstimate.tsx");
const summary = {
  mode: "ESTIMATE",
  status: "ready",
  exchangeRate: "0.2",
  entries: [],
  categories: Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    code: `C${index + 1}`,
    name: `類別${index + 1}`,
  })),
  totals: { fixedCostTotalTwd: "0.000000000000" },
  estimateLocked: false,
  estimateModifiedAfterLock: false,
};

function response(body, ok = true) {
  return { ok, json: async () => body };
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

function setInputValue(input, value) {
  assert.ok(input);
  assert.ok(nativeInputValueSetter);
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButtonByText(container, text) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === text);
}

async function waitForCall(calls, predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const call = calls.find(predicate);
    if (call) return call;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return undefined;
}

async function renderPage() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(React.createElement(TripEstimatePage, { tripId: 1 }));
  for (let attempt = 0; attempt < 20 && !container.textContent?.includes("類別11"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { container, root };
}

afterEach(() => {
  mock.restoreAll();
  document.body.innerHTML = "";
});

test("estimate page renders all eleven categories", async () => {
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage();
  assert.match(container.textContent, /11/);
  assert.equal(container.querySelectorAll("input[aria-label^='類別']").length, 11);
  root.unmount();
});

test("unused estimate categories are displayed as zero", async () => {
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage();
  const first = container.querySelector("input[aria-label='類別1']");
  assert.equal(first.value, "0");
  root.unmount();
});

test("saving estimate sends decimal strings and selected currency", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("operating-summary")) return response(summary);
    return response({ ok: true });
  };
  const { container, root } = await renderPage();
  setInputValue(container.querySelector("input[aria-label='類別1']"), "12.50");
  const saveButton = findButtonByText(container, "儲存估算");
  assert.ok(saveButton);
  saveButton.click();
  const entryCall = await waitForCall(calls, (call) => String(call.url).endsWith("/cost-entries"));
  assert.ok(entryCall);
  assert.equal(entryCall.init.method, "POST");
  assert.deepEqual(JSON.parse(entryCall.init.body), {
    mode: "ESTIMATE",
    categoryId: 1,
    originalAmount: "12.50",
    currency: "TWD",
  });
  root.unmount();
});

test("locked estimate exposes unlock action and modified warning", async () => {
  const locked = { ...summary, estimateLocked: true, estimateModifiedAfterLock: true };
  globalThis.fetch = async () => response(locked);
  const { container, root } = await renderPage();
  assert.match(container.textContent, /曾在鎖定後被人工解鎖修改/);
  assert.ok([...container.querySelectorAll("button")].some((button) => button.textContent === "解鎖估算"));
  root.unmount();
});

after(() => restoreDom());
