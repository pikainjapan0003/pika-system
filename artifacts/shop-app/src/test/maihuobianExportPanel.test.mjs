import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
const originalCreateObjectUrl = globalThis.URL.createObjectURL;
const originalRevokeObjectUrl = globalThis.URL.revokeObjectURL;
const originalAnchorClick = globalThis.window.HTMLAnchorElement.prototype.click;
globalThis.React = React;

const requests = [];
const preview = {
  eligibleCount: 1,
  ineligibleCount: 1,
  eligible: [
    {
      orderId: 101,
      row: {
        recipientName: "王小明",
        recipientPhone: "0912345678",
        cvsStoreId: "123456",
        temperature: "常溫",
        productSummary: "BATCH-17 假商品 × 1",
        totalPrice: "100.00",
        shippingFee: "60.00",
        orderDate: "2026/7/19",
        notes: "",
        socialAccount: "",
      },
    },
  ],
  ineligible: [
    {
      orderId: 102,
      reasons: [
        {
          code: "ORDER_STATUS_INELIGIBLE",
          message: "僅備貨中訂單可匯出",
        },
      ],
    },
  ],
};

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { MaihuobianExportPanel } =
  await import("../lib/MaihuobianExportPanel.tsx");

afterEach(() => {
  cleanup();
  requests.length = 0;
  globalThis.fetch = originalFetch;
  globalThis.URL.createObjectURL = originalCreateObjectUrl;
  globalThis.URL.revokeObjectURL = originalRevokeObjectUrl;
  globalThis.window.HTMLAnchorElement.prototype.click = originalAnchorClick;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function installFetch() {
  globalThis.URL.createObjectURL = () => "blob:batch17-fake";
  globalThis.URL.revokeObjectURL = () => undefined;
  globalThis.window.HTMLAnchorElement.prototype.click = () => undefined;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => preview,
    };
  };
}

async function renderCheckedPanel() {
  installFetch();
  const view = render(
    React.createElement(MaihuobianExportPanel, {
      storeId: 1,
      getToken: async () => "fake-token",
      onClose: () => undefined,
    }),
  );
  fireEvent.change(view.getByLabelText("開始日期"), {
    target: { value: "2026-07-19" },
  });
  fireEvent.change(view.getByLabelText("結束日期"), {
    target: { value: "2026-07-19" },
  });
  fireEvent.click(view.getByRole("button", { name: "檢查可匯出訂單" }));
  await waitFor(() => assert.match(view.container.textContent, /可匯出（1）/u));
  return view;
}

test("Maihuobian panel shows eligible and ineligible orders with reasons", async () => {
  const view = await renderCheckedPanel();

  assert.match(view.container.textContent, /BATCH-17 假商品 × 1/u);
  assert.match(view.container.textContent, /不可匯出（1）/u);
  assert.match(view.container.textContent, /僅備貨中訂單可匯出/u);
  assert.equal(view.getByLabelText("選取訂單 101").checked, true);
});

test("Maihuobian panel shows count and privacy warning before any POST", async () => {
  const view = await renderCheckedPanel();
  fireEvent.click(view.getByRole("button", { name: "準備匯出 1 筆" }));

  assert.match(view.container.textContent, /將匯出 1 筆明文個資/u);
  assert.match(view.container.textContent, /只能用於本次賣貨便出貨/u);
  assert.equal(
    requests.filter((request) => request.options.method === "POST").length,
    0,
  );
  assert.equal(
    view.getByRole("button", { name: "確認並下載 CSV" }).disabled,
    true,
  );
});

test("Maihuobian panel sends both headers only after explicit confirmation", async () => {
  const view = await renderCheckedPanel();
  fireEvent.click(view.getByRole("button", { name: "準備匯出 1 筆" }));
  fireEvent.click(view.getByLabelText("我確認本檔僅用於賣貨便出貨"));
  fireEvent.click(view.getByRole("button", { name: "確認並下載 CSV" }));

  await waitFor(() =>
    assert.equal(
      requests.filter((request) => request.options.method === "POST").length,
      1,
    ),
  );
  const post = requests.find((request) => request.options.method === "POST");
  assert.equal(post.options.headers["X-Confirm-Cleartext-Export"], "true");
  assert.equal(post.options.headers["X-Confirm-Maihuobian-Export"], "true");
  assert.deepEqual(JSON.parse(post.options.body).orderIds, [101]);
  await waitFor(() =>
    assert.match(view.container.textContent, /已下載 1 筆 CSV 資料/u),
  );
});
