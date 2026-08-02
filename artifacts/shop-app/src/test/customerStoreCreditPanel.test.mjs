import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalFetch = globalThis.fetch;
const originalReact = globalThis.React;
globalThis.React = React;

const requests = [];
let currentData;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function resetData() {
  currentData = {
    balance: "100.000000000000",
    transactions: [
      {
        id: 1,
        direction: "credit",
        type: "grant",
        amount: "100.000000000000",
        reasonCode: "welcome",
        note: "synthetic",
        createdAt: "2026-07-31T00:00:00.000Z",
      },
    ],
    total: 1,
  };
}

globalThis.fetch = async (input, init = {}) => {
  const request = { url: String(input), init };
  requests.push(request);
  if ((init.method ?? "GET") === "POST") {
    currentData = {
      balance: "120.000000000000",
      transactions: [
        {
          id: 2,
          direction: "credit",
          type: "grant",
          amount: "20.000000000000",
          reasonCode: "service",
          note: null,
          createdAt: "2026-07-31T01:00:00.000Z",
        },
        ...currentData.transactions,
      ],
      total: 2,
    };
    return jsonResponse(
      {
        balance: currentData.balance,
        idempotent: false,
        transaction: currentData.transactions[0],
      },
      201,
    );
  }
  return jsonResponse(currentData);
};

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { CustomerStoreCreditPanel } =
  await import("../lib/CustomerStoreCreditPanel.tsx");

const getToken = async () => "fake-token";

afterEach(() => {
  cleanup();
  requests.length = 0;
  resetData();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

resetData();

async function renderLoaded(expectedBalance = /NT\$100/) {
  const view = render(
    React.createElement(CustomerStoreCreditPanel, {
      storeId: 1,
      customerId: 2,
      getToken,
    }),
  );
  await waitFor(() =>
    assert.match(view.container.textContent, expectedBalance),
  );
  return view;
}

function fillMutation(view, { type = "grant", amount = "20" } = {}) {
  fireEvent.change(view.getByLabelText("購物金變更類型"), {
    target: { value: type },
  });
  fireEvent.change(view.getByLabelText("購物金變更金額"), {
    target: { value: amount },
  });
  fireEvent.change(view.getByLabelText("購物金原因代碼"), {
    target: { value: "service" },
  });
}

test("shows the exact ledger as an owner-facing balance and transaction list", async () => {
  const view = await renderLoaded();

  assert.match(view.container.textContent, /購物金餘額/);
  assert.match(view.container.textContent, /發放/);
  assert.match(view.container.textContent, /\+NT\$100/);
  assert.match(view.container.textContent, /welcome/);
});

test("formats 5000 TWD with a thousands separator", async () => {
  currentData = {
    balance: "5000.000000000000",
    transactions: [
      {
        ...currentData.transactions[0],
        amount: "5000.000000000000",
      },
    ],
    total: 1,
  };
  const view = await renderLoaded(/NT\$5,000/);

  assert.match(view.container.textContent, /NT\$5,000/);
  assert.match(view.container.textContent, /\+NT\$5,000/);
});

test("keeps large exact TWD strings precise while adding separators", async () => {
  currentData = {
    balance: "9007199254740993.000000000000",
    transactions: [
      {
        ...currentData.transactions[0],
        amount: "9007199254740993.000000000000",
      },
    ],
    total: 1,
  };
  const view = await renderLoaded(/NT\$9,007,199,254,740,993/);

  assert.match(view.container.textContent, /NT\$9,007,199,254,740,993/);
  assert.match(view.container.textContent, /\+NT\$9,007,199,254,740,993/);
});

test("preview opens the second confirmation without sending a mutation header", async () => {
  const view = await renderLoaded();
  requests.length = 0;
  fillMutation(view);
  fireEvent.click(view.getByRole("button", { name: "預覽並確認" }));

  assert.ok(view.getByRole("dialog", { name: "確認購物金變更" }));
  assert.equal(
    requests.some((request) => request.init.method === "POST"),
    false,
  );
  assert.equal(
    requests.some(
      (request) => request.init.headers?.["x-confirm-store-credit"] === "true",
    ),
    false,
  );
});

test("a negative adjustment that exceeds the balance is blocked before POST", async () => {
  const view = await renderLoaded();
  requests.length = 0;
  fillMutation(view, { type: "adjust", amount: "-100.000000000001" });

  assert.match(view.container.textContent, /exceeds available balance/);
  assert.equal(view.getByRole("button", { name: "預覽並確認" }).disabled, true);
  assert.equal(
    requests.some((request) => request.init.method === "POST"),
    false,
  );
});

test("confirmed mutation sends the header and refreshes balance and ledger", async () => {
  const view = await renderLoaded();
  requests.length = 0;
  fillMutation(view);
  fireEvent.click(view.getByRole("button", { name: "預覽並確認" }));
  fireEvent.click(view.getByRole("button", { name: "確認變更" }));

  await waitFor(() => assert.match(view.container.textContent, /NT\$120/));
  const post = requests.find((request) => request.init.method === "POST");
  assert.ok(post);
  assert.equal(post.init.headers["x-confirm-store-credit"], "true");
  assert.deepEqual(
    {
      ...JSON.parse(post.init.body),
      idempotencyKey: "<generated>",
    },
    {
      type: "grant",
      amount: "20",
      reasonCode: "service",
      idempotencyKey: "<generated>",
    },
  );
  assert.match(view.container.textContent, /\+NT\$20/);
});
