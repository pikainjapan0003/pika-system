import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
globalThis.React = React;

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
  },
});

mock.module("wouter", {
  namedExports: {
    useLocation: () => ["/guide", () => undefined],
  },
});

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { default: GuidePage } = await import("../pages/Guide.tsx");

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function renderGuide() {
  globalThis.fetch = async () => { throw new Error("Guide must not request skill state"); };
  return render(React.createElement(GuidePage));
}

test("guide directly renders the key operating instructions", async () => {
  const view = renderGuide();

  await waitFor(() => {
    assert.match(view.container.textContent, /快速上手/);
    assert.match(view.container.textContent, /建立商品/);
    assert.match(view.container.textContent, /分享下單連結/);
  });
});
