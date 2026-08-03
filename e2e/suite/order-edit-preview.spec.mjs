import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("editing an order keeps the exact 0.1 times 3 preview and rejects excess discount", async ({
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
    if (path === "/api/stores/1/skills") {
      return route.fulfill({ json: { catalogVersion: 1, skills: [] } });
    }
    if (path === "/api/stores/1/orders") {
      return route.fulfill({
        json: [
          {
            id: 1,
            storeId: 1,
            productId: 1,
            productName: "E2E 小數商品",
            publicToken: "e2e-order-token",
            buyerName: "測試客人",
            buyerPhone: "0900000000",
            pickupMethod: "自取",
            notes: null,
            specValues: {},
            quantity: 3,
            unitPrice: 0.1,
            shippingFee: 0,
            totalPrice: 0.3,
            status: "pending",
            paymentMethod: null,
            paymentStatus: "unpaid",
            paidAmount: 0,
            paymentLast5: null,
            paymentNote: null,
            shippingMethod: "self_pickup",
            shippingStatus: "not_shipped",
            discountAmount: 0,
            discountNote: null,
            recipientName: null,
            recipientPhone: null,
            recipientAddress: null,
            storeCode: null,
            storeName: null,
            trackingCode: null,
            trackingProvider: null,
            shippingNote: null,
            internalNote: null,
            cvsStoreAddress: null,
            cvsStorePhone: null,
            storeSelectedBy: null,
            storeSelectedAt: null,
            shipmentTracking: null,
            profitSnapshotStatus: "pending",
            createdAt: "2026-07-18T00:00:00.000Z",
            updatedAt: "2026-07-18T00:00:00.000Z",
          },
        ],
      });
    }
    if (path === "/api/stores/1/orders/profit-summary") {
      return route.fulfill({
        json: {
          capturedProfitSubtotalDisplayTwd: "0",
          pendingOrderCount: 1,
          missingSnapshotOrderCount: 0,
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/orders");
  await page.getByText("#1", { exact: true }).click();
  await page.getByRole("button", { name: "編輯訂單" }).click();

  await expect(page.getByText(/NT\$0\.1 × 3 = NT\$0\.3/)).toBeVisible();
  await page.getByPlaceholder("例如：50").fill("1");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(page.getByText("折讓金額不可超過商品小計加運費")).toBeVisible();
});
