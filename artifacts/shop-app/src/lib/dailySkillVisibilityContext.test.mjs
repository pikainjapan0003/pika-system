import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "../test/domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;
const getToken = async () => "fake-test-token";
let fetchImpl = async () => {
  throw new Error("fetch mock not configured");
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => fetchImpl(...args);

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken }),
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { StoreSkillVisibilityProvider, useDailySkillVisibility } =
  await import("./dailySkillVisibilityContext.tsx");

function response(skills) {
  return {
    ok: true,
    json: async () => ({ skills }),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function VisibilityProbe() {
  const { enabledSkillCount, isVisible, loaded, refresh } =
    useDailySkillVisibility();

  if (!loaded) return React.createElement("div", null, "loading");
  return React.createElement(
    "div",
    null,
    React.createElement("div", null, "children"),
    React.createElement("div", { "data-testid": "count" }, enabledSkillCount),
    React.createElement(
      "div",
      { "data-testid": "customers" },
      isVisible("customers") ? "visible" : "hidden",
    ),
    React.createElement(
      "button",
      { onClick: () => void refresh(), type: "button" },
      "refresh",
    ),
  );
}

function renderProvider() {
  return render(
    React.createElement(
      StoreSkillVisibilityProvider,
      { storeId: 17 },
      React.createElement(VisibilityProbe),
    ),
  );
}

afterEach(() => cleanup());
after(() => {
  globalThis.fetch = originalFetch;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("initial load shows loading before rendering children", async () => {
  const pending = deferred();
  fetchImpl = () => pending.promise;
  const view = renderProvider();

  assert.equal(view.container.textContent, "loading");
  pending.resolve(response([]));
  await waitFor(() => assert.match(view.container.textContent, /children/));
});

test("background refresh keeps previously loaded children visible", async () => {
  const pending = deferred();
  let callCount = 0;
  fetchImpl = () => {
    callCount += 1;
    return callCount === 1 ? response([]) : pending.promise;
  };
  const view = renderProvider();
  await waitFor(() => assert.match(view.container.textContent, /children/));

  fireEvent.click(view.getByText("refresh"));
  assert.match(view.container.textContent, /children/);
  assert.doesNotMatch(view.container.textContent, /loading/);

  pending.resolve(response([]));
  await waitFor(() => assert.equal(callCount, 2));
});

test("an older request cannot overwrite a newer refresh result", async () => {
  const older = deferred();
  const newer = deferred();
  let callCount = 0;
  fetchImpl = () => {
    callCount += 1;
    if (callCount === 1) return response([]);
    return callCount === 2 ? older.promise : newer.promise;
  };
  const view = renderProvider();
  await waitFor(() => assert.match(view.container.textContent, /children/));

  fireEvent.click(view.getByText("refresh"));
  fireEvent.click(view.getByText("refresh"));
  await waitFor(() => assert.equal(callCount, 3));
  newer.resolve(
    response([{ configured: true, enabled: true, skillKey: "S-19" }]),
  );
  await waitFor(() =>
    assert.equal(view.getByTestId("customers").textContent, "visible"),
  );

  older.resolve(
    response([{ configured: true, enabled: false, skillKey: "S-19" }]),
  );
  await Promise.resolve();
  assert.equal(view.getByTestId("customers").textContent, "visible");
});

test("a failed refresh makes advanced surfaces fail closed", async () => {
  let callCount = 0;
  fetchImpl = () => {
    callCount += 1;
    if (callCount === 1) {
      return response([{ configured: true, enabled: true, skillKey: "S-19" }]);
    }
    throw new Error("synthetic network failure");
  };
  const view = renderProvider();
  await waitFor(() =>
    assert.equal(view.getByTestId("customers").textContent, "visible"),
  );

  fireEvent.click(view.getByText("refresh"));
  await waitFor(() =>
    assert.equal(view.getByTestId("customers").textContent, "hidden"),
  );
  assert.match(view.container.textContent, /children/);
});

test("refresh updates the enabled skill count", async () => {
  let callCount = 0;
  fetchImpl = () => {
    callCount += 1;
    return response(
      callCount === 1
        ? []
        : [
            { configured: true, enabled: true, skillKey: "S-19" },
            { configured: true, enabled: true, skillKey: "S-23" },
          ],
    );
  };
  const view = renderProvider();
  await waitFor(() => assert.equal(view.getByTestId("count").textContent, "0"));

  fireEvent.click(view.getByText("refresh"));
  await waitFor(() => assert.equal(view.getByTestId("count").textContent, "2"));
});
