import { expect, test } from "@playwright/test";

import { installClerkStub } from "../clerkStub.mjs";

const fakeOrder = {
  id: 501,
  storeId: 1,
  productId: 71,
  productName: "E2E 假商品",
  publicToken: "e2e-picking-public-token",
  buyerName: "假客人",
  buyerPhone: "0900000000",
  pickupMethod: "7-11",
  notes: null,
  specValues: null,
  quantity: 2,
  unitPrice: 100,
  shippingFee: 60,
  totalPrice: 200,
  orderTotal: 260,
  status: "preparing",
  createdAt: "2026-07-31T00:00:00.000Z",
};

async function selectOnlyFixtureOrder(page) {
  const checkbox = page.locator('[role="checkbox"]');
  await expect(checkbox).toHaveCount(1);
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");
}

test("a picking check survives reload and becomes read-only after shipment", async ({
  page,
}) => {
  let checked = false;
  let listLoadCount = 0;

  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_picking_owner",
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/__clerk/")) return route.fallback();
    if (path === "/api/me/store") {
      return route.fulfill({
        json: {
          id: 1,
          merchantId: "user_e2e_picking_owner",
          name: "E2E 撿貨假店鋪",
          slug: "e2e-picking-store",
        },
      });
    }
    if (path === "/api/stores/1/skills") {
      return route.fulfill({ json: { catalogVersion: 1, skills: [] } });
    }
    if (path === "/api/stores/1/orders") {
      return route.fulfill({ json: [fakeOrder] });
    }
    if (path === "/api/stores/1/orders/profit-summary") {
      return route.fulfill({
        json: {
          capturedProfitSubtotalDisplayTwd: "0",
          pendingOrderCount: 0,
          missingSnapshotOrderCount: 1,
        },
      });
    }
    if (path === "/api/orders/picking-list" && request.method() === "POST") {
      listLoadCount += 1;
      const readOnly = listLoadCount >= 2;
      return route.fulfill({
        json: {
          generatedAt: "2026-07-31T00:00:00.000Z",
          orderCount: 1,
          excludedOrderIds: [],
          items: [
            {
              productId: 71,
              skuCode: null,
              productName: "E2E 假商品",
              specValues: null,
              specLabel: null,
              storageTemp: "room_temp",
              shelfLife: null,
              quantityTotal: 2,
              orderIds: [501],
              orderNumbers: ["501"],
              notes: "",
            },
          ],
          orderItems: [
            {
              orderId: 501,
              itemKey: "product:71",
              productName: "E2E 假商品",
              specLabel: null,
              quantity: 2,
              checked,
              checkedAt: checked ? "2026-07-31T01:00:00.000Z" : null,
              readOnly,
            },
          ],
        },
      });
    }
    if (
      path === "/api/orders/501/picking-check" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON();
      checked = body.checked;
      return route.fulfill({
        json: {
          orderId: 501,
          itemKey: "product:71",
          checked,
          checkedAt: checked ? "2026-07-31T01:00:00.000Z" : null,
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Pending picking E2E API mock missing" },
    });
  });

  await page.goto("/orders");
  await selectOnlyFixtureOrder(page);
  await page.getByRole("button", { name: "查看撿貨單" }).click();
  const markPacked = page.getByRole("button", {
    name: "標記已包：E2E 假商品",
  });
  await markPacked.click();
  await expect(
    page.getByRole("button", { name: "取消已包：E2E 假商品" }),
  ).toBeVisible();

  await page.reload();
  await selectOnlyFixtureOrder(page);
  await page.getByRole("button", { name: "查看撿貨單" }).click();
  const persisted = page.getByRole("button", {
    name: "取消已包：E2E 假商品",
  });
  await expect(persisted).toHaveAttribute("aria-pressed", "true");
  await expect(persisted).toBeDisabled();
  await expect(page.getByText("已出貨，勾選紀錄僅供查看")).toBeVisible();
});
