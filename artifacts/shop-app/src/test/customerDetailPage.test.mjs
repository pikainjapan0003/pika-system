import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
globalThis.React = React;

const auditCalls = [];
let payload;

mock.module("@clerk/react", {
  namedExports: { useAuth: () => ({ getToken: async () => "fake-token" }) },
});
mock.module("wouter", {
  namedExports: { useLocation: () => ["/customers/1", () => undefined] },
});
mock.module("@workspace/api-client-react", {
  namedExports: { useGetMyStore: () => ({ data: { id: 1 } }) },
});
mock.module("@/lib/serverAudit", {
  namedExports: {
    recordServerAuditEvent: async (input) => {
      auditCalls.push(input);
    },
  },
});
mock.module("../components/BottomNavigation.tsx", {
  namedExports: { BottomNavigation: () => React.createElement("nav", null) },
});
mock.module("../lib/CustomerStoreCreditPanel.tsx", {
  namedExports: { CustomerStoreCreditPanel: () => null },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { default: CustomerDetailPage } =
  await import("../pages/CustomerDetail.tsx");

function makePayload(overrides = {}) {
  return {
    customer: {
      id: 1,
      storeId: 1,
      code: "C001",
      name: "Alice",
      phone: "0912345678",
      tier: "vip",
      cvsStoreId: "123456",
      cvsStoreName: "Demo Store",
      cvsStoreAddress: "Taipei City",
      cvsStorePhone: "0200000000",
      notes: "demo",
    },
    orders: [
      {
        id: 10,
        productName: "Demo item",
        quantity: 1,
        status: "completed",
        createdAt: "2026-08-01T00:00:00.000Z",
        profit: {
          status: "captured",
          label: "Captured",
          amountTwd: "186.5533465",
          scope: "unit",
        },
      },
    ],
    ...overrides,
  };
}

function installFetch() {
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "PATCH") return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => payload };
  };
}

async function renderDetail() {
  installFetch();
  const view = render(
    React.createElement(CustomerDetailPage, { customerId: 1 }),
  );
  await waitFor(() =>
    assert.equal(view.container.querySelector("h2")?.textContent, "A*e"),
  );
  return view;
}

afterEach(() => {
  cleanup();
  payload = undefined;
  auditCalls.length = 0;
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("customer detail masks personal data by default", async () => {
  payload = makePayload();
  const view = await renderDetail();

  assert.doesNotMatch(view.container.textContent, /Alice/);
  assert.doesNotMatch(view.container.textContent, /0912345678/);
  assert.match(view.container.textContent, /0912\*\*\*678/);
});

test("customer order history keeps captured and pending states distinct", async () => {
  payload = makePayload({
    orders: [
      makePayload().orders[0],
      {
        id: 11,
        productName: "Pending item",
        quantity: 2,
        status: "pending",
        createdAt: "2026-08-01T00:00:00.000Z",
        profit: {
          status: "pending",
          label: "Pending confirmation",
          amountTwd: null,
          scope: "unit",
        },
      },
      {
        id: 12,
        productName: "Legacy item",
        quantity: 1,
        status: "pending",
        createdAt: "2026-08-01T00:00:00.000Z",
        profit: {
          status: "missing",
          label: "No snapshot",
          amountTwd: null,
          scope: "unit",
        },
      },
    ],
  });
  const view = await renderDetail();

  assert.match(view.container.textContent, /Captured/);
  assert.match(view.container.textContent, /Pending confirmation/);
  assert.match(view.container.textContent, /No snapshot/);
  assert.match(view.container.textContent, /186\.5533465/);
  assert.doesNotMatch(
    view.container.textContent,
    /Pending confirmation.*NT\$/s,
  );
});

test("exempt order history shows its explicit status and amount", async () => {
  payload = makePayload({
    orders: [
      {
        id: 13,
        productName: "Exempt item",
        quantity: 1,
        status: "completed",
        createdAt: "2026-08-01T00:00:00.000Z",
        profit: {
          status: "exempt",
          label: "Exempt",
          amountTwd: "220",
          scope: "unit",
        },
      },
    ],
  });
  const view = await renderDetail();

  assert.match(view.container.textContent, /Exempt/);
  assert.match(view.container.textContent, /220/);
});

test("revealing customer data records an audit event before showing it", async () => {
  payload = makePayload();
  const view = await renderDetail();
  const revealButton = view.container.querySelector("main section button");
  assert.ok(revealButton);

  fireEvent.click(revealButton);
  await waitFor(() => assert.match(view.container.textContent, /Alice/));
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].storeId, 1);
  assert.equal(auditCalls[0].action, "reveal_customer_pii");
  assert.equal(auditCalls[0].target, "customer:1");
});
