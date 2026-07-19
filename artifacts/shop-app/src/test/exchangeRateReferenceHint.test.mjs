import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
  },
});

mock.module("@tanstack/react-query", {
  namedExports: {
    useQuery: () => ({
      data: {
        currency: "JPY",
        quoteCurrency: "TWD",
        side: "spot_sell",
        sources: [
          {
            status: "unavailable",
            sourceId: "bank-of-taiwan",
            sourceName: "臺灣銀行",
            sourceUrl: "https://rate.bot.com.tw/",
            reason: "upstream_unavailable",
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: async () => undefined,
    }),
  },
});

mock.module("@workspace/api-client-react", {
  namedExports: {
    customFetch: async () => {
      throw new Error("customFetch should be owned by the mocked query");
    },
    useGetMyStore: () => ({ data: { id: 17 } }),
  },
});

const { cleanup, render } = await import("@testing-library/react");
const { ExchangeRateReferenceHint } =
  await import("../components/ExchangeRateReferenceHint.tsx");

afterEach(cleanup);

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("an unavailable source is labelled without inventing a zero rate", () => {
  const view = render(
    React.createElement(ExchangeRateReferenceHint, {
      context: "store",
      onApply: () => undefined,
    }),
  );

  const sourceRow = view.getByRole("link", { name: "臺灣銀行" }).parentElement;
  assert.match(sourceRow.textContent, /暫時不可用/);
  assert.doesNotMatch(sourceRow.textContent, /(?:^|\D)0(?:\.0+)?(?:\D|$)/);
  assert.equal(view.queryByRole("button", { name: "套用" }), null);
});

test("the hint says applying a reference still requires an explicit save", () => {
  const view = render(
    React.createElement(ExchangeRateReferenceHint, {
      context: "trip",
      onApply: () => undefined,
    }),
  );

  assert.match(
    view.container.textContent,
    /套用只會填入欄位，仍需按「儲存」才會生效/,
  );
});
