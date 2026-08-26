import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("the monthly report shows rounded snapshot profit and nonzero exception counts", async ({
  page,
}) => {
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_merchant",
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") {
      return route.fulfill({
        json: {
          id: 1,
          merchantId: "user_e2e_merchant",
          name: "E2E 假店鋪",
          slug: "e2e-fake-store",
        },
      });
    }
    if (path === "/api/stores/1/orders/monthly-profit") {
      return route.fulfill({
        json: {
          month: "2026-07",
          timeZone: "Asia/Taipei",
          orderCount: 5,
          capturedProfitSubtotalDisplayTwd: "1559",
          pendingOrderCount: 2,
          missingSnapshotOrderCount: 3,
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/reports/monthly-profit");
  await page.locator('input[type="month"]').fill("2026-07");

  await expect(page.getByText("NT$ 1,559", { exact: true })).toBeVisible();
  const pendingMetric = page.locator("dl > div").filter({
    has: page.locator("dt", { hasText: /^待確認$/ }),
  });
  const missingMetric = page.locator("dl > div").filter({
    has: page.locator("dt", { hasText: /^尚無快照$/ }),
  });
  await expect(pendingMetric.locator("dd")).toHaveText("2");
  await expect(missingMetric).toContainText("尚無快照3");
  await expect(pendingMetric.locator("dd")).not.toHaveText("0");
  await expect(missingMetric.locator("dd")).not.toHaveText("0");
});
