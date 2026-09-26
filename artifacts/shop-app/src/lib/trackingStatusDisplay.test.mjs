import assert from "node:assert/strict";
import { test } from "node:test";
import { getTrackingBadge } from "./trackingStatusDisplay.ts";

test("a code without an event, unknown, or a pending shipment never claims dispatched or delivered", () => {
  const order = { status: "pending", trackingCode: "SYNTHETIC_ONLY" };
  assert.equal(getTrackingBadge(order).label, "等待物流商更新");
  assert.equal(getTrackingBadge({ ...order, latestTrackingStatus: "pending" }).label, "待寄件");
  for (const state of ["unknown", "exception", "returned"]) {
    assert.equal(getTrackingBadge({ ...order, latestTrackingStatus: state }).label, "需店家確認");
  }
});

test("actual normalized events and cancellation retain the existing customer labels", () => {
  for (const [state, label] of Object.entries({ in_transit: "運送中", arrived_store: "待取貨", picked_up: "已取貨", delivered: "已送達" })) {
    assert.equal(getTrackingBadge({ status: "pending", latestTrackingStatus: state }).label, label);
  }
  assert.equal(getTrackingBadge({ status: "cancelled", latestTrackingStatus: "delivered" }).label, "已取消");
  assert.equal(getTrackingBadge({ status: "pending" }).label, "店家處理中");
});
