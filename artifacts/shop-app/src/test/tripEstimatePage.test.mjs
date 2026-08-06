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
  namedExports: {
    useGetMyStore: () => ({ data: { id: 1, name: "Test store" } }),
  },
});
mock.module("../pages/Dashboard.tsx", {
  namedExports: {
    BottomNav: () => React.createElement("nav", null, "bottom-nav"),
  },
});

const { default: TripEstimatePage } = await import("../pages/TripEstimate.tsx");

const fixedCategories = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  code: `FIXED_${index + 1}`,
  name: index === 6 ? "租車費用" : `固定費用${index + 1}`,
  kind: "FIXED",
}));
const variableCategories = Array.from({ length: 7 }, (_, index) => ({
  id: index + 12,
  code: `VARIABLE_${index + 1}`,
  name: `變動費用${index + 1}`,
  kind: "VARIABLE",
}));
const purchaseCategories = [
  {
    id: 19,
    code: "PURCHASE",
    name: "商品進貨成本",
    kind: "PURCHASE",
  },
];
const allCategories = [
  ...fixedCategories,
  ...variableCategories,
  ...purchaseCategories,
];

function section(categories, overrides = {}) {
  return {
    status: "ready",
    entries: [],
    categories,
    jpyOriginTwd: "0.000000000000",
    twdDirectTwd: "0.000000000000",
    totalTwd: "0.000000000000",
    paymentFeeTwd: "0.000000000000",
    ...overrides,
  };
}

function makeSummary(overrides = {}) {
  return {
    mode: "ESTIMATE",
    status: "ready",
    exchangeRate: "0.205",
    totalItemQuantity: 700,
    unitGrossProfitTwd: "130",
    entries: [],
    categories: allCategories,
    sections: {
      fixed: section(fixedCategories, {
        totalTwd: "39147.715000000000",
        paymentFeeTwd: "228.235725000000",
      }),
      variable: section(variableCategories, {
        totalTwd: "17642.325000000000",
        paymentFeeTwd: "190.234875000000",
      }),
      purchase: section(purchaseCategories),
    },
    tripProfit: {
      status: "ready",
      outcome: "SALARY_TARGET_MET",
      grossProfitSource: "UNIT",
      grossProfitTwd: "91000.000000000000",
      operatingExpenseTwd: "57208.510600000000",
      finalOperatingProfitTwd: "33791.489400000000",
      fixedPaymentFeeTwd: "228.235725000000",
      variablePaymentFeeTwd: "190.234875000000",
      purchasePaymentFeeTwd: "0.000000000000",
    },
    estimateLocked: false,
    estimateModifiedAfterLock: false,
    ...overrides,
  };
}

function response(body, ok = true) {
  return { ok, json: async () => body };
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype,
  "value",
)?.set;

function setInputValue(input, value) {
  assert.ok(input);
  assert.ok(nativeInputValueSetter);
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select, value) {
  assert.ok(select);
  assert.ok(nativeSelectValueSetter);
  nativeSelectValueSetter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function findButtonByText(container, text) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  );
}

async function waitForCall(calls, predicate, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const call = calls.find(predicate);
    if (call) return call;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return undefined;
}

async function waitForCondition(predicate, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

async function renderPage(summary = makeSummary()) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(React.createElement(TripEstimatePage, { tripId: 1 }));
  const rendered = await waitForCondition(() =>
    container.textContent?.includes("商品進貨成本"),
  );
  assert.equal(rendered, true);
  return { container, root, summary };
}

afterEach(() => {
  mock.restoreAll();
  document.body.innerHTML = "";
});

test("estimate page renders fixed, variable, and purchase sections", async () => {
  globalThis.fetch = async () => response(makeSummary());
  const { container, root } = await renderPage();

  assert.match(container.textContent, /固定費用（11 項）/);
  assert.match(container.textContent, /變動費用（7 項）/);
  assert.match(container.textContent, /採購成本（1 項）/);
  assert.equal(
    container.querySelectorAll("[data-cost-section='FIXED'] input").length,
    11,
  );
  assert.equal(
    container.querySelectorAll("[data-cost-section='VARIABLE'] input").length,
    7,
  );
  assert.equal(
    container.querySelectorAll("[data-cost-section='PURCHASE'] input").length,
    1,
  );
  root.unmount();
});

test("saving estimate sends original decimals, per-item currency, and UNIT inputs", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("operating-summary")) {
      return response(makeSummary());
    }
    return response({ ok: true });
  };
  const { container, root } = await renderPage();
  setInputValue(
    container.querySelector("input[aria-label='固定費用1']"),
    "5400",
  );
  setInputValue(
    container.querySelector("input[aria-label='租車費用']"),
    "63943",
  );
  setSelectValue(
    container.querySelector("select[aria-label='租車費用幣別']"),
    "JPY",
  );

  const saveButton = findButtonByText(container, "儲存估算");
  assert.ok(saveButton);
  saveButton.click();

  const operatingInputCall = await waitForCall(calls, (call) =>
    String(call.url).endsWith("/operating-inputs"),
  );
  assert.ok(operatingInputCall);
  assert.deepEqual(JSON.parse(operatingInputCall.init.body), {
    exchangeRate: "0.205",
    totalItemQuantity: "700",
    unitGrossProfitTwd: "130",
  });

  const firstCategoryCall = await waitForCall(calls, (call) => {
    if (!String(call.url).endsWith("/cost-entries")) return false;
    return JSON.parse(call.init.body).categoryId === 1;
  });
  const seventhCategoryCall = await waitForCall(calls, (call) => {
    if (!String(call.url).endsWith("/cost-entries")) return false;
    return JSON.parse(call.init.body).categoryId === 7;
  });
  assert.deepEqual(JSON.parse(firstCategoryCall.init.body), {
    mode: "ESTIMATE",
    categoryId: 1,
    originalAmount: "5400",
    currency: "TWD",
  });
  assert.deepEqual(JSON.parse(seventhCategoryCall.init.body), {
    mode: "ESTIMATE",
    categoryId: 7,
    originalAmount: "63943",
    currency: "JPY",
  });
  root.unmount();
});

test("existing estimate entry persists a changed currency through PATCH", async () => {
  const existingEntry = {
    id: 99,
    categoryId: 7,
    categoryName: "租車費用",
    originalAmount: "1000",
    currency: "TWD",
    categoryKind: "FIXED",
  };
  const summary = makeSummary({
    entries: [existingEntry],
    sections: {
      ...makeSummary().sections,
      fixed: section(fixedCategories, { entries: [existingEntry] }),
    },
  });
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("operating-summary")) return response(summary);
    return response({ ok: true });
  };
  const { container, root } = await renderPage(summary);
  setSelectValue(
    container.querySelector("select[aria-label='租車費用幣別']"),
    "JPY",
  );
  findButtonByText(container, "儲存估算").click();

  const patchCall = await waitForCall(
    calls,
    (call) =>
      String(call.url).endsWith("/cost-entries/99") &&
      call.init.method === "PATCH",
  );
  assert.ok(patchCall);
  assert.deepEqual(JSON.parse(patchCall.init.body), {
    originalAmount: "1000",
    currency: "JPY",
  });
  root.unmount();
});

test("JPY conversion preview uses exact grouped two-decimal display", async () => {
  globalThis.fetch = async () => response(makeSummary());
  const { container, root } = await renderPage();
  setInputValue(
    container.querySelector("input[aria-label='租車費用']"),
    "63943",
  );
  const select = container.querySelector("select[aria-label='租車費用幣別']");
  setSelectValue(select, "JPY");

  const updated = await waitForCondition(() =>
    select.parentElement?.textContent?.includes("≈ NT$13,108.32"),
  );
  assert.equal(updated, true);
  root.unmount();
});

test("JPY rows without an exchange rate show 待確認 instead of zero", async () => {
  globalThis.fetch = async () => response(makeSummary());
  const { container, root } = await renderPage();
  setInputValue(container.querySelector("input[aria-label='估算匯率']"), "");
  const select = container.querySelector("select[aria-label='租車費用幣別']");
  setSelectValue(select, "JPY");

  const updated = await waitForCondition(() =>
    select.parentElement?.textContent?.includes("待確認"),
  );
  assert.equal(updated, true);
  assert.doesNotMatch(select.parentElement.textContent, /NT\$0/);
  root.unmount();
});

test("fee summary displays all three backend fee values", async () => {
  globalThis.fetch = async () => response(makeSummary());
  const { container, root } = await renderPage();

  assert.match(container.textContent, /固定金流費用NT\$228\.24/);
  assert.match(container.textContent, /變動金流費用NT\$190\.23/);
  assert.match(container.textContent, /採購金流費用NT\$0/);
  assert.match(container.textContent, /營業費用合計NT\$57,208\.51/);
  root.unmount();
});

test("profit card renders all three backend outcome states without inference", async () => {
  for (const [outcome, label] of [
    ["SALARY_TARGET_MET", "達成日薪目標"],
    ["PROFIT_BELOW_SALARY_TARGET", "有利潤但未達日薪目標"],
    ["LOSS", "虧損"],
  ]) {
    const summary = makeSummary({
      tripProfit: { ...makeSummary().tripProfit, outcome },
    });
    globalThis.fetch = async () => response(summary);
    const { container, root } = await renderPage(summary);
    assert.match(container.textContent, new RegExp(`結論：${label}`));
    root.unmount();
    document.body.innerHTML = "";
  }
});

test("pending trip profit card shows the backend reason instead of zero", async () => {
  const summary = makeSummary({
    status: "pending_confirmation",
    tripProfit: {
      status: "pending_confirmation",
      reason: "缺少單件毛利或預估件數",
    },
  });
  globalThis.fetch = async () => response(summary);
  const { container, root } = await renderPage(summary);
  const heading = [...container.querySelectorAll("h2")].find(
    (node) => node.textContent === "整趟損益預估",
  );
  const card = heading?.parentElement;

  assert.ok(card);
  assert.match(card.textContent, /待確認/);
  assert.match(card.textContent, /缺少單件毛利或預估件數/);
  assert.doesNotMatch(card.textContent, /預估營業毛利NT\$0/);
  root.unmount();
});

test("locked estimate exposes unlock action and modified warning", async () => {
  const locked = makeSummary({
    estimateLocked: true,
    estimateModifiedAfterLock: true,
  });
  globalThis.fetch = async () => response(locked);
  const { container, root } = await renderPage(locked);
  assert.match(container.textContent, /此預估曾在鎖定後解鎖修改/);
  assert.ok(findButtonByText(container, "解鎖估算"));
  root.unmount();
});

after(() => restoreDom());
