import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "../test/domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
const originalFetch = globalThis.fetch;
globalThis.React = React;
let fetchImpl = async () => ({ ok: true, json: async () => ({ skills: [] }) });
globalThis.fetch = (...args) => fetchImpl(...args);

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-test-token" }),
    useClerk: () => ({ signOut: async () => undefined }),
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { DailySkillPageGate, StoreSkillVisibilityProvider } =
  await import("./dailySkillVisibilityContext.tsx");
const { BottomNav } = await import("../pages/Dashboard.tsx");

function response(skills) {
  return { ok: true, json: async () => ({ skills }) };
}

function renderWithProvider(child) {
  return render(
    React.createElement(StoreSkillVisibilityProvider, { storeId: 17 }, child),
  );
}

function customerGate() {
  return React.createElement(
    DailySkillPageGate,
    { surface: "customers" },
    React.createElement("div", null, "protected children"),
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("gate renders a spinner while visibility is not loaded", () => {
  fetchImpl = () => new Promise(() => undefined);
  const view = renderWithProvider(customerGate());

  assert.ok(view.container.querySelector(".animate-spin"));
  assert.doesNotMatch(view.container.textContent, /protected children/);
});

test("gate blocks a hidden surface and links to the skill map", async () => {
  fetchImpl = async () => response([]);
  const view = renderWithProvider(customerGate());
  await waitFor(() => assert.ok(view.container.querySelector("button")));

  assert.doesNotMatch(view.container.textContent, /protected children/);
  fireEvent.click(view.container.querySelector("button"));
  assert.equal(window.location.pathname, "/skill-map");
});

test("gate renders children when the surface is enabled", async () => {
  fetchImpl = async () =>
    response([{ configured: true, enabled: true, skillKey: "S-19" }]);
  const view = renderWithProvider(customerGate());

  await waitFor(() =>
    assert.match(view.container.textContent, /protected children/),
  );
});

test("BottomNav hides explicitly disabled product and order surfaces", async () => {
  fetchImpl = async () =>
    response([
      { configured: true, enabled: false, skillKey: "S-01" },
      { configured: true, enabled: false, skillKey: "S-04" },
    ]);
  const view = renderWithProvider(
    React.createElement(BottomNav, { active: "dashboard" }),
  );

  await waitFor(() =>
    assert.equal(view.container.querySelectorAll("nav button").length, 2),
  );
});

test("BottomNav shows a surface again when its skill is enabled", async () => {
  fetchImpl = async () =>
    response([
      { configured: true, enabled: true, skillKey: "S-01" },
      { configured: true, enabled: false, skillKey: "S-04" },
    ]);
  const view = renderWithProvider(
    React.createElement(BottomNav, { active: "dashboard" }),
  );

  await waitFor(() =>
    assert.equal(view.container.querySelectorAll("nav button").length, 3),
  );
});
