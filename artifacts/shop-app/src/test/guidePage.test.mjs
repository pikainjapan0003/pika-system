import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
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
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

function renderGuide() {
  return render(React.createElement(GuidePage));
}

test("guide renders the key operating instructions", async () => {
  const view = renderGuide();

  await waitFor(() => {
    assert.match(view.container.textContent, /快速上手/);
    assert.match(view.container.textContent, /建立商品/);
    assert.match(view.container.textContent, /分享下單連結/);
  });
});

test("guide remains directly available without a feature gate", async () => {
  const view = renderGuide();

  await waitFor(() => assert.match(view.container.textContent, /快速上手/));
  assert.doesNotMatch(view.container.textContent, /這項功能尚未開啟/);
});
