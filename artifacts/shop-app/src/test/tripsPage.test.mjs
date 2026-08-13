import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";
import "./registerAssetLoader.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;

let route;
let areas;
let store = { id: 1 };
let updateRoutePayload;
let createRoutePayload;
let createAreaPayload;
let updateAreaPayload;

function makeRoute(fuelJpy) {
  return {
    id: 11,
    tripId: 1,
    storeId: 1,
    tripAreaId: 21,
    areaTitle: "東京市區",
    startPlace: "上野",
    endPlace: "新宿",
    estQty: 10,
    trainJpy: 100,
    fuelJpy,
    parkingJpy: 200,
    etcJpy: 0,
    cardboardJpy: 901,
    shippingJpy: 902,
    parcelCount: 903,
  };
}

function makeAreas() {
  return [
    {
      id: 21,
      tripId: 1,
      name: "東京境內運",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      costs: [
        {
          id: 31,
          tripAreaId: 21,
          mode: "ESTIMATE",
          cardboardUnitJpy: 340,
          shippingUnitJpy: 2310,
          parcelCount: 3,
          estimatedItemQuantity: 465,
          createdAt: "2026-08-12T00:00:00.000Z",
          updatedAt: "2026-08-12T00:00:00.000Z",
        },
      ],
    },
  ];
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
    useGetMyStore: () => ({ data: store }),
    getListTripsQueryKey: () => ["trips"],
    getListTripAreasQueryKey: (storeId, tripId) => [
      "trip-areas",
      storeId,
      tripId,
    ],
    useListTrips: () => ({ data: currentTrips(), isLoading: false }),
    useListTripAreas: () => ({ data: areas, isLoading: false }),
    useCreateTrip: () => ({ isPending: false, mutateAsync: async () => ({}) }),
    useUpdateTrip: () => ({ isPending: false, mutateAsync: async () => ({}) }),
    useCreateTripArea: () => ({
      isPending: false,
      mutateAsync: async (payload) => {
        createAreaPayload = payload;
        return {};
      },
    }),
    useUpdateTripArea: () => ({
      isPending: false,
      mutateAsync: async (payload) => {
        updateAreaPayload = payload;
        return {};
      },
    }),
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
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype,
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

function findSelectByLabel(container, text) {
  return [...container.querySelectorAll("select")].find(
    (select) => select.getAttribute("aria-label") === text,
  );
}

function setInputValue(input, value) {
  assert.ok(input);
  assert.ok(nativeInputValueSetter);
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select, value) {
  assert.ok(select);
  assert.ok(nativeSelectValueSetter);
  nativeSelectValueSetter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(() => {
  cleanup();
  route = makeRoute(null);
  areas = makeAreas();
  store = { id: 1 };
  updateRoutePayload = undefined;
  createRoutePayload = undefined;
  createAreaPayload = undefined;
  updateAreaPayload = undefined;
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

test("area controls stay unavailable until the owned store id is loaded", () => {
  store = undefined;
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));

  assert.equal(findButton(view.container, "+ 新增大區"), undefined);
  assert.equal(findButton(view.container, "+ 新增路線"), undefined);
});

test("area rows display their estimate values and create sends an actual-mode payload", async () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));

  assert.match(
    view.container.textContent,
    /東京境內運.*預估.*每箱紙板 ¥340.*每箱境內運 ¥2310.*3 箱.*465/su,
  );

  const addAreaButton = findButton(view.container, "+ 新增大區");
  assert.ok(addAreaButton);
  fireEvent.click(addAreaButton);
  setInputValue(findInputByLabel(view.container, "大區名稱 *"), "北海道境內運");
  setSelectValue(findSelectByLabel(view.container, "成本模式"), "ACTUAL");
  setInputValue(findInputByLabel(view.container, "每箱紙板單價 (¥)"), "340");
  setInputValue(findInputByLabel(view.container, "每箱境內運費 (¥)"), "3068");
  setInputValue(findInputByLabel(view.container, "箱數"), "3");
  setInputValue(findInputByLabel(view.container, "預計商品數"), "605");
  fireEvent.click(findButton(view.container, "儲存大區"));

  await waitFor(() => assert.ok(createAreaPayload));
  assert.deepEqual(createAreaPayload, {
    storeId: 1,
    tripId: 1,
    data: {
      name: "北海道境內運",
      mode: "ACTUAL",
      cardboardUnitJpy: 340,
      shippingUnitJpy: 3068,
      parcelCount: 3,
      estimatedItemQuantity: 605,
    },
  });
});

test("adding an actual cost to an existing area updates that parent instead of creating another", async () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));

  fireEvent.click(findButton(view.container, "+ 實際"));
  assert.equal(
    findInputByLabel(view.container, "大區名稱 *")?.value,
    "東京境內運",
  );
  assert.equal(findSelectByLabel(view.container, "成本模式")?.value, "ACTUAL");
  setInputValue(findInputByLabel(view.container, "每箱紙板單價 (¥)"), "350");
  setInputValue(findInputByLabel(view.container, "每箱境內運費 (¥)"), "2500");
  setInputValue(findInputByLabel(view.container, "箱數"), "4");
  setInputValue(findInputByLabel(view.container, "預計商品數"), "470");
  fireEvent.click(findButton(view.container, "儲存大區"));

  await waitFor(() => assert.ok(updateAreaPayload));
  assert.equal(createAreaPayload, undefined);
  assert.deepEqual(updateAreaPayload, {
    storeId: 1,
    tripId: 1,
    areaId: 21,
    data: {
      name: "東京境內運",
      mode: "ACTUAL",
      cardboardUnitJpy: 350,
      shippingUnitJpy: 2500,
      parcelCount: 4,
      estimatedItemQuantity: 470,
    },
  });
});

test("collapsed route summary hides legacy domestic-shipping fields even when they are nonzero", () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));

  assert.doesNotMatch(view.container.textContent, /紙箱費/u);
  assert.doesNotMatch(view.container.textContent, /日本境內運費/u);
  assert.doesNotMatch(view.container.textContent, /包裹/u);
  assert.doesNotMatch(view.container.textContent, /901|902|903/u);
});

test("editing an area upserts the selected mode without changing its identity", async () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));

  fireEvent.click(findButton(view.container, "編輯預估"));
  setInputValue(findInputByLabel(view.container, "每箱境內運費 (¥)"), "2400");
  fireEvent.click(findButton(view.container, "儲存大區"));

  await waitFor(() => assert.ok(updateAreaPayload));
  assert.deepEqual(updateAreaPayload, {
    storeId: 1,
    tripId: 1,
    areaId: 21,
    data: {
      name: "東京境內運",
      mode: "ESTIMATE",
      cardboardUnitJpy: 340,
      shippingUnitJpy: 2400,
      parcelCount: 3,
      estimatedItemQuantity: 465,
    },
  });
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
  assert.equal(updateRoutePayload.data.tripAreaId, 21);
  assert.equal("cardboardJpy" in updateRoutePayload.data, false);
  assert.equal("shippingJpy" in updateRoutePayload.data, false);
  assert.equal("parcelCount" in updateRoutePayload.data, false);
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

  assert.equal(findInputByLabel(view.container, "紙箱費 (¥)"), undefined);
  assert.equal(findInputByLabel(view.container, "日本境內運費 (¥)"), undefined);
  assert.equal(findInputByLabel(view.container, "包裹數"), undefined);

  assert.match(
    view.container.textContent,
    /留空＝待確認。系統不會自動填 0，也不會自動推估。/,
  );
  setInputValue(findInputByLabel(view.container, "路線名稱 *"), "大阪市區");
  setInputValue(findInputByLabel(view.container, "起點 *"), "梅田");
  setInputValue(findInputByLabel(view.container, "終點 *"), "難波");
  setInputValue(findInputByLabel(view.container, "預估件數 *"), "3");
  setInputValue(findInputByLabel(view.container, "ETC 費用 (¥) *"), "0");
  setSelectValue(findSelectByLabel(view.container, "所屬大區"), "21");
  const saveButton = findButton(view.container, "儲存");
  assert.ok(saveButton);
  fireEvent.click(saveButton);

  await waitFor(() => assert.ok(createRoutePayload));
  assert.equal(createRoutePayload.data.fuelJpy, null);
  assert.equal(createRoutePayload.data.tripAreaId, 21);
  assert.equal("cardboardJpy" in createRoutePayload.data, false);
  assert.equal("shippingJpy" in createRoutePayload.data, false);
  assert.equal("parcelCount" in createRoutePayload.data, false);
});

test("route area selection can be cleared to an explicit null", async () => {
  route = makeRoute(0);
  const view = render(React.createElement(TripsPage));
  assert.match(view.container.textContent, /所屬大區：東京境內運/u);

  fireEvent.click(findButton(view.container, "編輯", 1));
  const areaSelect = findSelectByLabel(view.container, "所屬大區");
  assert.equal(areaSelect?.value, "21");
  setSelectValue(areaSelect, "");
  fireEvent.click(findButton(view.container, "儲存"));

  await waitFor(() => assert.ok(updateRoutePayload));
  assert.equal(updateRoutePayload.data.tripAreaId, null);
});
