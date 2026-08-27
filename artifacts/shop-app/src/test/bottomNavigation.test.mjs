import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;
let navigatedTo;

mock.module("wouter", {
  namedExports: {
    useLocation: () => [
      "/dashboard",
      (path) => {
        navigatedTo = path;
      },
    ],
  },
});

const { cleanup, fireEvent, render, within } =
  await import("@testing-library/react");
const { BottomNavigation } = await import("../components/BottomNavigation.tsx");

afterEach(() => {
  cleanup();
  navigatedTo = undefined;
});

after(() => {
  mock.restoreAll();
  globalThis.React = originalReact;
  restoreDom();
});

test("renders the canonical five-item navigation and opens KPI directly", () => {
  const view = render(
    React.createElement(BottomNavigation, { active: "home" }),
  );
  const navigation = view.getByRole("navigation", { name: "主要導覽" });
  const controls = within(navigation).getAllByRole("button");

  assert.equal(controls.length, 5);
  assert.deepEqual(
    controls.map((control) => control.getAttribute("aria-label")),
    ["首頁", "KPI", "商品", "訂單", "更多"],
  );
  assert.equal(
    within(navigation)
      .getByRole("button", { name: "首頁" })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    within(navigation)
      .getByRole("button", { name: "KPI" })
      .hasAttribute("aria-current"),
    false,
  );

  fireEvent.click(within(navigation).getByRole("button", { name: "KPI" }));
  assert.equal(navigatedTo, "/reports/monthly-profit?view=kpi");
});
