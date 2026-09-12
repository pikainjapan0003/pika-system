import { expect, test } from "./calculator-fixtures.mjs";
import { fakeSkills, mockCalculator } from "./calculator-mocks.mjs";

test("published skill map remains reachable beside the calculator settings entry", async ({
  page,
}, testInfo) => {
  const { writes, errors } = await mockCalculator(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /價格計算機/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /技能地圖/ })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    /首頁$/,
    /商品$/,
    /訂單$/,
    /設定$/,
  ]);
  await page.screenshot({ path: testInfo.outputPath("settings-desktop.png") });

  await page.getByRole("button", { name: /技能地圖/ }).click();
  await expect(page).toHaveURL(/\/skill-map$/);
  await expect(
    page.getByRole("heading", { name: "技能地圖", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已開 2 格", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "‹ 返回", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /價格計算機/ })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("settings-mobile.png") });
  await page.getByRole("button", { name: /價格計算機/ }).click();
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(page.getByRole("heading", { name: "價格計算機" })).toBeVisible();
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("button")).toHaveText([
    /首頁$/,
    /商品$/,
    /訂單$/,
    /設定$/,
  ]);
  await expect(nav.getByRole("button", { name: /設定$/ })).toHaveClass(
    /(?:^|\s)text-primary(?:\s|$)/,
  );
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("legacy skill restrictions remain enforced while calculator access stays available", async ({
  page,
}) => {
  const { writes, errors } = await mockCalculator(page, {
    skills: fakeSkills.map((skill) => ({ ...skill, enabled: false })),
  });
  await page.goto("/products");
  await expect(
    page.getByRole("heading", { name: "這項功能尚未開啟" }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /技能地圖/ })).toBeVisible();
  await expect(page.getByText("客戶管理", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    /首頁$/,
    /設定$/,
  ]);
  await page.getByRole("button", { name: /價格計算機/ }).click();
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(page.getByRole("heading", { name: "價格計算機" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    /首頁$/,
    /設定$/,
  ]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
