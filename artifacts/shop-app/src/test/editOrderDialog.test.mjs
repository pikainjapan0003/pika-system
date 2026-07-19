import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

const updateCalls = [];

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
  },
});

mock.module("@tanstack/react-query", {
  namedExports: {
    useQueryClient: () => ({
      getQueryData: () => undefined,
      invalidateQueries: () => undefined,
      setQueryData: () => undefined,
    }),
  },
});

mock.module("@workspace/api-client-react", {
  namedExports: {
    getListOrdersQueryKey: (storeId) => ["orders", storeId],
    PaymentMethod: {
      cash: "cash",
      bank_transfer: "bank_transfer",
      line_pay: "line_pay",
      other: "other",
    },
    PaymentStatus: {
      unpaid: "unpaid",
      pending: "pending",
      partially_paid: "partially_paid",
      paid: "paid",
      refunded: "refunded",
      failed: "failed",
    },
    ShippingMethod: {
      self_pickup: "self_pickup",
      convenience_store: "convenience_store",
      home_delivery: "home_delivery",
      other: "other",
    },
    ShippingStatus: {
      not_shipped: "not_shipped",
      preparing: "preparing",
      shipped: "shipped",
      arrived: "arrived",
      picked_up: "picked_up",
      returned: "returned",
      cancelled: "cancelled",
    },
    useUpdateOrder: () => ({
      isPending: false,
      mutateAsync: async (input) => updateCalls.push(input),
    }),
  },
});

mock.module("@/components/RecipientAddressFields", {
  namedExports: {
    RecipientAddressFields: () => null,
  },
});

mock.module("@/components/ManualTrackingSyncPanel", {
  namedExports: {
    ManualTrackingSyncPanel: () => null,
  },
});

mock.module("@/components/ui/sheet", {
  namedExports: {
    Sheet: ({ children, open }) =>
      open ? React.createElement("div", null, children) : null,
    SheetContent: ({ children, onOpenAutoFocus: _ignored, ...props }) =>
      React.createElement("div", props, children),
    SheetClose: ({ children }) => children,
  },
});

mock.module("@/hooks/use-toast", {
  namedExports: {
    toast: () => undefined,
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { EditOrderDialog } = await import("../pages/EditOrderDialog.tsx");

afterEach(() => {
  cleanup();
  updateCalls.length = 0;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

const order = {
  id: 1,
  buyerName: "假客人",
  buyerPhone: "0912000000",
  quantity: 3,
  pickupMethod: "自取",
  notes: null,
  specValues: {},
  unitPrice: "0.1",
  shippingFee: 0,
  paidAmount: 0,
  discountAmount: 0,
  discountNote: null,
  paymentMethod: null,
  paymentStatus: "unpaid",
  paymentNote: null,
  shippingMethod: "self_pickup",
  shippingStatus: "not_shipped",
  recipientName: null,
  recipientPhone: null,
  recipientAddress: null,
  storeCode: null,
  storeName: null,
  trackingCode: null,
  trackingProvider: null,
  shippingNote: null,
  internalNote: null,
  cvsStoreAddress: null,
  cvsStorePhone: null,
  storeSelectedBy: null,
  shipmentTracking: null,
};

function renderDialog() {
  return render(
    React.createElement(EditOrderDialog, {
      order,
      storeId: 1,
      open: true,
      onClose: () => undefined,
    }),
  );
}

test("the rendered money preview shows exact 0.1 times 3 as NT$0.3", async () => {
  const view = renderDialog();

  await waitFor(() =>
    assert.match(view.container.textContent, /NT\$0\.1 × 3 = NT\$0\.3/),
  );
});

test("an excessive discount displays the existing validation message", async () => {
  const view = renderDialog();
  const discountInput = view.getByPlaceholderText("例如：50");
  fireEvent.change(discountInput, { target: { value: "1" } });
  fireEvent.click(view.getByRole("button", { name: "儲存變更" }));

  await waitFor(() =>
    assert.match(view.container.textContent, /折讓金額不可超過商品小計加運費/),
  );
  assert.equal(updateCalls.length, 0);
});
