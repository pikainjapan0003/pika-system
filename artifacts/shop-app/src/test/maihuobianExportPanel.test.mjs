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
const downloadedFiles = [];
const createdBlobs = [];
const preview = {
  eligibleCount: 1,
  ineligibleCount: 1,
  eligible: [
    {
      orderId: 101,
      productSummary: "BATCH-17 假商品 × 1",
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

const exportResult = {
  ...preview,
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
};

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { formatMaihuobianCsv, MaihuobianExportPanel } =
  await import("../lib/MaihuobianExportPanel.tsx");

afterEach(() => {
  cleanup();
  requests.length = 0;
  downloadedFiles.length = 0;
  createdBlobs.length = 0;
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

function installFetch({
  xlsmContentType = "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsmContentDisposition = 'attachment; filename="maihuobian-orders.xlsm"',
} = {}) {
  globalThis.URL.createObjectURL = (blob) => {
    createdBlobs.push(blob);
    return "blob:batch17-fake";
  };
  globalThis.URL.revokeObjectURL = () => undefined;
  globalThis.window.HTMLAnchorElement.prototype.click = function () {
    downloadedFiles.push({ download: this.download, href: this.href });
  };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === "POST" && String(url).includes("?format=xlsm")) {
      const blob = new Blob(["fake-xlsm"], {
        type: xlsmContentType,
      });
      return {
        ok: true,
        headers: new Headers({
          "Content-Type": xlsmContentType,
          "Content-Disposition": xlsmContentDisposition,
        }),
        blob: async () => blob,
      };
    }
    return {
      ok: true,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => (options.method === "POST" ? exportResult : preview),
    };
  };
}

test("Maihuobian CSV neutralizes spreadsheet formulas and quotes CSV syntax", () => {
  const csv = formatMaihuobianCsv([
    {
      recipientName: '=HYPERLINK("http://x")',
      recipientPhone: "+cmd",
      cvsStoreId: "-2+3",
      temperature: "@SUM(A1)",
      productSummary: "商品,含逗號",
      totalPrice: "100",
      shippingFee: "60",
      orderDate: "2026/7/19",
      notes: '第一行\n第二行"引號"',
      socialAccount: "safe",
    },
  ]);

  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/u);
  assert.match(csv, /"'\+cmd"/u);
  assert.match(csv, /"'-2\+3"/u);
  assert.match(csv, /"'@SUM\(A1\)"/u);
  assert.match(csv, /"商品,含逗號"/u);
  assert.match(csv, /"第一行\n第二行""引號"""/u);
});

async function renderCheckedPanel(fetchOptions) {
  installFetch(fetchOptions);
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
  assert.equal(
    view.getByRole("button", { name: "確認並下載 XLSM" }).disabled,
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
  assert.deepEqual(JSON.parse(post.options.body), {
    from: "2026-07-19",
    to: "2026-07-19",
    orderIds: [101],
  });
  assert.equal(post.url.endsWith("/maihuobian-export"), true);
  assert.equal(
    downloadedFiles[0]?.download,
    "maihuobian-orders-2026-07-19-2026-07-19.csv",
  );
  await waitFor(() =>
    assert.match(view.container.textContent, /已下載 1 筆 CSV 資料/u),
  );
});

test("Maihuobian panel downloads XLSM only after confirmation with the exact contract", async () => {
  const view = await renderCheckedPanel();
  fireEvent.click(view.getByRole("button", { name: "準備匯出 1 筆" }));

  const xlsmButton = view.getByRole("button", {
    name: "確認並下載 XLSM",
  });
  assert.equal(xlsmButton.disabled, true);
  assert.equal(
    requests.filter((request) => request.options.method === "POST").length,
    0,
  );

  fireEvent.click(view.getByLabelText("我確認本檔僅用於賣貨便出貨"));
  fireEvent.click(xlsmButton);

  await waitFor(() =>
    assert.equal(
      requests.filter((request) => request.options.method === "POST").length,
      1,
    ),
  );
  const post = requests.find((request) => request.options.method === "POST");
  assert.equal(post.url, "/api/stores/1/orders/maihuobian-export?format=xlsm");
  assert.equal(post.options.headers["X-Confirm-Cleartext-Export"], "true");
  assert.equal(post.options.headers["X-Confirm-Maihuobian-Export"], "true");
  assert.deepEqual(JSON.parse(post.options.body), {
    from: "2026-07-19",
    to: "2026-07-19",
    orderIds: [101],
  });
  await waitFor(() => assert.equal(downloadedFiles.length, 1));
  assert.equal(downloadedFiles[0].download, "maihuobian-orders.xlsm");
  assert.equal(
    createdBlobs[0].type.toLowerCase(),
    "application/vnd.ms-excel.sheet.macroEnabled.12".toLowerCase(),
  );
  await waitFor(() =>
    assert.match(view.container.textContent, /已下載 XLSM 檔案/u),
  );
});

test("Maihuobian panel rejects an XLSM response with the wrong MIME type", async () => {
  const view = await renderCheckedPanel({
    xlsmContentType: "application/json",
  });
  fireEvent.click(view.getByRole("button", { name: "準備匯出 1 筆" }));
  fireEvent.click(view.getByLabelText("我確認本檔僅用於賣貨便出貨"));
  fireEvent.click(view.getByRole("button", { name: "確認並下載 XLSM" }));

  await waitFor(() =>
    assert.match(view.container.textContent, /下載格式不正確/u),
  );
  assert.equal(downloadedFiles.length, 0);
  assert.equal(createdBlobs.length, 0);
});

test("Maihuobian panel replaces an unsafe XLSM filename with the safe fallback", async () => {
  const view = await renderCheckedPanel({
    xlsmContentDisposition: 'attachment; filename="../private.xlsm"',
  });
  fireEvent.click(view.getByRole("button", { name: "準備匯出 1 筆" }));
  fireEvent.click(view.getByLabelText("我確認本檔僅用於賣貨便出貨"));
  fireEvent.click(view.getByRole("button", { name: "確認並下載 XLSM" }));

  await waitFor(() => assert.equal(downloadedFiles.length, 1));
  assert.equal(downloadedFiles[0].download, "maihuobian-orders.xlsm");
});
