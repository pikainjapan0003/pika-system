import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("grant credit, spend it on an order, then restore it on cancellation", async ({
  page,
}) => {
  let balance = "0.000000000000";
  let order = null;
  const customer = {
    id: 1,
    storeId: 1,
    code: "E2E-CREDIT-001",
    name: "測試客戶",
    phone: "0900000000",
    tier: "general",
    cvsStoreId: null,
    cvsStoreName: null,
    cvsStoreAddress: null,
    cvsStorePhone: null,
    notes: null,
  };

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
      return route.fulfill({
        json: {
          catalogVersion: 1,
          skills: [
            {
              skillKey: "S-19",
              enabled: true,
              configured: true,
              highRisk: true,
              prerequisite: { ready: true, missing: [] },
            },
          ],
        },
      });
    }
    if (path === "/api/stores/1/customers/1" && request.method() === "GET") {
      return route.fulfill({ json: { customer, orders: [] } });
    }
    if (path === "/api/stores/1/customers") {
      return route.fulfill({ json: [customer] });
    }
    if (path === "/api/stores/1/customers/1/store-credit") {
      if (request.method() === "POST") {
        expect(request.headers()["x-confirm-store-credit"]).toBe("true");
        expect(request.postDataJSON().amount).toBe("5000");
        balance = "5000.000000000000";
        return route.fulfill({
          status: 201,
          json: { balance, transaction: { id: 1 }, idempotent: false },
        });
      }
      return route.fulfill({
        json: { balance, transactions: [], page: 1, limit: 50, total: 0 },
      });
    }
    if (path === "/api/stores/1/products") {
      return route.fulfill({
        json: [
          {
            id: 10,
            storeId: 1,
            name: "E2E 測試商品",
            price: 220,
            inventory: 10,
            isActive: true,
          },
        ],
      });
    }
    if (path === "/api/stores/1/orders" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.customerId).toBe(1);
      expect(body.creditSpent).toBe("220");
      balance = "4780.000000000000";
      order = {
        id: 101,
        storeId: 1,
        productId: 10,
        productName: "E2E 測試商品",
        buyerName: "測試客戶",
        buyerPhone: "0900000000",
        pickupMethod: "pickup",
        quantity: 1,
        unitPrice: 220,
        shippingFee: 0,
        totalPrice: 220,
        orderTotal: 220,
        creditSpent: 220,
        payableAfterCredit: 0,
        status: "pending",
        createdAt: "2026-07-31T00:00:00.000Z",
      };
      return route.fulfill({ status: 201, json: order });
    }
    if (path === "/api/stores/1/orders" && request.method() === "GET") {
      return route.fulfill({ json: order ? [order] : [] });
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
    if (path === "/api/orders/101/status" && request.method() === "PATCH") {
      expect(request.postDataJSON()).toEqual({ status: "cancelled" });
      balance = "5000.000000000000";
      order = { ...order, status: "cancelled" };
      return route.fulfill({ json: order });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/customers/1");
  await expect(page.getByText("NT$0", { exact: true })).toBeVisible();
  await page.getByLabel("購物金變更金額").fill("5000");
  await page.getByLabel("購物金原因代碼").fill("e2e_grant");
  await page.getByRole("button", { name: "預覽並確認" }).click();
  await page
    .getByRole("dialog", { name: "確認購物金變更" })
    .getByRole("button", { name: "確認變更" })
    .click();
  await expect(page.getByText("NT$5,000", { exact: true })).toBeVisible();

  await page.goto("/orders");
  await page.getByRole("button", { name: "＋ 新增訂單" }).click();
  await page.getByLabel("搜尋客戶代號或姓名").fill("E2E-CREDIT-001");
  await page
    .locator("select")
    .filter({ hasText: "E2E-CREDIT-001" })
    .selectOption("1");
  await page
    .locator("select")
    .filter({ hasText: "E2E 測試商品" })
    .selectOption("10");
  await page.getByRole("button", { name: /面交 \/ 自取.*免運/u }).click();
  await page.getByLabel("購物金折抵金額").fill("220");
  await page.getByRole("button", { name: "建立訂單" }).click();
  await page.getByText("#101", { exact: true }).click();
  const creditRow = page.getByText("購物金折抵", { exact: true }).locator("..");
  await expect(creditRow).toContainText("-NT$220");
  const payableRow = page.getByText("應付現金", { exact: true }).locator("..");
  await expect(payableRow).toContainText("NT$0");
  const remainingRow = page
    .getByText("待收金額", { exact: true })
    .locator("..");
  await expect(remainingRow).toContainText("NT$ 0");

  await page.getByRole("button", { name: "取消訂單" }).click();
  await page.getByRole("button", { name: "確認取消" }).click();
  await page.goto("/customers/1");
  await expect(page.getByText("NT$5,000", { exact: true })).toBeVisible();
});
