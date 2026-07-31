/**
 * UNVERIFIED-PENDING-CI
 *
 * This spec intentionally stays outside the main Playwright testMatch until
 * the Pending E2E workflow proves it green on Linux.
 */
import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

test("a zero-skill store previews and applies its recommended package before the entry appears", async ({
  page,
}) => {
  let customerSkillEnabled = false;
  const packageRequests = [];

  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_onboarding_owner",
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") {
      return route.fulfill({
        json: {
          id: 1,
          merchantId: "user_e2e_onboarding_owner",
          name: "E2E 問卷假店鋪",
          slug: "e2e-onboarding-store",
          description: "純假資料",
        },
      });
    }
    if (path === "/api/stores/1/skills") {
      return route.fulfill({
        json: {
          catalogVersion: 7,
          skills: customerSkillEnabled
            ? [
                {
                  skillKey: "S-19",
                  enabled: true,
                  configured: true,
                  highRisk: false,
                  prerequisite: { ready: true, missing: [] },
                },
              ]
            : [],
        },
      });
    }
    if (
      path.startsWith("/api/stores/1/skill-packages/") &&
      path.endsWith("/preview")
    ) {
      const packageKey = path.split("/").at(-2);
      packageRequests.push({ method: request.method(), packageKey });
      return route.fulfill({
        json: {
          packageKey,
          enableNow: packageKey === "wholesale" ? ["S-19"] : ["S-01"],
          alreadyEnabled: [],
          missingPrerequisite: [],
          requiresConfirmation: [],
        },
      });
    }
    if (
      path.startsWith("/api/stores/1/skill-packages/") &&
      path.endsWith("/apply")
    ) {
      const packageKey = path.split("/").at(-2);
      packageRequests.push({
        method: request.method(),
        packageKey,
        body: request.postDataJSON(),
      });
      if (packageKey === "wholesale") customerSkillEnabled = true;
      return route.fulfill({ json: { applied: true } });
    }
    if (path === "/api/stores/1/stats") {
      return route.fulfill({
        json: { totalOrders: 0, pendingOrders: 0, totalRevenue: 0 },
      });
    }
    if (path === "/api/stores/1/orders") {
      return route.fulfill({ json: [] });
    }
    if (path === "/api/stores/1/products") {
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
    return route.fulfill({
      status: 404,
      json: { error: "Pending onboarding E2E API mock missing" },
    });
  });

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", {
      name: "用 4 題找到適合的技能套餐",
    }),
  ).toBeVisible();

  await page.getByLabel("管理客戶與分級價格").check();
  await page.getByLabel("大量，需要客戶分級與省工").check();
  await page.getByRole("button", { name: "查看推薦" }).click();
  await expect(page.getByText("新手套餐 ＋ 批發套餐")).toBeVisible();
  expect(packageRequests).toEqual([
    { method: "POST", packageKey: "beginner" },
    { method: "POST", packageKey: "wholesale" },
  ]);

  await page.getByRole("button", { name: "套用推薦" }).click();
  await expect(
    page.getByRole("heading", {
      name: "用 4 題找到適合的技能套餐",
    }),
  ).toHaveCount(0);
  expect(
    packageRequests.filter((request) => request.method === "POST"),
  ).toEqual([
    { method: "POST", packageKey: "beginner" },
    { method: "POST", packageKey: "wholesale" },
    {
      method: "POST",
      packageKey: "beginner",
      body: { catalogVersion: 7 },
    },
    {
      method: "POST",
      packageKey: "wholesale",
      body: { catalogVersion: 7 },
    },
  ]);

  await page.goto("/settings");
  await expect(page.getByText("客戶管理", { exact: true })).toBeVisible();
});
