import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

const fakeStore = {
  id: 1,
  merchantId: "user_e2e_ungated_owner",
  name: "E2E 無閘門店鋪",
  slug: "e2e-ungated-store",
  description: "純假資料",
};

async function installApiMocks(page) {
  await installClerkStub(page, {
    signedIn: true,
    userId: fakeStore.merchantId,
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") {
      return route.fulfill({ json: fakeStore });
    }
    if (
      path === "/api/stores/1/products" ||
      path === "/api/stores/1/orders" ||
      path === "/api/stores/1/customers"
    ) {
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
    if (path === "/api/stores/1/logistics/exceptions") {
      return route.fulfill({ json: { ok: true, items: [] } });
    }
    return route.fulfill({
      status: 404,
      json: { error: "E2E ungated API mock missing" },
    });
  });
}

test("products and orders remain fully available without a page gate", async ({
  page,
}) => {
  await installApiMocks(page);

  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "商品" })).toBeVisible();
  await expect(page.getByRole("button", { name: "分類管理" })).toBeVisible();

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "訂單" })).toBeVisible();
  await expect(page.getByRole("button", { name: "＋ 新增訂單" })).toBeVisible();
  await expect(page.getByRole("button", { name: "物流匯入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "物流異常" })).toBeVisible();
});

test("settings omits the removed entry and the former route is not found", async ({
  page,
}) => {
  await installApiMocks(page);

  await page.goto("/settings");
  await expect(page.getByText("客戶管理", { exact: true })).toBeVisible();
  await expect(page.getByText("行程與路線管理", { exact: true })).toBeVisible();
  await expect(page.getByText("技能地圖", { exact: true })).toHaveCount(0);

  await page.goto("/skill-map");
  await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
});
