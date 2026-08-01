import assert from "node:assert/strict";
import { after, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

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
    useGetMyStore: () => ({ data: { id: 1, name: "Probe store" } }),
    useListOrders: () => ({ data: [], isLoading: false }),
    useUpdateOrderStatus: () => ({ mutateAsync: async () => undefined }),
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
    AlertDialog: ({ children }) => React.createElement("div", null, children),
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
    AlertDialogAction: ({ children }) =>
      React.createElement("button", null, children),
    AlertDialogCancel: ({ children }) =>
      React.createElement("button", null, children),
  },
});
mock.module("@/components/ui/button", {
  namedExports: { buttonVariants: () => "button" },
});

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { default: OrdersPage } = await import("../pages/Orders.tsx");

test("Orders probe renders through the test environment loader", async () => {
  const view = render(React.createElement(OrdersPage));
  await waitFor(() => assert.match(view.container.textContent, /訂單管理/));
  assert.match(view.container.textContent, /沒有訂單/);
});

after(() => {
  cleanup();
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});
