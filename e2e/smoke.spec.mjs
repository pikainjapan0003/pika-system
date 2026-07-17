import { expect, test } from "@playwright/test";

import { installClerkStub } from "./clerkStub.mjs";

test.skip(
  process.env.CI !== "true",
  "BATCH-6 規格：Playwright 冒煙僅在 CI Linux 執行",
);

test("公開商品頁可開啟並顯示商品", async ({ page }) => {
  await installClerkStub(page);
  await page.goto("/p/ci-smoke-product");
  await expect(
    page.getByText("CI 冒煙測試商品", { exact: true }),
  ).toBeVisible();
});

test("公開下單表單會渲染", async ({ page }) => {
  await installClerkStub(page);
  await page.goto("/p/ci-smoke-product");
  await expect(page.getByPlaceholder("請輸入您的姓名")).toBeVisible();
  await expect(page.getByRole("button", { name: /確認下單/ })).toBeVisible();
});

test("未登入讀取後台訂單 API 會回 401", async ({ request }) => {
  const response = await request.get(
    "http://127.0.0.1:8080/api/stores/1/orders",
  );
  expect(response.status()).toBe(401);
});
