import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_MESSAGE_TEMPLATE_TYPES,
  buildOrderMessage,
} from "./orderMessageTemplates.ts";

const data = {
  orderNumber: "#123",
  productSummary: "假資料餅乾 × 2",
  amountTwd: "1,280",
  pickupMethod: "7-11 取貨",
};

test("all three copy templates interpolate the required order details", () => {
  assert.deepEqual(ORDER_MESSAGE_TEMPLATE_TYPES, [
    "confirmation",
    "arrival",
    "payment_reminder",
  ]);

  for (const type of ORDER_MESSAGE_TEMPLATE_TYPES) {
    const message = buildOrderMessage(type, data);
    assert.match(message, /訂單編號：#123/);
    assert.match(message, /商品：假資料餅乾 × 2/);
    assert.match(message, /金額：NT\$ 1,280/);
    assert.match(message, /取貨方式：7-11 取貨/);
  }
});

test("templates describe confirmation, arrival, and payment reminder without sending", () => {
  assert.match(buildOrderMessage("confirmation", data), /訂單已確認/);
  assert.match(buildOrderMessage("arrival", data), /訂單已到貨/);
  assert.match(buildOrderMessage("payment_reminder", data), /尚有款項待付款/);
});
