import assert from "node:assert/strict";
import test from "node:test";

import { countDashboardOrders } from "./dashboardMetrics.ts";

test("dashboard counts today and the local Monday-based week", () => {
  const now = new Date(2026, 6, 17, 12, 0, 0);
  assert.deepEqual(countDashboardOrders([
    { createdAt: new Date(2026, 6, 17, 0, 0, 0) },
    { createdAt: new Date(2026, 6, 13, 9, 0, 0) },
    { createdAt: new Date(2026, 6, 12, 23, 59, 59) },
    { createdAt: "invalid" },
  ], now), { today: 1, thisWeek: 2 });
});
