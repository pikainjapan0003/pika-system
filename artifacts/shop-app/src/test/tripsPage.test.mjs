import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

let route;
let updateRoutePayload;
let createRoutePayload;

function makeRoute(fuelJpy) {
  return {
    id: 11,
    tripId: 1,
    storeId: 1,
    areaTitle: "東京市區",
    startPlace: "上野",
    endPlace: "新宿",
    estQty: 10,
    trainJpy: 100,
    fuelJpy,
    parkingJpy: 200,
    etcJpy: 0,
    cardboardJpy: 0,
    shippingJpy: 0,
    parcelCount: 1,
  };
}

function currentTrips() {
  return [
    {
      id: 1,
      storeId: 1,
      name: "測試行程",
      exchangeRate: null,
      notes: null,
      routes: [route],
    },
  ];
}

mock.module("wouter", {
  namedExports: { useLocation: () => ["/trips", () => undefined] },
});
mock.module("@tanstack/react-query", {
  namedExports: {
    useQueryClient: () => ({ invalidateQueries: () => undefined }),
  },
});
mock.module("@workspace/api-client-react", {
  namedExports: {
    getListTripsQueryKey: () => ["trips"],
    useListTrips: () => ({ data: currentTrips(), isLoading: false }),
    useCreateTrip: () => ({ isPending: false, mutateAsync: async () => ({}) }),
    useUpdateTrip: () => ({ isPending: false, mutateAsync: async () => ({}) }),
    useCreateTripRoute: () => ({
      isPending: false,
      mutateAsync: async (payload) => {
        createRoutePayload = payload;
        return {};
      },
    }),
    useUpdateTripRoute: () => ({
      isPending: false,
      mutateAsync: async (payload) => {
        updateRoutePayload = payload;
        route = { ...route, ...payload.data };
        return {};
      },
    }),
  },
});
mock.module("../pages/Dashboard.tsx", {
  namedExports: {
    BottomNav: () => React.createElement("nav", null, "bottom-nav"),
  },
});
mock.module("../components/ExchangeRateReferenceHint.tsx", {
  namedExports: {
    ExchangeRateReferenceHint: () => null,
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { default: TripsPage } = await import("../pages/Trips.tsx");

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

function findButton(container, text, occurrence = 0) {
  return [...container.querySelectorAll("button")].filter(
    (button) => button.textContent === text,
  )[occurrence];
}

function findInputByLabel(container, text) {
  const label = [...container.querySelectorAll("label")].find(
    (candidate) => candidate.textContent === text,
  );
  return label?.parentElement?.querySelector("input");
}

function setInputValue(input, value) {
  assert.ok(input);
  assert.ok(nativeInputValueSetter);
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  cleanup();
  route = makeRoute(null);
  updateRoutePayload = undefined;
  createRoutePayload = undefined;
});

after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("null fuel displays pending while an actual zero remains zero", () => {
  route = makeRoute(null);
  const pendingView = render(React.createElement(TripsPage));
  assert.match(pendingView.container.textContent, /油資 待確認/);
  assert.doesNotMatch(pendingView.container.textContent, /油資 ¥0/);
  pendingView.unmount();

  route = makeRoute(0);
  const zeroView = render(React.createElement(TripsPage));
  assert.match(zeroView.container.textContent, /油資 ¥0/);
  assert.doesNotMatch(zeroView.container.textContent, /油資 待確認/);
});

test("blank fuel update sends null and stays blank after reload", async () => {
  route = makeRoute(500);
  const firstView = render(React.createElement(TripsPage));
  const routeEditButton = findButton(firstView.container, "編輯", 1);
  assert.ok(routeEditButton);
  fireEvent.click(routeEditButton);

  const fuelInput = findInputByLabel(firstView.container, "油資 (¥)");
  assert.equal(fuelInput?.value, "500");
  setInputValue(fuelInput, "");
  const saveButton = findButton(firstView.container, "儲存");
  assert.ok(saveButton);
  fireEvent.click(saveButton);

  await waitFor(() => assert.ok(updateRoutePayload));
  assert.equal(updateRoutePayload.data.fuelJpy, null);
  firstView.unmount();

  const reloadedView = render(React.createElement(TripsPage));
  assert.match(reloadedView.container.textContent, /油資 待確認/);
  assert.doesNotMatch(reloadedView.container.textContent, /油資 ¥0/);
  fireEvent.click(findButton(reloadedView.container, "編輯", 1));
  assert.equal(findInputByLabel(reloadedView.container, "油資 (¥)")?.value, "");
});

test("blank fuel on create sends an explicit null and shows the fail-closed hint", async () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));
  const addRouteButton = findButton(view.container, "+ 新增路線");
  assert.ok(addRouteButton);
  fireEvent.click(addRouteButton);

  assert.match(
    view.container.textContent,
    /留空＝待確認。系統不會自動填 0，也不會自動推估。/,
  );
  setInputValue(findInputByLabel(view.container, "路線名稱 *"), "大阪市區");
  setInputValue(findInputByLabel(view.container, "起點 *"), "梅田");
  setInputValue(findInputByLabel(view.container, "終點 *"), "難波");
  setInputValue(findInputByLabel(view.container, "預估件數 *"), "3");
  setInputValue(findInputByLabel(view.container, "ETC 費用 (¥) *"), "0");
  const saveButton = findButton(view.container, "儲存");
  assert.ok(saveButton);
  fireEvent.click(saveButton);

  await waitFor(() => assert.ok(createRoutePayload));
  assert.equal(createRoutePayload.data.fuelJpy, null);
});
