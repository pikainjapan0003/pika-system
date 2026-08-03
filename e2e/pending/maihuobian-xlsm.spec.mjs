import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("Maihuobian XLSM export requires both confirmations and downloads an xlsm", async ({
  page,
}) => {
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_maihuobian_owner",
  });

  const xlsmBytes = Buffer.from("PK\\x03\\x04fake-xlsm", "binary");
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") {
      return route.fulfill({
        json: {
          id: 1,
          merchantId: "user_e2e_maihuobian_owner",
          name: "E2E 假店鋪",
          slug: "e2e-maihuobian-store",
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
          ineligibleCount: 0,
          eligible: [{ orderId: 101, productSummary: "E2E 假商品" }],
          ineligible: [],
        },
      });
    }
    if (
      path === "/api/stores/1/orders/maihuobian-export" &&
      request.method() === "POST"
    ) {
      expect(url.searchParams.get("format")).toBe("xlsm");
      expect(request.headers()["x-confirm-cleartext-export"]).toBe("true");
      expect(request.headers()["x-confirm-maihuobian-export"]).toBe("true");
      return route.fulfill({
        status: 200,
        body: xlsmBytes,
        contentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
        headers: {
          "Content-Disposition":
            'attachment; filename="maihuobian-orders.xlsm"',
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/orders");
  await page.getByRole("button", { name: "賣貨便匯出" }).click();
  await page.getByLabel("開始日期").fill("2026-08-01");
  await page.getByLabel("結束日期").fill("2026-08-01");
  await page.getByRole("button", { name: "檢查可匯出訂單" }).click();
  await page.getByRole("button", { name: "準備匯出 1 筆" }).click();

  const confirmation = page.getByRole("dialog", {
    name: "賣貨便匯出確認",
  });
  await expect(confirmation.getByText("將匯出 1 筆明文個資")).toBeVisible();
  const downloadButton = confirmation.getByRole("button", {
    name: "確認並下載 XLSM",
  });
  await expect(downloadButton).toBeDisabled();
  await confirmation
    .getByRole("checkbox", { name: "我確認本檔僅用於賣貨便出貨" })
    .check();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/orders/maihuobian-export") &&
      response.request().method() === "POST",
  );
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const [response, download] = await Promise.all([
    responsePromise,
    downloadPromise,
  ]);
  expect(response.headers()["content-type"]).toContain(
    "application/vnd.ms-excel.sheet.macroEnabled.12",
  );
  expect(download.suggestedFilename()).toMatch(/\.xlsm$/u);
});
