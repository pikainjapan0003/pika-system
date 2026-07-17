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

test("購物車可送單且公開品項只有七個安全欄位", async ({ page }) => {
  await installClerkStub(page);
  await page.goto("/p/ci-smoke-product");
  await page.getByRole("button", { name: "加入購物車" }).click();
  await page.getByRole("link", { name: "購物車" }).click();

  await page.getByPlaceholder("請輸入您的姓名").fill("CI 測試買家");
  await page.getByPlaceholder("09xx-xxx-xxx").fill("0900000000");
  await page.getByRole("button", { name: /面交/ }).click();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/cart/orders",
  );
  await page.getByRole("button", { name: /確認下單/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);

  const body = await response.json();
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items).toHaveLength(1);
  expect(Object.keys(body.items[0]).sort()).toEqual(
    [
      "imageUrl",
      "name",
      "productId",
      "quantity",
      "specValues",
      "subtotal",
      "unitPrice",
    ].sort(),
  );
});

test("公開追蹤頁顯示狀態且不出現內部成本文字", async ({ page }) => {
  await installClerkStub(page);
  await page.goto("/track/ci-smoke-track-order");

  await expect(page.getByRole("heading", { name: "物流查詢" })).toBeVisible();
  await expect(page.getByText("備貨中", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/成本|毛利|匯率/);
});
