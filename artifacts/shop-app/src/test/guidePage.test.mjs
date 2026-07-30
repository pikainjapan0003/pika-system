import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
globalThis.React = React;

let skills = [];

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
const { DailySkillPageGate, StoreSkillVisibilityProvider } =
  await import("../lib/dailySkillVisibilityContext.tsx");
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
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ skills }),
  });
  return render(
    React.createElement(
      StoreSkillVisibilityProvider,
      { storeId: 1 },
      React.createElement(
        DailySkillPageGate,
        { surface: "guide" },
        React.createElement(GuidePage),
      ),
    ),
  );
}

test("enabled guide gate renders the key operating instructions", async () => {
  skills = [{ skillKey: "S-05", enabled: true, configured: true }];
  const view = renderGuide();

  await waitFor(() => {
    assert.match(view.container.textContent, /快速上手/);
    assert.match(view.container.textContent, /建立商品/);
    assert.match(view.container.textContent, /分享下單連結/);
  });
});

test("disabled guide skill renders the gate card instead of the guide", async () => {
  skills = [{ skillKey: "S-05", enabled: false, configured: true }];
  const view = renderGuide();

  await waitFor(() =>
    assert.match(view.container.textContent, /這項功能尚未開啟/),
  );
  assert.match(view.container.textContent, /前往技能地圖/);
  assert.doesNotMatch(view.container.textContent, /快速上手/);
});
