import { expect, test } from "./calculator-fixtures.mjs";
import { mockCalculator } from "./calculator-mocks.mjs";
test("BASE_PATH prefix preserves settings-only calculator entry and refresh", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/pika/calculator");
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "‹ 更多", exact: true }).click();
  await expect(page).toHaveURL(/\/pika\/settings$/);
  await page.getByRole("button", { name: /價格計算機/ }).click();
  await expect(page).toHaveURL(/\/pika\/calculator$/);
  await page
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("button", { name: "首頁", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pika\/dashboard$/);
  await expect(page.getByRole("button", { name: /價格計算機/ })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("button", { name: "更多", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pika\/settings$/);
  await page.getByRole("button", { name: /價格計算機/ }).click();
  await expect(page).toHaveURL(/\/pika\/calculator$/);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
