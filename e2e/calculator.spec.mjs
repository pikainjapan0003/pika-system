import { expect, test } from "./calculator-fixtures.mjs";
import { mockCalculator } from "./calculator-mocks.mjs";
const RATE_KEY = "pika.priceCalculator.lastJpyRate";

test("shared boutique rules agree across automatic, manual and displayed values", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "精品");
  await fill(page, "1001.000001", "170");
  await expect(page.locator(".calc-auto")).toContainText("原價 × 0.9155");
  await expect(page.getByTestId("auto-q")).toHaveText("916.4155009155");
  await expect(page.locator(".calc-fixed")).toContainText("NT$52.5／kg");
  await expect(page.getByTestId("total-cost")).toHaveAttribute(
    "title",
    "239.517219023393825",
  );
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 490",
  );
  await page.getByRole("button", { name: "人工輸入", exact: true }).click();
  await expect(page.locator("#calc-q")).toHaveValue("916.4155009155");
  await expect(page.getByTestId("total-cost")).toHaveAttribute(
    "title",
    "239.517219023393825",
  );
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 490",
  );
  await page.getByText("公式與進位說明", { exact: true }).click();
  await expect(
    page.getByText("自動退稅後價格 Q =", { exact: false }),
  ).toContainText("P × 0.9155");
  await expect(
    page.getByText("成本 C = Q × R", { exact: false }),
  ).toContainText("1000 × 52.5 + Q × R × 0.015 + P × R × 0.0155");
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("exactly four non-event modes are available", async ({ page }) => {
  await mockCalculator(page);
  await page.goto("/calculator");
  const modes = page
    .getByRole("group", { name: "計算模式" })
    .getByRole("button");
  await expect(modes).toHaveCount(4);
  for (const name of ["一般版", "輕井澤果醬", "IP 商品", "精品"])
    await expect(
      page
        .getByRole("group", { name: "計算模式" })
        .getByRole("button", { name: new RegExp(`^${name}`) }),
    ).toHaveCount(1);
  await expect(
    page.locator(".calculator-page").getByText(/活動版本|活動版/),
  ).toHaveCount(0);
});

test("explicit clear and mode changes invalidate the old warning context", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "IP 商品");
  await fill(page, "1800", "170");
  const live = page.getByTestId("calculation-announcements");
  const warning = "IP 商品：0.26 原計算利潤低於 NT$50。售價不會自動調整。";
  await expect(live).toHaveText(warning);
  await live.evaluate((el) => {
    window.__calcLiveElement = el;
  });
  await mode(page, "精品");
  await expect(page.getByTestId("total-cost")).toHaveCount(0);
  await expect(live).toHaveText("");
  await page.waitForTimeout(650);
  await expect(live).toHaveText("");
  await mode(page, "IP 商品");
  await expect(live).toHaveText(warning);
  await page.locator(".calc-clear summary").click();
  await page
    .getByRole("button", { name: "清除此模式商品資料", exact: true })
    .click();
  await expect(page.locator("#calc-price")).toHaveValue("");
  await expect(page.locator("#calc-weight")).toHaveValue("");
  await expect(page.getByTestId("total-cost")).toHaveCount(0);
  await expect(live).toHaveText("");
  await page.waitForTimeout(650);
  await expect(live).toHaveText("");
  await fill(page, "1800", "170");
  await expect(live).toHaveText(warning);
  await page.getByRole("button", { name: "清除匯率記憶", exact: true }).click();
  await page.getByRole("button", { name: "確認清除匯率", exact: true }).click();
  await expect(live).toHaveText("");
  await expect(page.locator("#calc-price")).toHaveValue("1800");
  expect(await live.evaluate((el) => el === window.__calcLiveElement)).toBe(
    true,
  );
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("switching to an empty draft cancels a pending warning", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-12T00:00:00Z") });
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "IP 商品");
  await fill(page, "1800", "150");
  await page.clock.pauseAt(new Date("2026-09-12T02:00:00Z"));
  await page.locator("#calc-weight").fill("170");
  await mode(page, "精品");
  await page.clock.runFor(650);
  await expect(page.getByTestId("calculation-announcements")).toHaveText("");
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

for (const width of [320, 1440]) {
  test(`exact profits explain rounded warning at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = await mockCalculator(page);
    await page.goto("/calculator");
    await mode(page, "IP 商品");
    await fill(page, "1800", "156.045455");
    await expect(page.getByTestId("total-cost")).toHaveAttribute(
      "title",
      "450.0000001",
    );
    const quote = page.getByTestId(
      width < 1024 ? "0.26-original" : "table-0.26-original",
    );
    await expect(quote).toContainText("50.00");
    await expect(
      quote.locator('[data-warning="PROFIT_BELOW_RECOMMENDED"]'),
    ).toBeVisible();
    await page.getByText("成本明細與完整數值", { exact: true }).click();
    await expect(page.locator('[data-testid^="exact-profit-"]')).toHaveCount(
      10,
    );
    const detail = page.getByTestId("exact-profit-0.26-original");
    await expect(detail.locator("dd")).toHaveText(["500", "49.9999999"]);
    await expect(detail).toContainText("低於 NT$50（等於不提醒）");
    await expect(
      page.getByTestId("exact-profit-0.26-weight").locator("dd"),
    ).toHaveText(["535", "84.9999999"]);
    await expect(page.getByTestId("exact-profit-0.26-weight")).toContainText(
      "低於 NT$50（等於不提醒）",
    );
    await detail.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`exact-profit-${width}.png`),
    });
    expect(evidence.writes).toEqual([]);
    expect(evidence.errors).toEqual([]);
  });
}

test("non-IP exact profit details preserve the approved warning thresholds", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  for (const [name, profits] of [
    ["一般版", ["54.7965", "49.7965"]],
    ["輕井澤果醬", ["112.7965", "102.7965"]],
    ["精品", ["302.87594375", "212.87594375"]],
  ]) {
    await mode(page, name);
    await fill(
      page,
      name === "精品" ? "8250" : "890",
      name === "精品" ? "350" : "310",
    );
    if (name === "精品") await page.locator("#calc-vip").fill("1900");
    const summary = page.getByText("成本明細與完整數值", { exact: true });
    if (!(await summary.evaluate((el) => el.parentElement.open)))
      await summary.click();
    await expect(page.locator('[data-testid^="exact-profit-"]')).toHaveCount(2);
    await expect(
      page.getByTestId("exact-profit-general").locator("dd").nth(1),
    ).toHaveText(profits[0]);
    await expect(
      page.getByTestId("exact-profit-vip").locator("dd").nth(1),
    ).toHaveText(profits[1]);
    await expect(page.getByTestId("exact-profit-general")).toContainText(
      "未設定低利潤提醒門檻",
    );
    await expect(page.getByTestId("exact-profit-vip")).toContainText(
      name === "精品" ? "低於 NT$0（等於不提醒）" : "未設定低利潤提醒門檻",
    );
  }
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("maximum manual Q remains editable and readable at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "精品");
  await fill(page, "999999999.999999", "350");
  await page.getByRole("button", { name: "人工輸入", exact: true }).click();
  const q = page.locator("#calc-q");
  await q.fill("999999999.9999999999");
  await expect(q).toHaveValue("999999999.9999999999");
  await expectUncoveredFocus(page);
  await page.locator("#calc-traffic").fill("33");
  await expect(q).toHaveValue("999999999.9999999999");
  await expect(page.getByTestId("total-cost")).toBeVisible();
  await page.getByText("成本明細與完整數值", { exact: true }).click();
  await expect(page.getByTestId("exact-profit-general")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

for (const statuses of [
  [409, 409, 201],
  [500, 201],
]) {
  test(`original merchant retry is isolated in mocks: ${statuses.join("-")}`, async ({
    page,
  }) => {
    const evidence = await mockCalculator(page, {
      firstStore: true,
      createStatuses: statuses,
    });
    await page.goto("/calculator");
    if (statuses[0] === 500) {
      await expect(
        page.getByText("初始化店鋪失敗", { exact: true }),
      ).toBeVisible();
      expect(evidence.writes).toEqual([
        { method: "POST", path: "/api/stores" },
      ]);
      await page.getByRole("button", { name: "重試", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "價格計算機", exact: true }),
    ).toBeVisible();
    expect(evidence.writes).toEqual(
      statuses.map(() => ({ method: "POST", path: "/api/stores" })),
    );
    await fill(page);
    await mode(page, "IP 商品");
    await fill(page, "1800", "170");
    expect(evidence.writes).toHaveLength(statuses.length);
    expect(evidence.errors).toEqual([]);
  });
}

async function expectUncoveredFocus(page) {
  // Coordinates and hit testing catch controls that toBeVisible() considers
  // visible even though the fixed navigation completely covers them.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const rect = active.getBoundingClientRect();
        const nav = document
          .querySelector(".calculator-page nav")
          .getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return (
          rect.top >= 0 &&
          rect.bottom < nav.top &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          !!hit &&
          active.contains(hit)
        );
      }),
    )
    .toBe(true);
}

test("traffic checkbox pointer activation and keyboard toggling survive focus reveal", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await fill(page);
  const checkbox = page.getByRole("checkbox");
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 295",
  );
  await expectUncoveredFocus(page);
  await page.keyboard.press("Space");
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 260",
  );
  await expectUncoveredFocus(page);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

for (const [name, width] of [
  ["一般版", 390],
  ["輕井澤果醬", 390],
  ["IP 商品", 390],
  ["精品", 390],
  ["精品", 320],
]) {
  test(`all keyboard controls clear fixed navigation: ${name} ${width}x480`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 480 });
    const evidence = await mockCalculator(page);
    await page.goto("/calculator");
    await mode(page, name);
    await fill(
      page,
      name === "精品" ? "8250" : name === "IP 商品" ? "1800" : "890",
      name === "精品" ? "350" : "310",
    );
    if (name === "精品") {
      await page.getByRole("button", { name: "人工輸入", exact: true }).click();
      await page.locator("#calc-vip").fill("1900");
    }
    if (name === "一般版") {
      // Exact independent-review repro: traffic -> checkbox -> clear summary.
      await page.locator("#calc-traffic").focus();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("checkbox")).toBeFocused();
      await expectUncoveredFocus(page);
      await page.keyboard.press("Tab");
      await expect(page.locator(".calc-clear summary")).toBeFocused();
      await expectUncoveredFocus(page);
      await page.screenshot({
        path: testInfo.outputPath("clear-summary-focus.png"),
      });
    }
    await page.locator(".calc-back").focus();
    const seen = [];
    for (let index = 0; index < 45; index++) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          navigation: !!el.closest("nav"),
          inPage: !!el.closest(".calculator-page"),
          id: el.id || el.textContent.trim(),
          closedSummary: el.tagName === "SUMMARY" && !el.parentElement.open,
        };
      });
      if (focused.navigation) break;
      expect(focused.inPage).toBe(true);
      await expectUncoveredFocus(page);
      seen.push(focused.id);
      if (focused.closedSummary) await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
    }
    expect(seen).toEqual(
      expect.arrayContaining([
        "calc-rate",
        "calc-price",
        "calc-weight",
        "calc-traffic",
        "清除與費用預設",
        "清除此模式商品資料",
        "恢復此模式費用預設",
        "清除匯率記憶",
        "成本明細與完整數值",
        "公式與進位說明",
      ]),
    );
    if (name === "精品")
      expect(seen).toEqual(
        expect.arrayContaining([
          "人工輸入",
          "恢復自動",
          "無退稅：設為原價",
          "calc-q",
          "calc-vip",
        ]),
      );
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("button")).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      await expect(nav.getByRole("button").nth(index)).toBeFocused();
      const uncovered = await nav
        .getByRole("button")
        .nth(index)
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        });
      expect(uncovered).toBe(true);
      if (index < 3) await page.keyboard.press("Tab");
    }
    // Portalled dialog keeps its own focus trap; cancelling restores a visible trigger.
    await page
      .getByRole("button", { name: "清除匯率記憶", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "取消", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "清除匯率記憶", exact: true }),
    ).toBeFocused();
    await expectUncoveredFocus(page);
    expect(evidence.writes).toEqual([]);
    expect(evidence.errors).toEqual([]);
  });
}

test("polite warnings announce crossings without repeating same-state typing", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  const live = page.getByTestId("calculation-announcements");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveAttribute("aria-atomic", "true");
  await expect(live).toHaveAttribute("role", "status");
  await mode(page, "IP 商品");
  await fill(page, "1800", "150");
  await page.waitForTimeout(650); // Deliberately observe beyond the 400ms debounce.
  await expect(live).toHaveText("");
  const weight = page.getByLabel("商品重量", { exact: false });
  await weight.fill("170");
  const warning = "IP 商品：0.26 原計算利潤低於 NT$50。售價不會自動調整。";
  await expect(live).toHaveText(warning);
  await expect(weight).toBeFocused();
  await live.evaluate((element) => {
    window.__calcLiveMutations = 0;
    new MutationObserver(() => window.__calcLiveMutations++).observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await weight.fill("171");
  await page.waitForTimeout(650);
  await weight.fill("");
  await page.waitForTimeout(650);
  await weight.fill("170");
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.__calcLiveMutations)).toBe(0);
  await expect(live).toHaveText(warning);
  await weight.fill("150");
  await expect(live).toHaveText("IP 商品：目前沒有低利潤或 VIP 低於成本提醒。");
  await weight.fill("170");
  await expect(live).toHaveText(warning);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("VIP warnings survive invalid input and resolve only with valid pricing", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "精品");
  await fill(page, "8250", "350");
  const vip = page.getByLabel("VIP 售價", { exact: false });
  const live = page.getByTestId("calculation-announcements");
  await vip.fill("1600");
  const warning = "精品：VIP 售價低於成本，請確認人工定價。售價不會自動調整。";
  await expect(live).toHaveText(warning);
  await vip.fill(".");
  await page.waitForTimeout(650);
  await expect(live).toHaveText(warning);
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 1990",
  );
  await vip.fill("1900");
  await expect(live).toHaveText("精品：目前沒有低利潤或 VIP 低於成本提醒。");
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("pricing details show exact rounding differences including two traffic rounds", async ({
  page,
}, testInfo) => {
  const evidence = await mockCalculator(page);
  const openDetails = async () => {
    const summary = page.getByText("公式與進位說明", { exact: true });
    if (!(await summary.evaluate((element) => element.parentElement.open)))
      await summary.click();
  };
  await page.goto("/calculator");
  await fill(page);
  await page.getByRole("checkbox").check();
  await page.getByText("公式與進位說明", { exact: true }).click();
  const numbers = (id) => page.getByTestId(`rounding-${id}`).locator("dd");
  await expect(numbers("general-base")).toHaveText([
    "255.2035",
    "260",
    "4.7965",
  ]);
  await expect(numbers("general-traffic")).toHaveText(["292", "295", "3"]);
  await mode(page, "輕井澤果醬");
  await fill(page);
  await openDetails();
  await expect(numbers("jam-general")).toHaveText([
    "347.2035",
    "350",
    "2.7965",
  ]);
  await mode(page, "IP 商品");
  await fill(page, "1980", "250");
  await openDetails();
  await expect(numbers("0.26-original")).toHaveText(["546.8", "546.8", "0"]);
  await expect(numbers("0.26-weight")).toHaveText(["601.8", "602", "0.2"]);
  await mode(page, "精品");
  await fill(page, "8250", "350");
  await openDetails();
  await expect(page.getByTestId("rounding-boutique-general")).toBeVisible();
  await expect(numbers("boutique-general")).toHaveText([
    "1989.23905625",
    "1990",
    "0.76094375",
  ]);
  await expect(page.getByTestId("total-cost")).toHaveAttribute(
    "title",
    "1687.12405625",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByTestId("rounding-boutique-general").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("review-rounding-mobile.png"),
    fullPage: true,
  });
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
test("standalone preview works without browser auth or API replacement", async ({
  page,
}, testInfo) => {
  const errors = [],
    writes = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      url.pathname.startsWith("/api/")
    )
      writes.push(url.pathname);
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(url.hostname);
  });
  // No Clerk/API fulfillment here: a user opening this URL must get a working
  // preview from the local server alone. Prevent accidental remote access.
  await page.route("https://**", (route) => route.abort());
  await page.goto("/calculator");
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#calculator-preview-banner")).toContainText(
    "MOCK",
  );
  await fill(page);
  await expect(page.getByTestId("total-cost")).toHaveText("205.20");
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 260",
  );
  await page.reload();
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue(
    "0.21",
  );
  await fill(page);
  await page.screenshot({
    path: testInfo.outputPath("standalone-preview.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
});
async function fill(page, price = "890", weight = "310") {
  await page.getByLabel("日本匯率", { exact: false }).fill("0.21");
  await page.getByLabel("商品原價", { exact: false }).fill(price);
  await page.getByLabel("商品重量", { exact: false }).fill(weight);
}
async function mode(page, name) {
  await page.getByRole("button", { name: new RegExp("^" + name) }).click();
}
test("four modes, manual precision, independent fees, three clears and no write intents", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue("");
  await fill(page);
  await expect(page.getByTestId("total-cost")).toHaveText("205.20");
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 260",
  );
  await page.getByRole("checkbox").check();
  await expect(page.getByTestId("general").locator(".calc-sale")).toHaveText(
    "NT$ 295",
  );
  await mode(page, "輕井澤果醬");
  await fill(page);
  await page.getByLabel("果醬獨立交通費", { exact: false }).fill("99");
  await mode(page, "一般版");
  await expect(
    page.getByLabel("均攤交通費", { exact: false }).first(),
  ).toHaveValue("32");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await mode(page, "精品");
  await fill(page, "1001.000001", "0");
  await expect(page.getByTestId("auto-q")).toHaveText("916.4155009155");
  const originalCost = await page
    .getByTestId("total-cost")
    .getAttribute("title");
  await page.getByRole("button", { name: "人工輸入", exact: true }).click();
  await expect(page.getByLabel("人工退稅後價格", { exact: false })).toHaveValue(
    "916.4155009155",
  );
  await expect(page.getByTestId("total-cost")).toHaveAttribute(
    "title",
    originalCost,
  );
  await page.getByLabel("商品原價", { exact: false }).fill("9000");
  await expect(page.getByLabel("人工退稅後價格", { exact: false })).toHaveValue(
    "916.4155009155",
  );
  await page.getByRole("button", { name: "無退稅：設為原價" }).click();
  await page.getByLabel("商品原價", { exact: false }).fill("8250");
  await page.getByLabel("VIP 售價", { exact: false }).fill("1900");
  await page.getByText("清除與費用預設", { exact: true }).click();
  await page
    .getByRole("button", { name: "恢復此模式費用預設", exact: true })
    .click();
  await expect(page.getByLabel("人工退稅後價格", { exact: false })).toHaveValue(
    "9000",
  );
  await expect(page.getByLabel("VIP 售價", { exact: false })).toHaveValue(
    "1900",
  );
  await page.getByRole("button", { name: "恢復自動", exact: true }).click();
  await expect(page.getByTestId("auto-q")).toHaveText("7552.875");
  await page.getByRole("button", { name: "清除匯率記憶", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue(
    "0.21",
  );
  await page.getByRole("button", { name: "清除匯率記憶", exact: true }).click();
  await page.getByRole("button", { name: "確認清除匯率", exact: true }).click();
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue("");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RATE_KEY),
  ).toBeNull();
  await expect(page.getByLabel("商品原價", { exact: false })).toHaveValue(
    "8250",
  );
  await page
    .getByRole("button", { name: "清除此模式商品資料", exact: true })
    .click();
  await expect(page.getByLabel("VIP 售價", { exact: false })).toHaveValue("");
  await expect(page.getByTestId("auto-q")).toHaveText("等待原價");
  await mode(page, "輕井澤果醬");
  await expect(page.getByLabel("果醬獨立交通費", { exact: false })).toHaveValue(
    "99",
  );
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
test("rate persistence, denied storage and failed deletion don't resurrect state", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await fill(page);
  await page.reload();
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue(
    "0.21",
  );
  await expect(page.getByLabel("商品原價", { exact: false })).toHaveValue("");
  await fill(page);
  await page.evaluate(() => {
    Storage.prototype.removeItem = function () {
      throw new DOMException("denied", "SecurityError");
    };
  });
  await page.getByText("清除與費用預設", { exact: true }).click();
  await page.getByRole("button", { name: "清除匯率記憶", exact: true }).click();
  await page.getByRole("button", { name: "確認清除匯率", exact: true }).click();
  await expect(page.getByText(/瀏覽器記憶刪除失敗/)).toBeVisible();
  await mode(page, "IP 商品");
  await page.getByLabel("商品原價", { exact: false }).fill("1800");
  await expect(page.getByLabel("日本匯率", { exact: false })).toHaveValue("");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RATE_KEY),
  ).toBe("0.21");
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("denied", "SecurityError");
    };
  });
  await fill(page, "1800", "170");
  await expect(page.getByTestId("total-cost")).toHaveText("453.07");
  await expect(page.getByText(/無法儲存到此瀏覽器/)).toBeVisible();
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
test("existing merchant initialization is separately mocked; calculator adds zero writes", async ({
  page,
}) => {
  const evidence = await mockCalculator(page, { firstStore: true });
  await page.goto("/calculator");
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  expect(evidence.writes).toEqual([{ method: "POST", path: "/api/stores" }]);
  const initializationWrites = evidence.writes.length;
  await fill(page);
  await mode(page, "IP 商品");
  await fill(page, "1800", "170");
  expect(evidence.writes.length).toBe(initializationWrites);
  expect(evidence.errors).toEqual([]);
});
test("calculator is available from settings only and retains four legacy navigation items", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /價格計算機/ })).toHaveCount(0);
  await nav.getByRole("button", { name: /設定$/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: /價格計算機/ }).click();
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(
    page.getByRole("heading", { name: "價格計算機", exact: true }),
  ).toBeVisible();
  await expect(nav.getByRole("button")).toHaveCount(4);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
test("signed-out direct calculator route remains protected", async ({
  page,
}) => {
  const evidence = await mockCalculator(page, { signedIn: false });
  await page.goto("/calculator");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#calc-price")).toHaveCount(0);
  expect(evidence.writes).toEqual([]);
});
for (const status of [401, 403, 500])
  test(`portal error ${status} does not create a store`, async ({ page }) => {
    const evidence = await mockCalculator(page, { storeStatus: status });
    await page.goto("/calculator");
    await expect(
      page.getByText(status === 500 ? "無法載入店鋪資料" : "登入狀態已失效", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("#calc-price")).toHaveCount(0);
    expect(evidence.writes).toEqual([]);
    expect(evidence.errors).toEqual([]);
  });
test("mock initialization failure remains in original failure UI", async ({
  page,
}) => {
  const evidence = await mockCalculator(page, {
    firstStore: true,
    createFailure: true,
  });
  await page.goto("/calculator");
  await expect(page.getByText("初始化店鋪失敗", { exact: true })).toBeVisible();
  await expect(page.locator("#calc-price")).toHaveCount(0);
  expect(evidence.writes).toEqual([{ method: "POST", path: "/api/stores" }]);
});
test("invalid intermediate values remove stale results and keyboard confirmation returns focus", async ({
  page,
}) => {
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "精品");
  await fill(page, "8250", "350");
  await page.getByRole("button", { name: "人工輸入", exact: true }).click();
  const q = page.getByLabel("人工退稅後價格", { exact: false });
  for (const value of ["", ".", "-1", "1e3", "1.12345678901"]) {
    await q.fill(value);
    await expect(page.getByTestId("total-cost")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "人工輸入", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await q.fill("7552.875");
  await expect(page.getByTestId("total-cost")).toHaveText("1687.12");
  await page.getByLabel("VIP 售價", { exact: false }).fill("invalid");
  await expect(page.getByTestId("total-cost")).toHaveText("1687.12");
  await expect(page.getByTestId("vip")).toHaveCount(0);
  await page.getByText("清除與費用預設", { exact: true }).click();
  const trigger = page.getByRole("button", {
    name: "清除匯率記憶",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "取消", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
for (const width of [320, 375, 390, 768, 1024, 1440])
  test(`responsive ${width}: original profit warning and no overflow`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = await mockCalculator(page);
    await page.goto("/calculator");
    await mode(page, "IP 商品");
    await fill(page, "1800", "170");
    await expect(page.getByTestId("total-cost")).toHaveText("453.07");
    const container = page.locator(
      width >= 1024 ? ".calc-ip-desktop" : ".calc-ip-mobile",
    );
    const quote = page.getByTestId(
      width >= 1024 ? "table-0.26-original" : "0.26-original",
    );
    await expect(quote).toContainText("46.93");
    await expect(
      quote.locator('[data-warning="PROFIT_BELOW_RECOMMENDED"]'),
    ).toBeVisible();
    await expect(container.getByTestId("weight-explanation")).toContainText(
      "156.05 g",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("#calc-price")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("16px");
    await page.screenshot({
      path: testInfo.outputPath(`ip-${width}.png`),
      fullPage: true,
    });
    expect(evidence.writes).toEqual([]);
    expect(evidence.errors).toEqual([]);
  });

for (const width of [390, 1440])
  for (const [name, key, cost, sale] of [
    ["一般版", "general", "205.20", "260"],
    ["輕井澤果醬", "jam", "237.20", "350"],
    ["精品", "boutique", "1687.12", "1990"],
  ])
    test(`capture ${key} ${width}: fixed cost, price and original navigation`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const evidence = await mockCalculator(page);
      await page.goto("/calculator");
      await mode(page, name);
      await fill(
        page,
        key === "boutique" ? "8250" : "890",
        key === "boutique" ? "350" : "310",
      );
      if (key === "boutique")
        await page.getByLabel("VIP 售價", { exact: false }).fill("1900");
      if (key === "boutique") {
        const vip = await page.locator("#calc-vip").boundingBox();
        const nav = await page.getByRole("navigation").boundingBox();
        expect(vip.y).toBeGreaterThanOrEqual(0);
        expect(vip.y + vip.height).toBeLessThan(nav.y);
      }
      await expect(page.getByTestId("total-cost")).toHaveText(cost);
      await expect(
        page.getByTestId("general").locator(".calc-sale"),
      ).toHaveText(`NT$ ${sale}`);
      await expect(
        page.getByRole("navigation").getByRole("button"),
      ).toHaveCount(4);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${key}-${width}.png`),
        fullPage: true,
      });
      expect(evidence.writes).toEqual([]);
      expect(evidence.errors).toEqual([]);
    });

test("focused VIP and fees stay above navigation in a 390x480 short viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "精品");
  await fill(page, "8250", "350");
  for (const [field, value] of [
    ["vip", "1900"],
    ["traffic", "32"],
  ]) {
    await page.locator(`#calc-${field}`).fill(value);
    const input = await page.locator(`#calc-${field}`).boundingBox(),
      nav = await page.getByRole("navigation").boundingBox();
    expect(input.y).toBeGreaterThanOrEqual(0);
    expect(input.y + input.height).toBeLessThan(nav.y);
  }
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test("maximum valid numbers fit at 320px and the last result clears bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const evidence = await mockCalculator(page);
  await page.goto("/calculator");
  await mode(page, "IP 商品");
  for (const field of ["price", "weight", "air", "traffic"])
    await page.locator(`#calc-${field}`).fill("999999999.999999");
  await page.locator("#calc-rate").fill("99.99999999");
  await expect(page.getByTestId("total-cost")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const last = page.locator(".calc-ip-mobile .calc-weight-note");
  await last.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const noteBox = await last.boundingBox(),
    navBox = await page.getByRole("navigation").boundingBox();
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(navBox.y);
  expect(evidence.writes).toEqual([]);
  expect(evidence.errors).toEqual([]);
});
