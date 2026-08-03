import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

const fakeStore = {
  id: 1,
  merchantId: "user_e2e_merchant",
  name: "E2E 假店鋪",
  slug: "e2e-fake-store",
  createdAt: "2026-07-18T00:00:00.000Z",
};

test("enabling S-19 reveals the customer entry without a browser reload", async ({
  page,
}) => {
  let customerSkillEnabled = false;
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_merchant",
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") return route.fulfill({ json: fakeStore });
    if (path === "/api/stores/1/skills") {
      return route.fulfill({
        json: {
          catalogVersion: 1,
          skills: [
            {
              skillKey: "S-19",
              enabled: customerSkillEnabled,
              configured: customerSkillEnabled,
              highRisk: false,
              prerequisite: { ready: true, missing: [] },
            },
          ],
        },
      });
    }
    if (path === "/api/stores/1/skills/S-19/preview") {
      return route.fulfill({
        json: {
          prerequisite: { ready: true, missing: [] },
          highRiskConfirmationRequired: false,
        },
      });
    }
    if (path === "/api/stores/1/skills/S-19/enable") {
      customerSkillEnabled = true;
      return route.fulfill({ json: { enabled: true } });
    }
    if (path === "/api/stores/1/customers") {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Pending E2E API mock missing" },
    });
  });

  await page.goto("/skill-map");
  const customerSkillCard = page.locator("article", { hasText: "S-19" });
  await customerSkillCard.getByRole("button", { name: "可開啟" }).click();
  await expect(
    customerSkillCard.getByRole("button", { name: "已開啟" }),
  ).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText("客戶管理", { exact: true })).toBeVisible();
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "客戶管理" })).toBeVisible();
  await expect(page.getByText("這項功能尚未開啟")).toHaveCount(0);
});
