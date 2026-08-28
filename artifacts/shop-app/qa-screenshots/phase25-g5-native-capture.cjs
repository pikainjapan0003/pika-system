const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const playwrightModulePath =
  process.env.PLAYWRIGHT_MODULE_PATH ??
  "C:/Users/Lnovo/Desktop/pika-system/node_modules/@playwright/test";
const { chromium } = require(playwrightModulePath);

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4175";
const headed = process.env.PLAYWRIGHT_HEADED === "1";
const executablePath =
  process.env.CHROME_EXECUTABLE ??
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const outputDirectory = path.resolve(__dirname, "phase25-g5-motion");
const artifact = (suffix) =>
  path.join(outputDirectory, `phase25-g5-native-final-${suffix}`);

const paths = {
  board: artifact("board.png"),
  reduceA: artifact("reduce-a.png"),
  reduceB: artifact("reduce-b.png"),
  metrics: artifact("metrics.json"),
};

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({
    executablePath,
    headless: !headed,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
      "--disable-renderer-backgrounding",
      "--enable-gpu-rasterization",
      "--ignore-gpu-blocklist",
      "--use-angle=d3d11",
      "--window-size=1440,1000",
    ],
  });

  const consoleErrors = [];
  const pageErrors = [];

  function attachDiagnostics(page, label) {
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push({ label, text: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push({ label, message: error.message });
    });
  }

  async function openBoard(context, label) {
    const page = await context.newPage();
    attachDiagnostics(page, label);
    await page.goto(`${baseURL}/reports/monthly-profit?view=kpi`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.getByTestId("sonar-whale").waitFor({
      state: "visible",
      timeout: 120_000,
    });
    await page.locator(".particle-whale-canvas").waitFor({
      state: "visible",
      timeout: 120_000,
    });
    await page.waitForFunction(() =>
      /NT\$/.test(
        document
          .querySelector("[data-kpi='finalProfit'] strong")
          ?.textContent?.trim() ?? "",
      ),
    );
    return page;
  }

  async function measureTransition(page, kind) {
    return page.evaluate(async (transitionKind) => {
      const target = document.querySelector(
        `[data-testid='${transitionKind}-transition']`,
      );
      const control =
        transitionKind === "mode"
          ? [
              ...document.querySelectorAll(
                "[aria-label='KPI 資料模式'] button",
              ),
            ].find((button) => button.textContent?.trim() === "實際")
          : document.querySelector("[data-testid='tab-profit']");

      if (
        !(target instanceof HTMLElement) ||
        !(control instanceof HTMLElement)
      ) {
        throw new Error(`${transitionKind} transition controls are missing`);
      }

      const read = (startedAt) => {
        const style = getComputedStyle(target);
        return {
          elapsedMs: performance.now() - startedAt,
          opacity: Number(style.opacity),
          phase: target.dataset.transitionPhase ?? null,
          resultText:
            target
              .querySelector("[data-kpi='finalProfit'] strong")
              ?.textContent?.trim() ?? "",
          categoryTitle:
            document
              .querySelector("#kpi-category-title")
              ?.textContent?.trim() ?? "",
          sonarPaused:
            document
              .querySelector("[data-testid='sonar-whale']")
              ?.getAttribute("data-sonar-interaction-paused") ?? null,
          transform: style.transform,
        };
      };

      const startedAt = performance.now();
      const transitionEvents = [];
      const phaseChanges = [read(startedAt)];
      const onTransitionEvent = (event) => {
        if (event.target !== target) return;
        transitionEvents.push({
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          elapsedTimeMs: Math.round(event.elapsedTime * 100_000) / 100,
          propertyName: event.propertyName,
          type: event.type,
        });
      };
      for (const eventName of [
        "transitionrun",
        "transitionstart",
        "transitionend",
      ]) {
        target.addEventListener(eventName, onTransitionEvent);
      }
      const observer = new MutationObserver(() =>
        phaseChanges.push(read(startedAt)),
      );
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["data-transition-phase"],
      });
      if (transitionKind === "mode") {
        control.click();
      } else {
        control.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      }

      const samples = [read(startedAt)];
      let sawActive = samples[0].phase !== "idle";

      while (performance.now() - startedAt < 1_000) {
        await new Promise(requestAnimationFrame);
        const sample = read(startedAt);
        samples.push(sample);
        if (sample.phase !== "idle") sawActive = true;
        if (sawActive && sample.phase === "idle" && sample.opacity >= 0.99)
          break;
      }
      observer.disconnect();
      for (const eventName of [
        "transitionrun",
        "transitionstart",
        "transitionend",
      ]) {
        target.removeEventListener(eventName, onTransitionEvent);
      }

      const allReadings = [...samples, ...phaseChanges].sort(
        (left, right) => left.elapsedMs - right.elapsedMs,
      );
      const phaseSequence = phaseChanges
        .filter(
          (sample, index) =>
            index === 0 || sample.phase !== phaseChanges[index - 1].phase,
        )
        .map((sample) => ({
          elapsedMs: Math.round(sample.elapsedMs * 10) / 10,
          opacity: Math.round(sample.opacity * 1_000) / 1_000,
          phase: sample.phase,
          resultText: sample.resultText,
          categoryTitle: sample.categoryTitle,
          sonarPaused: sample.sonarPaused,
        }));
      const firstContentSwap = allReadings.find((sample, index) => {
        if (index === 0) return false;
        return transitionKind === "mode"
          ? sample.resultText !== allReadings[0].resultText
          : sample.categoryTitle !== allReadings[0].categoryTitle;
      });
      const frameIntervals = samples
        .slice(1)
        .map((sample, index) => sample.elapsedMs - samples[index].elapsedMs)
        .sort((left, right) => left - right);
      const rafMedianMs =
        frameIntervals.length === 0
          ? null
          : frameIntervals[Math.floor(frameIntervals.length / 2)];
      const opacityTransitionEnds = transitionEvents.filter(
        (event) =>
          event.type === "transitionend" && event.propertyName === "opacity",
      );
      const compositorActiveDurationMs = opacityTransitionEnds.reduce(
        (total, event) => total + event.elapsedTimeMs,
        0,
      );

      return {
        actualMs: Math.round(samples.at(-1).elapsedMs * 10) / 10,
        compositorActiveDurationMs:
          Math.round(compositorActiveDurationMs * 10) / 10,
        contentSwap: firstContentSwap
          ? {
              elapsedMs: Math.round(firstContentSwap.elapsedMs * 10) / 10,
              opacity: Math.round(firstContentSwap.opacity * 1_000) / 1_000,
            }
          : null,
        finalPhase: samples.at(-1).phase,
        minimumOpacity:
          Math.round(
            Math.min(...allReadings.map((sample) => sample.opacity)) * 1_000,
          ) / 1_000,
        nominalMs: Number(target.dataset.transitionTotalDurationMs),
        phaseSequence,
        rafMedianMs:
          rafMedianMs == null ? null : Math.round(rafMedianMs * 10) / 10,
        sampleCount: samples.length,
        sonarPausedThroughoutActive: samples
          .filter((sample) => sample.phase !== "idle")
          .every((sample) => sample.sonarPaused === "true"),
        timingEnvironmentValid:
          samples.length >= 8 && rafMedianMs !== null && rafMedianMs <= 25,
        transitionEvents,
      };
    }, kind);
  }

  async function rapidRetarget(page) {
    return page.evaluate(async () => {
      const differenceButton = [
        ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
      ].find((button) => button.textContent?.trim() === "差異");
      const estimateButton = [
        ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
      ].find((button) => button.textContent?.trim() === "預估");
      const costButton = document.querySelector("[data-testid='tab-cost']");
      const overviewButton = document.querySelector(
        "[data-testid='tab-overview']",
      );
      if (
        !(differenceButton instanceof HTMLButtonElement) ||
        !(estimateButton instanceof HTMLButtonElement) ||
        !(costButton instanceof HTMLButtonElement) ||
        !(overviewButton instanceof HTMLButtonElement)
      ) {
        throw new Error("Rapid-retarget controls are missing");
      }
      const pressTab = (button) =>
        button.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      const waitFor = async (predicate) => {
        const startedAt = performance.now();
        while (!predicate() && performance.now() - startedAt < 1_000) {
          await new Promise(requestAnimationFrame);
        }
        return predicate();
      };

      differenceButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      estimateButton.click();
      const modeSettled = await waitFor(
        () =>
          estimateButton.getAttribute("aria-pressed") === "true" &&
          document
            .querySelector("[data-testid='mode-transition']")
            ?.getAttribute("data-transition-phase") === "idle" &&
          (
            document.querySelector("[data-kpi='finalProfit'] strong")
              ?.textContent ?? ""
          ).includes("33,791"),
      );

      pressTab(costButton);
      await new Promise((resolve) => setTimeout(resolve, 40));
      pressTab(overviewButton);
      const categorySettled = await waitFor(
        () =>
          overviewButton.getAttribute("data-state") === "active" &&
          document
            .querySelector("[data-testid='category-transition']")
            ?.getAttribute("data-transition-phase") === "idle" &&
          (
            document.querySelector("#kpi-category-title")?.textContent ?? ""
          ).startsWith("概覽"),
      );

      return {
        categorySettled,
        finalCategory:
          document
            .querySelector("[role='tab'][data-state='active']")
            ?.textContent?.trim() ?? null,
        finalMode:
          [...document.querySelectorAll("[aria-pressed='true']")]
            .find((element) =>
              ["預估", "實際", "差異"].includes(element.textContent?.trim()),
            )
            ?.textContent?.trim() ?? null,
        modeSettled,
        sonarPaused:
          document
            .querySelector("[data-testid='sonar-whale']")
            ?.getAttribute("data-sonar-interaction-paused") ?? null,
      };
    });
  }

  async function reducedEvidence() {
    const context = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await openBoard(context, "reduced");
    const before = await page.evaluate(() => {
      const ids = ["radar-sweep", "sonar-breathe", "sonar-particles"];
      return {
        matchMediaReduce: matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        elements: ids.map((id) => {
          const element = document.querySelector(`[data-testid='${id}']`);
          const style = getComputedStyle(element);
          return {
            animationCount: element.getAnimations({ subtree: true }).length,
            animationName: style.animationName,
            display: style.display,
            id,
          };
        }),
        moAnimationCount: ids.reduce((count, id) => {
          const element = document.querySelector(`[data-testid='${id}']`);
          return count + element.getAnimations({ subtree: true }).length;
        }, 0),
        resultText:
          document
            .querySelector("[data-kpi='finalProfit'] strong")
            ?.textContent?.trim() ?? "",
      };
    });
    await page.screenshot({ fullPage: false, path: paths.reduceA });
    await page.waitForTimeout(1_000);
    await page.screenshot({ fullPage: false, path: paths.reduceB });
    const switchResult = await page.evaluate(() => {
      const actualButton = [
        ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
      ].find((button) => button.textContent?.trim() === "實際");
      const profitTab = document.querySelector("[data-testid='tab-profit']");
      actualButton.click();
      profitTab.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      return {
        categoryPhase: document
          .querySelector("[data-testid='category-transition']")
          ?.getAttribute("data-transition-phase"),
        categorySelected: profitTab.getAttribute("data-state") === "active",
        categoryTitle:
          document.querySelector("#kpi-category-title")?.textContent?.trim() ??
          "",
        modePhase: document
          .querySelector("[data-testid='mode-transition']")
          ?.getAttribute("data-transition-phase"),
        modeResult:
          document
            .querySelector("[data-kpi='finalProfit'] strong")
            ?.textContent?.trim() ?? "",
        modeSelected: actualButton.getAttribute("aria-pressed") === "true",
      };
    });
    await context.close();
    return {
      before,
      screenshotAHash: createHash("sha256")
        .update(await readFile(paths.reduceA))
        .digest("hex"),
      screenshotBHash: createHash("sha256")
        .update(await readFile(paths.reduceB))
        .digest("hex"),
      switchResult,
    };
  }

  let context;
  try {
    context = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "no-preference",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await openBoard(context, "normal");
    const environment = await page.evaluate(() => {
      const canvas = document.querySelector(".particle-whale-canvas");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        canvasCount: document.querySelectorAll(".particle-whale-canvas").length,
        matchMediaReduce: matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        renderer:
          gl && debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : (gl?.getParameter(gl.RENDERER) ?? null),
        userAgent: navigator.userAgent,
        webglVersion: gl?.getParameter(gl.VERSION) ?? null,
      };
    });

    const mode = await measureTransition(page, "mode");
    const category = await measureTransition(page, "category");
    const retarget = await rapidRetarget(page);
    await page.screenshot({ fullPage: true, path: paths.board });
    const reduced = await reducedEvidence();

    const checks = {
      categoryCompositorDurationWithin150To250Ms:
        category.compositorActiveDurationMs >= 150 &&
        category.compositorActiveDurationMs <= 250,
      categoryHasTwoSeventyFiveMsOpacityTransitions:
        category.transitionEvents.filter(
          (event) =>
            event.type === "transitionend" && event.propertyName === "opacity",
        ).length === 2 &&
        category.transitionEvents
          .filter(
            (event) =>
              event.type === "transitionend" &&
              event.propertyName === "opacity",
          )
          .every((event) => Math.abs(event.elapsedTimeMs - 75) <= 1),
      categoryWallClockWithinRangeWhenEnvironmentValid:
        !category.timingEnvironmentValid ||
        (category.actualMs >= 150 && category.actualMs <= 250),
      categoryContentSwapsNearTrough:
        category.contentSwap !== null && category.contentSwap.opacity <= 0.15,
      categoryFadePainted: category.minimumOpacity <= 0.15,
      categoryPhaseSequence:
        category.phaseSequence.map((sample) => sample.phase).join(",") ===
        "idle,out,in,idle",
      categorySonarPaused: category.sonarPausedThroughoutActive,
      modeCompositorDurationWithin150To250Ms:
        mode.compositorActiveDurationMs >= 150 &&
        mode.compositorActiveDurationMs <= 250,
      modeHasTwoSeventyFiveMsOpacityTransitions:
        mode.transitionEvents.filter(
          (event) =>
            event.type === "transitionend" && event.propertyName === "opacity",
        ).length === 2 &&
        mode.transitionEvents
          .filter(
            (event) =>
              event.type === "transitionend" &&
              event.propertyName === "opacity",
          )
          .every((event) => Math.abs(event.elapsedTimeMs - 75) <= 1),
      modeWallClockWithinRangeWhenEnvironmentValid:
        !mode.timingEnvironmentValid ||
        (mode.actualMs >= 150 && mode.actualMs <= 250),
      modeContentSwapsNearTrough:
        mode.contentSwap !== null && mode.contentSwap.opacity <= 0.15,
      modeFadePainted: mode.minimumOpacity <= 0.1,
      modePhaseSequence:
        mode.phaseSequence.map((sample) => sample.phase).join(",") ===
        "idle,out,in,idle",
      modeSonarPaused: mode.sonarPausedThroughoutActive,
      nativeWebglCanvasMounted: environment.canvasCount === 1,
      nominalContract150Ms:
        mode.nominalMs === 150 && category.nominalMs === 150,
      rapidRetargetSettles:
        retarget.modeSettled &&
        retarget.categorySettled &&
        retarget.finalMode === "預估" &&
        retarget.finalCategory === "概覽" &&
        retarget.sonarPaused === "false",
      reducedMotionAllMoHidden:
        reduced.before.matchMediaReduce &&
        reduced.before.moAnimationCount === 0 &&
        reduced.before.elements.every(
          (element) =>
            element.display === "none" && element.animationName === "none",
        ),
      reducedMotionImmediateState:
        reduced.switchResult.modeSelected &&
        reduced.switchResult.categorySelected &&
        reduced.switchResult.modePhase === "idle" &&
        reduced.switchResult.categoryPhase === "idle" &&
        reduced.switchResult.modeResult.includes("27,607") &&
        reduced.switchResult.categoryTitle.startsWith("損益"),
      reducedMotionScreenshotsIdentical:
        reduced.screenshotAHash === reduced.screenshotBHash,
    };

    const metrics = {
      browserVersion: browser.version(),
      category,
      checks,
      consoleErrors,
      environment,
      generatedAt: new Date().toISOString(),
      mode,
      pageErrors,
      passed:
        Object.values(checks).every(Boolean) &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0,
      paths,
      reduced,
      retarget,
    };

    await writeFile(paths.metrics, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(JSON.stringify(metrics, null, 2));

    assert.equal(metrics.passed, true, "Native G5 motion gate failed");
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
