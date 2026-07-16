import assert from "node:assert/strict";
import test from "node:test";

import { formatActionableError } from "./actionableError.ts";

test("actionable errors always include the four required parts", () => {
  assert.equal(
    formatActionableError({
      happened: "訂單沒有送出。",
      reason: "連線暫時中斷。",
      action: "保留本頁並稍後再試。",
      support: "請把畫面截圖傳給店家。",
    }),
    "發生什麼：訂單沒有送出。\n為什麼：連線暫時中斷。\n現在能做什麼：保留本頁並稍後再試。\n需要幫忙：請把畫面截圖傳給店家。",
  );
});
