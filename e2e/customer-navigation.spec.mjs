import { expect, test } from "@playwright/test";

import { installClerkStub } from "./clerkStub.mjs";

const fakeStore = {
  id: 1,
  merchantId: "user_e2e_merchant",
  name: "E2E 假店鋪",
  slug: "e2e-fake-store",
  createdAt: "2026-07-18T00:00:00.000Z",
};

const fakeCustomer = {
  id: 1,
  storeId: 1,
  code: "DEMO-001",
  name: "王小明",
  phone: "0912345678",
  tier: "general",
  cvsStoreId: null,
  cvsStoreName: null,
  cvsStoreAddress: null,
  cvsStorePhone: null,
  notes: null,
};

test("customer list detail link reaches the customer detail page", async ({
  page,
}) => {
  await installClerkStub(page, { signedIn: true, userId: "user_e2e_merchant" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") return route.fulfill({ json: fakeStore });
    if (path === "/api/stores/1/customers") {
      return route.fulfill({ json: [fakeCustomer] });
    }
    if (path === "/api/stores/1/customers/1") {
      return route.fulfill({ json: { customer: fakeCustomer, orders: [] } });
    }
    if (path === "/api/stores/1/customers/1/store-credit") {
      return route.fulfill({
        json: {
          balance: "0",
          transactions: [],
          page: 1,
          limit: 50,
          total: 0,
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "E2E API mock missing" },
    });
  });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "客戶管理" })).toBeVisible();
  await page.getByRole("button", { name: "詳情" }).click();
  await expect(page).toHaveURL(/\/customers\/1$/);
  await expect(page.getByRole("heading", { name: "客戶詳情" })).toBeVisible();
  await expect(page.getByText("頁面不存在")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
