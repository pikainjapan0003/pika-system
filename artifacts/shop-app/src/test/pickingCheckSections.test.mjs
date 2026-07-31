import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { PickingCheckSections } =
  await import("../lib/PickingCheckSections.tsx");

afterEach(cleanup);
after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

const unchecked = {
  orderId: 1,
  itemKey: "single:fake",
  productName: "假商品 A",
  specLabel: "顏色: 粉",
  quantity: 2,
  checked: false,
  checkedAt: null,
  readOnly: false,
};
const checked = {
  ...unchecked,
  orderId: 2,
  itemKey: "single:checked",
  productName: "假商品 B",
  checked: true,
  checkedAt: "2026-07-31T00:00:00.000Z",
};

test("items are separated into unchecked and checked sections", () => {
  const view = render(
    React.createElement(PickingCheckSections, {
      items: [unchecked, checked],
      pendingKey: null,
      onToggle: () => undefined,
    }),
  );
  assert.ok(view.getByText("未包（1）"));
  assert.ok(view.getByText("已包（1）"));
  assert.ok(view.getByText("假商品 A"));
  assert.ok(view.getByText("假商品 B"));
});

test("an editable item calls the toggle handler", () => {
  const calls = [];
  const view = render(
    React.createElement(PickingCheckSections, {
      items: [unchecked],
      pendingKey: null,
      onToggle: (item) => calls.push(item.itemKey),
    }),
  );
  fireEvent.click(view.getByRole("button", { name: /標記已包/ }));
  assert.deepEqual(calls, ["single:fake"]);
});

test("a shipped read-only item cannot be toggled", () => {
  const calls = [];
  const view = render(
    React.createElement(PickingCheckSections, {
      items: [{ ...checked, readOnly: true }],
      pendingKey: null,
      onToggle: (item) => calls.push(item.itemKey),
    }),
  );
  const button = view.getByRole("button", { name: /取消已包/ });
  assert.equal(button.disabled, true);
  fireEvent.click(button);
  assert.deepEqual(calls, []);
  assert.ok(view.getByText("已出貨，勾選紀錄僅供查看"));
});
