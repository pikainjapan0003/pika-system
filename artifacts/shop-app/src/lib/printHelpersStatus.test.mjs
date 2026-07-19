import assert from "node:assert/strict";
import test from "node:test";

import { getOrderReceiptStatusLabel } from "./printHelpers.ts";
import { ALL_STATUSES, STATUS_LABELS } from "./orderStatus.ts";

const EXPECTED_RECEIPT_LABELS = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

test("receipt status labels cover exactly the six database order states", () => {
  assert.deepEqual(
    [...ALL_STATUSES].sort(),
    Object.keys(EXPECTED_RECEIPT_LABELS).sort(),
  );
  assert.deepEqual(STATUS_LABELS, EXPECTED_RECEIPT_LABELS);
});

test("receipt rendering uses the approved Chinese label for every order state", () => {
  for (const [status, label] of Object.entries(EXPECTED_RECEIPT_LABELS)) {
    assert.equal(getOrderReceiptStatusLabel(status), label);
  }
});

test("receipt labels contain no confirmed or arrived ghost order states", () => {
  assert.equal(Object.hasOwn(STATUS_LABELS, "confirmed"), false);
  assert.equal(Object.hasOwn(STATUS_LABELS, "arrived"), false);
});

test("an unknown receipt status falls back to its original value", () => {
  assert.equal(getOrderReceiptStatusLabel("future_status"), "future_status");
});
