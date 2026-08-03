import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("customer export defaults to masked and cleartext requires a second confirmation", async ({
  page,
}) => {
  const confirmationMessages = [];
  const exportRequests = [];
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_merchant",
  });
  page.on("dialog", async (dialog) => {
    confirmationMessages.push(dialog.message());
    await dialog.accept();
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
    if (path === "/api/stores/1/customers") {
      return route.fulfill({
        json: [
          {
            id: 1,
            storeId: 1,
            code: "E2E-001",
            name: "測試客戶",
            phone: "0900000000",
            tier: "general",
            cvsStoreId: null,
            cvsStoreName: null,
            cvsStoreAddress: null,
            cvsStorePhone: null,
            notes: null,
          },
        ],
      });
    }
    if (path === "/api/stores/1/customers/export") {
      exportRequests.push({
        mode: url.searchParams.get("mode"),
        cleartextHeader: request.headers()["x-confirm-cleartext-export"],
      });
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: "code,name\nE2E-001,測試客戶\n",
      });
    }
    return route.fulfill({ status: 404, json: { error: "mock missing" } });
  });

  await page.goto("/customers");
  const exportButton = page.getByRole("button", {
    name: "確認匯出（1 筆）",
  });
  await exportButton.click();
  await expect.poll(() => exportRequests.length).toBe(1);
  expect(confirmationMessages).toEqual([
    "即將匯出 1 筆客戶資料（遮罩版），是否繼續？",
  ]);
  expect(exportRequests[0]).toEqual({
    mode: "masked",
    cleartextHeader: undefined,
  });

  confirmationMessages.length = 0;
  await page.getByRole("checkbox", { name: /改匯出明文版/ }).check();
  await exportButton.click();
  await expect.poll(() => exportRequests.length).toBe(2);
  expect(confirmationMessages).toEqual([
    "即將匯出 1 筆客戶資料（明文版），是否繼續？",
    "明文版包含完整個資。請再次確認只會交給有權限的人員，並在使用後刪除檔案。",
  ]);
  expect(exportRequests[1]).toEqual({
    mode: "cleartext",
    cleartextHeader: "true",
  });
});
