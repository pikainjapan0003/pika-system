import assert from "node:assert/strict";
import test from "node:test";

import {
  countDashboardOrders,
  findLowStockProducts,
} from "./dashboardMetrics.ts";

test("dashboard counts today and the local Monday-based week", () => {
  const now = new Date(2026, 6, 17, 12, 0, 0);
  assert.deepEqual(
    countDashboardOrders(
      [
        { createdAt: new Date(2026, 6, 17, 0, 0, 0) },
        { createdAt: new Date(2026, 6, 13, 9, 0, 0) },
        { createdAt: new Date(2026, 6, 12, 23, 59, 59) },
        { createdAt: "invalid" },
      ],
      now,
    ),
    { today: 1, thisWeek: 2 },
  );
});

test("low-stock reminders exclude null inventory and inactive products", () => {
  assert.deepEqual(
    findLowStockProducts([
      { id: 1, name: "未追蹤", inventory: null, isActive: true },
      { id: 2, name: "庫存 3", inventory: 3, isActive: true },
      { id: 3, name: "庫存 0", inventory: 0, isActive: true },
      { id: 4, name: "庫存 4", inventory: 4, isActive: true },
      { id: 5, name: "已下架", inventory: 1, isActive: false },
    ]).map(({ id }) => id),
    [3, 2],
  );
});
