import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_CART_ITEM_RESPONSE_KEYS } from "./publicCartItems.ts";
import {
  PUBLIC_ORDER_CREATED_RESPONSE_KEYS,
  formatPublicOrderCreatedResponse,
} from "./publicOrderResponse.ts";
import { PUBLIC_TRACK_ORDER_RESPONSE_KEYS } from "./publicTrackResponse.ts";

const CREATED_KEYS_SNAPSHOT = [
  "createdAt",
  "cvsStoreAddress",
  "cvsStoreId",
  "cvsStoreName",
  "cvsStorePhone",
  "orderTotal",
  "pickupMethod",
  "productName",
  "publicToken",
  "quantity",
  "specValues",
  "status",
  "statusLabel",
  "shippingFee",
  "totalPrice",
  "unitPrice",
].sort();

const CART_ITEM_KEYS_SNAPSHOT = [
  "productId",
  "productImageUrl",
  "productName",
  "quantity",
  "specValues",
  "subtotal",
  "unitPrice",
];

const TRACK_KEYS_SNAPSHOT = [
  "createdAt",
  "items",
  "latestTrackingStatus",
  "latestTrackingStatusLabel",
  "latestTrackingTime",
  "paymentLast5",
  "productName",
  "publicToken",
  "quantity",
  "recipientAddressMasked",
  "recipientNameMasked",
  "recipientPhoneMasked",
  "shipmentUpdatedAt",
  "shippingStatus",
  "shippingStatusLabel",
  "shippingFee",
  "specValues",
  "status",
  "statusLabel",
  "storeName",
  "totalPrice",
  "trackingCode",
  "trackingProvider",
  "trackingProviderLabel",
  "unitPrice",
  "pickupMethod",
  "orderTotal",
].sort();

test("created-order public response keyset matches the approved snapshot", () => {
  assert.deepEqual(
    [...PUBLIC_ORDER_CREATED_RESPONSE_KEYS].sort(),
    CREATED_KEYS_SNAPSHOT,
  );
  const response = formatPublicOrderCreatedResponse({
    publicToken: "snapshot-order-token",
    productName: "Synthetic product",
    quantity: 1,
    unitPrice: "100.00",
    shippingFee: "0.00",
    totalPrice: "100.00",
    pickupMethod: "self_pickup",
    specValues: {},
    status: "pending",
    cvsStoreId: null,
    cvsStoreName: null,
    cvsStoreAddress: null,
    cvsStorePhone: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(response).sort(), CREATED_KEYS_SNAPSHOT);
});

test("cart-item public response keyset matches the approved snapshot", () => {
  assert.deepEqual(
    [...PUBLIC_CART_ITEM_RESPONSE_KEYS].sort(),
    CART_ITEM_KEYS_SNAPSHOT,
  );
});

test("tracking public response keyset matches the approved snapshot", () => {
  assert.deepEqual(
    [...PUBLIC_TRACK_ORDER_RESPONSE_KEYS].sort(),
    TRACK_KEYS_SNAPSHOT,
  );
});

test("public snapshots contain no internal cost or token fields", () => {
  const forbidden = [
    "profitSnapshot",
    "profitSnapshotCostJpy",
    "profitSnapshotExchangeRate",
    "profitSnapshotUnitProfitTwd",
    "costJpy",
    "exchangeRate",
    "transportCost",
    "shareToken",
  ];
  const allPublicKeys = new Set([
    ...CREATED_KEYS_SNAPSHOT,
    ...CART_ITEM_KEYS_SNAPSHOT,
    ...TRACK_KEYS_SNAPSHOT,
  ]);
  for (const key of forbidden) assert.equal(allPublicKeys.has(key), false, key);
});
