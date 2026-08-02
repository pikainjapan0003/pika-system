/**
 * UNVERIFIED-PENDING-CI
 *
 * This spec intentionally stays outside the main Playwright testMatch until
 * the Pending E2E workflow proves it green on Linux.
 */
import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("Maihuobian preview separates eligibility and cleartext export requires confirmation", async ({
  page,
}) => {
  const exportRequests = [];
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
                recipientName: "測試客人",
                recipientPhone: "0900000000",
                cvsStoreId: "123456",
                temperature: "常溫",
                productSummary: "測試商品",
                totalPrice: "800.00",
                shippingFee: "60.00",
                orderDate: "2026/07/31",
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
                  code: "ORDER_STATUS_INELIGIBLE",
                  message: "訂單狀態尚不可出貨",
                },
              ],
            },
          ],
        },
      });
    }
    if (
      path === "/api/stores/1/orders/maihuobian-export" &&
      request.method() === "POST"
    ) {
      exportRequests.push({
        cleartext: request.headers()["x-confirm-cleartext-export"],
        purpose: request.headers()["x-confirm-maihuobian-export"],
        body: request.postDataJSON(),
      });
      return route.fulfill({
        json: {
          eligibleCount: 1,
          ineligibleCount: 0,
          eligible: [
            {
              orderId: 101,
              row: {
                recipientName: "測試客人",
                recipientPhone: "0900000000",
                cvsStoreId: "123456",
                temperature: "常溫",
                productSummary: "測試商品",
                totalPrice: "800.00",
                shippingFee: "60.00",
                orderDate: "2026/07/31",
                notes: "",
                socialAccount: "",
              },
            },
          ],
          ineligible: [],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/orders");
  await page.getByRole("button", { name: "賣貨便匯出" }).click();
  await page.getByLabel("開始日期").fill("2026-07-01");
  await page.getByLabel("結束日期").fill("2026-07-31");
  await page.getByRole("button", { name: "檢查可匯出訂單" }).click();

  await expect(
    page.getByRole("heading", { name: "可匯出（1）", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "不可匯出（1）", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("訂單狀態尚不可出貨")).toBeVisible();

  await page.getByRole("button", { name: "準備匯出 1 筆" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "賣貨便匯出確認",
  });
  await expect(confirmation.getByText("將匯出 1 筆明文個資")).toBeVisible();
  const downloadButton = confirmation.getByRole("button", {
    name: "確認並下載 CSV",
  });
  await expect(downloadButton).toBeDisabled();

  await confirmation
    .getByRole("checkbox", { name: "我確認本檔僅用於賣貨便出貨" })
    .check();
  await downloadButton.click();
  await expect.poll(() => exportRequests.length).toBe(1);
  expect(exportRequests[0]).toEqual({
    cleartext: "true",
    purpose: "true",
    body: {
      from: "2026-07-01",
      to: "2026-07-31",
      orderIds: [101],
    },
  });
});
