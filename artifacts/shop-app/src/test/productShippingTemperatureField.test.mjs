import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ProductShippingTemperatureField } =
  await import("../lib/ProductShippingTemperatureField.tsx");

afterEach(cleanup);
after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("shipping temperature starts fail-closed with no option configured", () => {
  const view = render(
    React.createElement(ProductShippingTemperatureField, {
      value: null,
      onChange: () => undefined,
    }),
  );

  assert.equal(
    view.getByRole("button", { name: "未設定" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    view.getByRole("button", { name: "常溫" }).getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    view.getByRole("button", { name: "冷凍" }).getAttribute("aria-pressed"),
    "false",
  );
  assert.match(view.container.textContent, /未設定時該商品無法匯出/);
});

test("shipping temperature reports the selected controlled value", () => {
  const changes = [];
  const view = render(
    React.createElement(ProductShippingTemperatureField, {
      value: "normal",
      onChange: (value) => changes.push(value),
    }),
  );

  fireEvent.click(view.getByRole("button", { name: "冷凍" }));
  fireEvent.click(view.getByRole("button", { name: "未設定" }));

  assert.deepEqual(changes, ["frozen", null]);
});
