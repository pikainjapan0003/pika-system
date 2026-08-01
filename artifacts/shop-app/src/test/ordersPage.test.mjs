import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

const updateCalls = [];
let orders = [];

mock.module("@clerk/react", {
  namedExports: { useAuth: () => ({ getToken: async () => "fake-token" }) },
});
mock.module("wouter", {
  namedExports: { useLocation: () => ["/orders", () => undefined] },
});
mock.module("@tanstack/react-query", {
  namedExports: {
    useQueryClient: () => ({ invalidateQueries: () => undefined }),
  },
});
mock.module("@workspace/api-client-react", {
  namedExports: {
    getListOrdersQueryKey: (storeId) => ["orders", storeId],
    useGetMyStore: () => ({ data: { id: 1, name: "Test store" } }),
    useListOrders: () => ({ data: orders, isLoading: false }),
    useUpdateOrderStatus: () => ({
      mutateAsync: async (input) => updateCalls.push(input),
    }),
    useBulkUpdateOrders: () => ({ mutateAsync: async () => ({}) }),
    useGetPickingList: () => ({ mutateAsync: async () => ({}) }),
    useGetShippingList: () => ({ mutateAsync: async () => ({}) }),
  },
});
mock.module("../pages/Dashboard.tsx", {
  namedExports: {
    BottomNav: () => React.createElement("nav", null, "bottom-nav"),
  },
});
mock.module("../pages/CreateOrderDialog.tsx", {
  namedExports: { CreateOrderDialog: () => null },
});
mock.module("../pages/EditOrderDialog.tsx", {
  namedExports: { EditOrderDialog: () => null },
});
mock.module("../pages/PickingListDialog.tsx", {
  namedExports: { PickingListDialog: () => null },
});
mock.module("../pages/ShippingListDialog.tsx", {
  namedExports: { ShippingListDialog: () => null },
});
mock.module("../lib/dailySkillVisibilityContext.tsx", {
  namedExports: {
    useDailySkillVisibility: () => ({ isVisible: () => true }),
  },
});
mock.module("../lib/MaihuobianExportPanel.tsx", {
  namedExports: { MaihuobianExportPanel: () => null },
});
mock.module("@/hooks/use-toast", {
  namedExports: { toast: () => undefined },
});
mock.module("@/lib/serverAudit", {
  namedExports: { recordServerAuditEvent: async () => undefined },
});
mock.module("@/components/ui/alert-dialog", {
  namedExports: {
    AlertDialog: ({ children, open }) =>
      open ? React.createElement("div", null, children) : null,
    AlertDialogContent: ({ children }) =>
      React.createElement("div", null, children),
    AlertDialogHeader: ({ children }) =>
      React.createElement("div", null, children),
    AlertDialogFooter: ({ children }) =>
      React.createElement("div", null, children),
    AlertDialogTitle: ({ children }) =>
      React.createElement("div", null, children),
    AlertDialogDescription: ({ children }) =>
      React.createElement("div", null, children),
    AlertDialogAction: ({ children, onClick }) =>
      React.createElement("button", { onClick }, children),
    AlertDialogCancel: ({ children, onClick }) =>
      React.createElement("button", { onClick }, children),
  },
});
mock.module("@/components/ui/button", {
  namedExports: { buttonVariants: () => "button" },
});

const {
  cleanup,
  fireEvent,
  getAllByRole,
  getAllByText,
  getByRole,
  getByText,
  render,
  waitFor,
} = await import("@testing-library/react");
const { STATUS_LABELS } = await import("../lib/orderStatus.ts");
const { default: OrdersPage } = await import("../pages/Orders.tsx");

function makeOrder(overrides = {}) {
  return {
    id: 1,
    buyerName: "王小明",
    buyerPhone: "0912345678",
    productName: "商品 A",
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    shippingFee: 20,
    orderTotal: 120,
    pickupMethod: "自取",
    status: "pending",
    shippingStatus: "not_shipped",
    createdAt: "2026-08-01T00:00:00.000Z",
    publicToken: "public-token",
    specValues: {},
    notes: null,
    ...overrides,
  };
}

function renderOrders(nextOrders) {
  orders = nextOrders;
  return render(React.createElement(OrdersPage));
}

afterEach(() => {
  cleanup();
  orders = [];
  updateCalls.length = 0;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("status filter only shows orders in the selected state", async () => {
  const view = renderOrders([
    makeOrder({ id: 1, productName: "待處理商品", status: "pending" }),
    makeOrder({ id: 2, productName: "已出貨商品", status: "shipped" }),
  ]);

  await waitFor(() => assert.match(view.container.textContent, /待處理商品/));
  assert.match(view.container.textContent, /已出貨商品/);
  fireEvent.click(
    getByRole(view.container, "button", {
      name: new RegExp(STATUS_LABELS.shipped),
    }),
  );
  await waitFor(() => {
    assert.doesNotMatch(view.container.textContent, /待處理商品/);
    assert.match(view.container.textContent, /已出貨商品/);
  });
});

test("status update sends PATCH input and terminal changes require confirmation", async () => {
  const view = renderOrders([makeOrder({ status: "completed" })]);
  await waitFor(() => assert.match(view.container.textContent, /商品 A/));
  fireEvent.click(getByText(view.container, "#1"));
  const pendingButtons = getAllByRole(view.container, "button", {
    name: STATUS_LABELS.pending,
  });
  fireEvent.click(pendingButtons[pendingButtons.length - 1]);
  assert.equal(updateCalls.length, 0);
  assert.ok(getByRole(view.container, "button", { name: "確認變更" }));
  fireEvent.click(getByRole(view.container, "button", { name: "確認變更" }));
  await waitFor(() =>
    assert.deepEqual(updateCalls, [
      { orderId: 1, data: { status: "pending" } },
    ]),
  );
});

test("order card amount uses totalPrice plus shipping when orderTotal is missing", async () => {
  const view = renderOrders([
    makeOrder({ orderTotal: null, totalPrice: 100, shippingFee: 20 }),
  ]);
  await waitFor(() =>
    assert.ok(getAllByText(view.container, "NT$120").length >= 2),
  );
  assert.equal(getAllByRole(view.container, "button").length > 0, true);
});
