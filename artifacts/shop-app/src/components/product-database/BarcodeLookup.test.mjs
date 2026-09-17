import assert from "node:assert/strict";
import { test, after, afterEach, mock } from "node:test";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { installTestDom } from "../../test/domBootstrap.mjs";
const restore = installTestDom();
const previousReact = globalThis.React;
globalThis.React = React;
const dialogGlobals = ["CustomEvent", "NodeFilter", "HTMLInputElement"].map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
);
for (const [key] of dialogGlobals)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: window[key],
  });
let handler = async () => ({ items: [], total: 0 }),
  calls = [],
  scanned,
  stops = 0,
  chosen = [],
  manual = 0;
mock.module("@workspace/api-client-react", {
  namedExports: {
    catalogList: (s, p, o) => {
      calls.push({ s, p, signal: o.signal });
      return handler(s, p, o);
    },
  },
});
mock.module("wouter", {
  namedExports: { useLocation: () => ["/test", () => {}] },
});
mock.module("./shared.tsx", {
  namedExports: {
    action: "min-h-11",
    control: "",
    panel: "",
    Status: ({ status }) => React.createElement("span", null, status),
    useCatalogQuery: (s, key, load, enabled = true) =>
      useQuery({
        queryKey: ["product-database", s, ...key],
        queryFn: ({ signal }) => load(signal),
        enabled,
        retry: false,
      }),
  },
});
mock.module("../ui/button.tsx", {
  namedExports: {
    Button: React.forwardRef(({ variant, ...props }, ref) =>
      React.createElement("button", { ...props, ref }),
    ),
  },
});
mock.module("../../lib/barcodeCamera.ts", {
  namedExports: {
    startBarcodeCamera: (_video, result) => {
      assert.ok(_video?.isConnected, "camera starts only after its portal video exists");
      scanned = result;
      return () => {
        stops++;
      };
    },
  },
});
const { render, cleanup, fireEvent, waitFor, act } =
  await import("@testing-library/react");
const { BarcodeLookup } = await import("./BarcodeLookup.tsx");
const clients = [];
function mount(s = 1) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const props = {
    s,
    onManualSearch: () => manual++,
    renderProductActions: (p, close) =>
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            close();
            chosen.push(p.id);
          },
        },
        "選擇 " + p.name,
      ),
    renderCreateAction: (barcode, close) =>
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            close();
            chosen.push(barcode);
          },
        },
        "建立 " + barcode,
      ),
  };
  const tree = (s) =>
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(BarcodeLookup, { ...props, s }),
    );
  const view = render(tree(s));
  return { ...view, changeStore: (s) => view.rerender(tree(s)) };
}
const open = (v) =>
  fireEvent.click(v.getByRole("button", { name: "掃碼／精確條碼查詢" }));
const search = (v, code) => {
  fireEvent.change(v.getByLabelText("商品條碼"), { target: { value: code } });
  fireEvent.click(v.getByRole("button", { name: "查詢條碼" }));
};
const product = (id, name = "商品" + id) => ({
  id,
  name,
  barcode: "00123",
  status: "NORMAL",
  storeId: 1,
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  handler = async () => ({ items: [], total: 0 });
  calls = [];
  scanned = undefined;
  stops = 0;
  chosen = [];
  manual = 0;
});
after(() => {
  mock.restoreAll();
  globalThis.React = previousReact;
  for (const [key, descriptor] of dialogGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  restore();
});
test("literal leading zeros and long manual codes preserve strings; Enter prevents parent submit", async () => {
  let submitted = 0;
  const v = mount();
  const wrapper = document.createElement("form");
  v.container.parentNode.insertBefore(wrapper, v.container);
  wrapper.append(v.container);
  wrapper.addEventListener("submit", (e) => {
    e.preventDefault();
    submitted++;
  });
  open(v);
  const code = "00123456789012345678901234";
  fireEvent.change(v.getByLabelText("商品條碼"), { target: { value: code } });
  assert.equal(
    fireEvent.keyDown(v.getByLabelText("商品條碼"), { key: "Enter" }),
    false,
  );
  await v.findByText("找不到此條碼的商品。");
  assert.equal(calls[0].p.exactBarcode, code);
  assert.equal(Object.hasOwn(calls[0].p, "q"), false);
  assert.equal(submitted, 0);
  wrapper.remove();
});
test("single result never selects automatically; explicit action closes", async () => {
  handler = async () => ({ items: [product(1)], total: 1 });
  const v = mount();
  open(v);
  search(v, "00123");
  const button = await v.findByRole("button", { name: "選擇 商品1" });
  assert.deepEqual(chosen, []);
  fireEvent.click(button);
  assert.deepEqual(chosen, [1]);
  assert.equal(v.queryByRole("region"), null);
});
test("25 results remain reachable on page three and use total", async () => {
  handler = async (_s, p) => ({
    items: Array.from({ length: Number(p.page) === 3 ? 1 : 12 }, (_, i) =>
      product((Number(p.page) - 1) * 12 + i + 1),
    ),
    total: 25,
  });
  const v = mount();
  open(v);
  search(v, "00123");
  await v.findByText(/共 25 筆/);
  fireEvent.click(v.getByRole("button", { name: "下一頁候選" }));
  await v.findByRole("button", { name: "選擇 商品13" });
  fireEvent.click(v.getByRole("button", { name: "下一頁候選" }));
  await v.findByRole("button", { name: "選擇 商品25" });
  assert.equal(v.getByRole("button", { name: "下一頁候選" }).disabled, true);
});
test("two candidates use maximum page count and deduplicate displayed IDs", async () => {
  handler = async (_s, p) => ({
    items: [product(Number(p.page))],
    total: p.exactBarcode.length === 12 ? 25 : 13,
  });
  const v = mount();
  open(v);
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  await act(async () =>
    scanned({
      barcode: "123456789012",
      format: "UPC_A",
      candidates: ["123456789012", "0123456789012"],
      requiresPrintedBarcodeConfirmation: true,
    }),
  );
  await v.findByText(/共 38 筆/);
  assert.equal(v.getAllByRole("button", { name: "選擇 商品1" }).length, 1);
  fireEvent.click(v.getByRole("button", { name: "下一頁候選" }));
  await v.findByText("第 2 / 3 頁");
  fireEvent.click(v.getByRole("button", { name: "下一頁候選" }));
  await v.findByText("第 3 / 3 頁");
  assert.equal(calls.filter((c) => c.p.page === "3").length, 2);
});
test("one candidate failure is an error not empty; retry retains input", async () => {
  handler = async (_s, p) => {
    if (p.exactBarcode.startsWith("0")) throw Error("network");
    return { items: [], total: 0 };
  };
  const v = mount();
  open(v);
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  await act(async () =>
    scanned({
      barcode: "123456789012",
      format: "UPC_A",
      candidates: ["123456789012", "0123456789012"],
      requiresPrintedBarcodeConfirmation: true,
    }),
  );
  await v.findByRole("alert");
  assert.equal(v.queryByText("找不到此條碼的商品。"), null);
  assert.equal(v.getByLabelText("商品條碼").value, "123456789012");
  handler = async () => ({ items: [], total: 0 });
  fireEvent.click(v.getByRole("button", { name: "重試條碼查詢" }));
  await v.findByText("找不到此條碼的商品。");
});
test("zero UPC results require printed barcode choice before create", async () => {
  const v = mount();
  open(v);
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  await act(async () =>
    scanned({
      barcode: "123456789012",
      format: "UPC_A",
      candidates: ["123456789012", "0123456789012"],
      requiresPrintedBarcodeConfirmation: true,
    }),
  );
  await v.findByText("找不到此條碼的商品。");
  assert.equal(v.queryByRole("button", { name: /建立 / }), null);
  fireEvent.click(v.getByRole("radio", { name: "0123456789012" }));
  fireEvent.click(v.getByRole("button", { name: "建立 0123456789012" }));
  assert.deepEqual(chosen, ["0123456789012"]);
});
test("Escape closes only lookup and restores trigger focus", () => {
  const v = mount();
  open(v);
  fireEvent.keyDown(v.getByLabelText("商品條碼"), { key: "Escape" });
  assert.equal(v.queryByRole("region"), null);
  assert.equal(
    document.activeElement,
    v.getByRole("button", { name: "掃碼／精確條碼查詢" }),
  );
});
test("late previous query and store results cannot replace new state", async () => {
  let resolve;
  handler = () => new Promise((r) => (resolve = r));
  const v = mount();
  open(v);
  search(v, "00123");
  await waitFor(() => assert.equal(calls.length, 1));
  fireEvent.change(v.getByLabelText("商品條碼"), {
    target: { value: "00456" },
  });
  await act(async () => resolve({ items: [product(99)], total: 1 }));
  assert.equal(v.queryByText("商品99"), null);
  v.changeStore(2);
  assert.equal(v.queryByRole("region"), null);
  open(v);
  assert.equal(v.getByLabelText("商品條碼").value, "");
});
test("modal camera closes before restart and unmount stops its stream", async () => {
  const v = mount();
  open(v);
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  const first = v.getByLabelText("條碼相機");
  assert.ok(v.getByRole("dialog", { name: "掃描商品條碼" }));
  assert.equal(v.queryByRole("button", { name: "查詢條碼" }), null);
  fireEvent.click(v.getByRole("button", { name: "關閉相機" }));
  await waitFor(() =>
    assert.equal(
      document.activeElement,
      v.getByRole("button", { name: "啟動相機" }),
    ),
  );
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  assert.notEqual(v.getByLabelText("條碼相機"), first);
  assert.equal(stops, 1);
  fireEvent.click(v.getByRole("button", { name: "改用手動輸入" }));
  await waitFor(() =>
    assert.equal(document.activeElement, v.getByLabelText("商品條碼")),
  );
  assert.equal(stops, 2);
  assert.equal(v.queryByRole("dialog"), null);
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  v.unmount();
  assert.equal(stops, 3);
});
test("Escape dismisses only the fullscreen camera and preserves lookup input", async () => {
  const v = mount();
  open(v);
  fireEvent.change(v.getByLabelText("商品條碼"), {
    target: { value: "00123" },
  });
  fireEvent.click(v.getByRole("button", { name: "啟動相機" }));
  fireEvent.keyDown(v.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => assert.equal(v.queryByRole("dialog"), null));
  assert.equal(v.getByLabelText("商品條碼").value, "00123");
  assert.equal(stops, 1);
});
