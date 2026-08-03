// UNVERIFIED-PENDING-CI: keep outside the main suite until the pending workflow is reviewed.
import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("Maihuobian eligibility accepts only the 38元 sell便 method", async ({
  page,
}) => {
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_merchant",
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
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
    if (path === "/api/stores/1/skills") {
      return route.fulfill({ json: { catalogVersion: 1, skills: [] } });
    }
    if (path === "/api/stores/1/orders") {
      return route.fulfill({ json: [] });
    }
    if (path === "/api/stores/1/orders/profit-summary") {
      return route.fulfill({
        json: {
          capturedProfitSubtotalDisplayTwd: "0",
          pendingOrderCount: 0,
          missingSnapshotOrderCount: 0,
        },
      });
    }
    if (
      path === "/api/stores/1/orders/maihuobian-export" &&
      request.method() === "GET"
    ) {
      return route.fulfill({
        json: {
          eligibleCount: 1,
          ineligibleCount: 1,
          eligible: [
            {
              orderId: 101,
              row: {
                recipientName: "賣貨便客人",
                recipientPhone: "0900000000",
                cvsStoreId: "123456",
                temperature: "常溫",
                productSummary: "賣貨便商品",
                totalPrice: "600.00",
                shippingFee: "38.00",
                orderDate: "2026/08/03",
                notes: "",
                socialAccount: "",
              },
            },
          ],
          ineligible: [
            {
              orderId: 102,
              reasons: [
                {
                  code: "PICKUP_METHOD_INELIGIBLE",
                  message: "僅 7-11 賣貨便訂單可匯出",
                },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/orders");
  await page.getByRole("button", { name: "賣貨便匯出" }).click();
  await page.getByLabel("開始日期").fill("2026-08-01");
  await page.getByLabel("結束日期").fill("2026-08-03");
  await page.getByRole("button", { name: "檢查可匯出訂單" }).click();

  await expect(
    page.getByRole("heading", { name: "可匯出（1）", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("#101 · 賣貨便商品", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "不可匯出（1）", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("訂單 #102", { exact: true })).toBeVisible();
  await expect(
    page.getByText("僅 7-11 賣貨便訂單可匯出", { exact: true }),
  ).toBeVisible();
});
