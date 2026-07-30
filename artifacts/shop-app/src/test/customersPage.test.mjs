import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
const originalConfirm = globalThis.window?.confirm;
const originalCreateObjectUrl = globalThis.URL.createObjectURL;
const originalRevokeObjectUrl = globalThis.URL.revokeObjectURL;
globalThis.React = React;

const requests = [];

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
    useClerk: () => ({ signOut: () => undefined }),
  },
});

mock.module("wouter", {
  namedExports: {
    useLocation: () => ["/customers", () => undefined],
  },
});

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetMyStore: () => ({
      data: { id: 1, name: "測試店", description: "假資料" },
    }),
    useGetStoreStats: () => ({ data: undefined }),
    useListOrders: () => ({ data: [] }),
    useListProducts: () => ({ data: [] }),
  },
});

const customers = [
  {
    id: 1,
    storeId: 1,
    code: "C001",
    name: "王小明",
    phone: "0912345678",
    tier: "vip",
    cvsStoreId: null,
    cvsStoreName: null,
    cvsStoreAddress: null,
    cvsStorePhone: null,
    notes: "假資料",
  },
];

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { default: CustomersPage } = await import("../pages/Customers.tsx");

afterEach(() => {
  cleanup();
  requests.length = 0;
  globalThis.fetch = originalFetch;
  globalThis.window.confirm = originalConfirm;
  globalThis.URL.createObjectURL = originalCreateObjectUrl;
  globalThis.URL.revokeObjectURL = originalRevokeObjectUrl;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function installFetch() {
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = () => undefined;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/export?")) {
      return {
        ok: true,
        blob: async () => new Blob(["fake,csv"]),
      };
    }
    return {
      ok: true,
      json: async () => customers,
    };
  };
}

async function renderLoadedCustomers() {
  installFetch();
  const view = render(React.createElement(CustomersPage));
  await waitFor(() =>
    assert.match(view.container.textContent, /確認匯出（1 筆）/),
  );
  requests.length = 0;
  return view;
}

test("customer list masks the name and phone by default", async () => {
  const view = await renderLoadedCustomers();

  assert.match(view.container.textContent, /王\*明/);
  assert.match(view.container.textContent, /0912\*\*\*678/);
  assert.doesNotMatch(view.container.textContent, /0912345678/);
});

test("masked export confirms the row count and never sends cleartext header", async () => {
  const confirmations = [];
  globalThis.window.confirm = (message) => {
    confirmations.push(message);
    return true;
  };
  const view = await renderLoadedCustomers();
  fireEvent.click(view.getByRole("button", { name: "確認匯出（1 筆）" }));

  await waitFor(() => assert.equal(requests.length, 1));
  assert.deepEqual(confirmations, [
    "即將匯出 1 筆客戶資料（遮罩版），是否繼續？",
  ]);
  assert.equal(
    Object.keys(requests[0].options.headers).some(
      (key) => key.toLowerCase() === "x-confirm-cleartext-export",
    ),
    false,
  );
});

test("cleartext export only sends its header after the second confirmation", async () => {
  let confirmationCount = 0;
  globalThis.window.confirm = () => {
    confirmationCount += 1;
    return confirmationCount === 1;
  };
  const view = await renderLoadedCustomers();
  fireEvent.click(
    view.getByLabelText(/改匯出明文版（含完整個資，下載前會再確認一次）/),
  );
  fireEvent.click(view.getByRole("button", { name: "確認匯出（1 筆）" }));
  assert.equal(confirmationCount, 2);
  assert.equal(requests.length, 0);

  globalThis.window.confirm = () => true;
  fireEvent.click(view.getByRole("button", { name: "確認匯出（1 筆）" }));
  await waitFor(() => assert.equal(requests.length, 1));
  assert.equal(
    requests[0].options.headers["X-Confirm-Cleartext-Export"],
    "true",
  );
});
