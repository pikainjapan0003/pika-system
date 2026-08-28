const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const playwrightModulePath =
  process.env.PLAYWRIGHT_MODULE_PATH ??
  "C:/Users/Lnovo/Desktop/pika-system/node_modules/@playwright/test";
const { chromium } = require(playwrightModulePath);
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4175";
const executablePath =
  process.env.CHROME_EXECUTABLE ??
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const headed = process.env.PLAYWRIGHT_HEADED === "1";
const outputDirectory = path.resolve(__dirname, "phase25-g5-motion");
const artifact = (suffix) =>
  path.join(outputDirectory, `phase25-g5-concurrent-final-${suffix}`);
const paths = {
  board: artifact("board.png"),
  frame0: artifact("mo4-mode-000ms.png"),
  frame75: artifact("mo4-mode-075ms.png"),
  frame150: artifact("mo4-mode-150ms.png"),
  metrics: artifact("metrics.json"),
  reduceA: artifact("reduce-a.png"),
  reduceB: artifact("reduce-b.png"),
};

function forcedCadenceInitScript() {
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  let forceSyntheticCadence = true;
  let lastNativeTimestamp = null;
  let syntheticTimestamp = performance.now();
  let syntheticFrameCount = 0;
  window.__phase25ForcedCadence = {
    get frameCount() {
      return syntheticFrameCount;
    },
    release() {
      forceSyntheticCadence = false;
    },
  };
  window.requestAnimationFrame = (callback) =>
    nativeRequestAnimationFrame((nativeTimestamp) => {
      if (!forceSyntheticCadence) {
        callback(nativeTimestamp);
        return;
      }
      if (nativeTimestamp !== lastNativeTimestamp) {
        syntheticTimestamp += 16.7;
        syntheticFrameCount += 1;
        lastNativeTimestamp = nativeTimestamp;
      }
      callback(syntheticTimestamp);
    });
}

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
      if (message.type() === "error")
        consoleErrors.push({ label, text: message.text() });
    });
    page.on("pageerror", (error) =>
      pageErrors.push({ label, message: error.message }),
    );
  }

  async function createContext({
    forceFull = false,
    reducedMotion = "no-preference",
  } = {}) {
    const context = await browser.newContext({
      colorScheme: "dark",
      reducedMotion,
      viewport: { width: 1440, height: 1000 },
    });
    if (forceFull) await context.addInitScript(forcedCadenceInitScript);
    return context;
  }

  async function openBoard(context, label, expectedCadence) {
    const page = await context.newPage();
    attachDiagnostics(page, label);
    await page.goto(`${baseURL}/reports/monthly-profit?view=kpi`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page
      .getByTestId("sonar-whale")
      .waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(() =>
      /NT\$/.test(
        document
          .querySelector("[data-kpi='finalProfit'] strong")
          ?.textContent?.trim() ?? "",
      ),
    );
    await page.waitForFunction(
      (expected) =>
        ["mode-transition", "category-transition"].every((testId) => {
          const cadence = document
            .querySelector(`[data-testid='${testId}']`)
            ?.getAttribute("data-mo4-cadence");
          return expected
            ? cadence === expected
            : cadence === "full" || cadence === "degraded";
        }),
      expectedCadence ?? null,
    );
    return page;
  }

  async function releaseForcedCadence(page) {
    return page.evaluate(() => {
      const controller = window.__phase25ForcedCadence;
      const evidence = {
        installed: controller != null,
        syntheticFrameCount: controller?.frameCount ?? 0,
      };
      controller?.release();
      return evidence;
    });
  }

  async function measureRafBaseline(page) {
    return page.evaluate(async () => {
      const timestamps = [];
      for (let index = 0; index < 31; index += 1) {
        await new Promise((resolve) =>
          requestAnimationFrame((timestamp) => {
            timestamps.push(timestamp);
            resolve();
          }),
        );
      }
      const intervals = timestamps
        .slice(1)
        .map((timestamp, index) => timestamp - timestamps[index]);
      const sorted = [...intervals].sort((left, right) => left - right);
      return {
        intervalCount: intervals.length,
        maximumMs: Math.round(Math.max(...intervals) * 10) / 10,
        medianMs:
          Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10,
        minimumMs: Math.round(Math.min(...intervals) * 10) / 10,
      };
    });
  }

  async function controlledFrames() {
    const context = await createContext({ forceFull: true });
    try {
      const page = await openBoard(context, "forced-full-frames", "full");
      const cadenceOverride = await releaseForcedCadence(page);
      await page.evaluate(() => {
        const preserveControlledLayers = (event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.closest("[data-motion='MO-4']")
          ) {
            event.stopImmediatePropagation();
          }
        };
        document.addEventListener(
          "transitionend",
          preserveControlledLayers,
          true,
        );
        document.addEventListener(
          "transitioncancel",
          preserveControlledLayers,
          true,
        );
      });
      const setup = await page.evaluate(() => {
        const actualButton = [
          ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
        ].find((button) => button.textContent?.trim() === "實際");
        if (!(actualButton instanceof HTMLButtonElement)) {
          throw new Error("Actual-mode control was not found");
        }
        actualButton.click();
        const wrappers = [
          document.querySelector("[data-testid='mode-transition']"),
          document.querySelector("[data-testid='category-transition']"),
        ];
        for (const wrapper of wrappers) {
          if (wrapper instanceof HTMLElement) void wrapper.offsetWidth;
        }
        const transitions = wrappers.flatMap((wrapper) =>
          wrapper
            ? [
                ...wrapper.querySelectorAll(
                  ".mo4-layer-outgoing, .mo4-layer-incoming",
                ),
              ].flatMap((element) =>
                element
                  .getAnimations()
                  .filter(
                    (animation) =>
                      animation instanceof CSSTransition &&
                      animation.effect?.target === element &&
                      ["opacity", "transform"].includes(
                        animation.transitionProperty,
                      ),
                  ),
              )
            : [],
        );
        for (const transition of transitions) transition.pause();
        window.__phase25ControlledTransitions = transitions;
        return {
          cssAnimationCount: wrappers.reduce(
            (count, wrapper) =>
              count +
              (wrapper
                ? [
                    ...wrapper.querySelectorAll(
                      ".mo4-layer-outgoing, .mo4-layer-incoming",
                    ),
                  ].flatMap((element) =>
                    element
                      .getAnimations()
                      .filter(
                        (animation) =>
                          animation instanceof CSSAnimation &&
                          animation.effect?.target === element,
                      ),
                  ).length
                : 0),
            0,
          ),
          transitionCount: transitions.length,
          transitionProperties: [
            ...new Set(transitions.map((item) => item.transitionProperty)),
          ],
          transitionDurationsMs: [
            ...new Set(
              transitions.map((transition) =>
                Math.round(transition.effect.getTiming().duration),
              ),
            ),
          ],
        };
      });
      const samples = {};
      for (const [label, currentTime, outputPath] of [
        ["at0", 0, paths.frame0],
        ["at75", 75, paths.frame75],
        ["at150", 149.9, paths.frame150],
      ]) {
        samples[label] = await page.evaluate((sampleTime) => {
          const transitions = window.__phase25ControlledTransitions ?? [];
          for (const transition of transitions)
            transition.currentTime = sampleTime;
          const read = (wrapperTestId, layerClass) => {
            const element = document.querySelector(
              `[data-testid='${wrapperTestId}'] .${layerClass}`,
            );
            if (!(element instanceof HTMLElement)) return null;
            const style = getComputedStyle(element);
            return {
              opacity: Number(style.opacity),
              transform: style.transform,
            };
          };
          return {
            categoryIncoming: read("category-transition", "mo4-layer-incoming"),
            categoryOutgoing: read("category-transition", "mo4-layer-outgoing"),
            modeIncoming: read("mode-transition", "mo4-layer-incoming"),
            modeOutgoing: read("mode-transition", "mo4-layer-outgoing"),
            sampledTimeMs: sampleTime,
          };
        }, currentTime);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await page
          .getByTestId("mode-transition")
          .screenshot({ path: outputPath });
      }
      await page.screenshot({ fullPage: true, path: paths.board });
      return {
        cadenceOverride,
        captureMode: "actual-final-source-forced-full-cadence-css-transitions",
        setup,
        ...samples,
      };
    } finally {
      await context.close();
    }
  }

  async function rapidRetarget(kind) {
    const context = await createContext({ forceFull: true });
    try {
      const page = await openBoard(
        context,
        `forced-full-rapid-${kind}`,
        "full",
      );
      const cadenceOverride = await releaseForcedCadence(page);
      const result = await page.evaluate(async (transitionKind) => {
        const wrapper = document.querySelector(
          `[data-testid='${transitionKind}-transition']`,
        );
        const modeButtons = [
          ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
        ];
        const named = (name) =>
          modeButtons.find((button) => button.textContent?.trim() === name);
        const firstControl =
          transitionKind === "mode"
            ? named("差異")
            : document.querySelector("[data-testid='tab-cost']");
        const reverseControl =
          transitionKind === "mode"
            ? named("預估")
            : document.querySelector("[data-testid='tab-overview']");
        if (
          !(wrapper instanceof HTMLElement) ||
          !(firstControl instanceof HTMLElement) ||
          !(reverseControl instanceof HTMLElement)
        ) {
          throw new Error(`${transitionKind} rapid-retarget controls missing`);
        }
        const activate = (control) => {
          if (transitionKind === "mode") control.click();
          else {
            control.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                button: 0,
              }),
            );
          }
        };
        const readPresentation = (element) => {
          const style = getComputedStyle(element);
          const matrix = new DOMMatrixReadOnly(style.transform);
          return { opacity: Number(style.opacity), translateY: matrix.m42 };
        };
        const waitFor = async (predicate, timeoutMs = 1_000) => {
          const startedAt = performance.now();
          while (!predicate() && performance.now() - startedAt < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          return predicate();
        };
        const layerElements = () =>
          [
            ...wrapper.querySelectorAll(
              ".mo4-layer-outgoing, .mo4-layer-incoming",
            ),
          ].filter((element) => element instanceof HTMLElement);
        const layerTransitions = () =>
          layerElements().flatMap((element) =>
            element
              .getAnimations()
              .filter(
                (animation) =>
                  animation instanceof CSSTransition &&
                  animation.effect?.target === element &&
                  ["opacity", "transform"].includes(
                    animation.transitionProperty,
                  ),
              ),
          );
        const layerCssAnimations = () =>
          layerElements().flatMap((element) =>
            element
              .getAnimations()
              .filter(
                (animation) =>
                  animation instanceof CSSAnimation &&
                  animation.effect?.target === element,
              ),
          );
        const setControlledTime = (transitions, timeMs) => {
          for (const transition of transitions) {
            transition.pause();
            transition.currentTime = timeMs;
          }
          void wrapper.offsetWidth;
        };

        activate(firstControl);
        await waitFor(
          () =>
            wrapper.dataset.transitionState === "active" &&
            wrapper.querySelector(".mo4-layer-outgoing") &&
            wrapper.querySelector(".mo4-layer-incoming") &&
            layerTransitions().length >= 4,
        );
        const firstTransitions = layerTransitions();
        setControlledTime(firstTransitions, 40);
        const beforeIncoming = wrapper.querySelector(".mo4-layer-incoming");
        const beforeOutgoing = wrapper.querySelector(".mo4-layer-outgoing");
        if (
          !(beforeIncoming instanceof HTMLElement) ||
          !(beforeOutgoing instanceof HTMLElement)
        ) {
          throw new Error(
            `${transitionKind} first transition did not create both layers`,
          );
        }
        const before = {
          incoming: readPresentation(beforeIncoming),
          outgoing: readPresentation(beforeOutgoing),
        };
        const cssAnimationCountBefore = layerCssAnimations().length;
        activate(reverseControl);
        await waitFor(() => layerTransitions().length >= 4);
        const afterIncoming = wrapper.querySelector(".mo4-layer-incoming");
        const afterOutgoing = wrapper.querySelector(".mo4-layer-outgoing");
        if (
          !(afterIncoming instanceof HTMLElement) ||
          !(afterOutgoing instanceof HTMLElement)
        ) {
          throw new Error(`${transitionKind} reverse transition lost a layer`);
        }
        const retargetTransitions = layerTransitions();
        setControlledTime(retargetTransitions, 0);
        const after = {
          incoming: readPresentation(afterIncoming),
          outgoing: readPresentation(afterOutgoing),
        };
        const transitionPropertiesAfter = [
          ...new Set(
            retargetTransitions.map(
              (animation) => animation.transitionProperty,
            ),
          ),
        ];
        const cssAnimationCountAfter = layerCssAnimations().length;
        for (const transition of retargetTransitions) transition.finish();
        const settled = await waitFor(
          () => wrapper.dataset.transitionState === "idle",
          1_000,
        );
        const selected =
          transitionKind === "mode"
            ? reverseControl.getAttribute("aria-pressed") === "true"
            : reverseControl.getAttribute("data-state") === "active";
        const finalContent =
          transitionKind === "mode"
            ? (document
                .querySelector("[data-kpi='finalProfit'] strong")
                ?.textContent?.trim() ?? "")
            : (document
                .querySelector("#kpi-category-title")
                ?.textContent?.trim() ?? "");
        return {
          after,
          before,
          cadence: wrapper.dataset.mo4Cadence ?? null,
          cssAnimationCountAfter,
          cssAnimationCountBefore,
          finalContent,
          finalSelected: selected,
          finalSonarPaused:
            document
              .querySelector("[data-testid='sonar-whale']")
              ?.getAttribute("data-sonar-interaction-paused") ?? null,
          finalState: wrapper.dataset.transitionState ?? null,
          firstIncomingBecameOutgoing: afterOutgoing === beforeIncoming,
          firstOutgoingBecameIncoming: afterIncoming === beforeOutgoing,
          noOutgoingAfterSettle:
            wrapper.querySelector(".mo4-layer-outgoing") == null,
          retargetDelayMs: 40,
          settled,
          transitionPropertiesAfter,
        };
      }, kind);
      return { cadenceOverride, ...result };
    } finally {
      await context.close();
    }
  }

  async function nativeDegradedEvidence() {
    const context = await createContext();
    try {
      const page = await openBoard(context, "native-degraded");
      const rafBaseline = await measureRafBaseline(page);
      const result = await page.evaluate(() => {
        const wrapper = document.querySelector(
          "[data-testid='mode-transition']",
        );
        const actualButton = [
          ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
        ].find((button) => button.textContent?.trim() === "實際");
        if (
          !(wrapper instanceof HTMLElement) ||
          !(actualButton instanceof HTMLElement)
        ) {
          throw new Error("Native degraded mode control missing");
        }
        const startedAt = performance.now();
        actualButton.click();
        const elapsedMs = performance.now() - startedAt;
        const animations = wrapper.getAnimations({ subtree: true });
        return {
          cadence: wrapper.dataset.mo4Cadence ?? null,
          cssAnimationCount: animations.filter(
            (animation) => animation instanceof CSSAnimation,
          ).length,
          elapsedMs,
          finalContent:
            document
              .querySelector("[data-kpi='finalProfit'] strong")
              ?.textContent?.trim() ?? "",
          finalSelected: actualButton.getAttribute("aria-pressed") === "true",
          finalSonarPaused:
            document
              .querySelector("[data-testid='sonar-whale']")
              ?.getAttribute("data-sonar-interaction-paused") ?? null,
          finalState: wrapper.dataset.transitionState ?? null,
          outgoingLayerCount: wrapper.querySelectorAll(".mo4-layer-outgoing")
            .length,
          transitionCount: animations.filter(
            (animation) => animation instanceof CSSTransition,
          ).length,
        };
      });
      return { rafBaseline, ...result };
    } finally {
      await context.close();
    }
  }

  async function reducedEvidence() {
    const context = await createContext({ reducedMotion: "reduce" });
    try {
      const page = await openBoard(context, "reduced");
      const settlePaint = () =>
        page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
      const readLayout = () =>
        page.evaluate(() => {
          const rectOf = (element) => {
            const rect = element.getBoundingClientRect();
            return {
              bottom: Math.round(rect.bottom * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
              left: Math.round(rect.left * 10) / 10,
              right: Math.round(rect.right * 10) / 10,
              top: Math.round(rect.top * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
            };
          };
          const rendered = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility === "visible" &&
              Number(style.opacity) > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          };
          const intersectionArea = (left, right) =>
            Math.max(
              0,
              Math.min(left.right, right.right) -
                Math.max(left.left, right.left),
            ) *
            Math.max(
              0,
              Math.min(left.bottom, right.bottom) -
                Math.max(left.top, right.top),
            );
          const values = [...document.querySelectorAll("[data-kpi] strong")];
          const valueRects = values.map(rectOf);
          const overlaps = [];
          for (let left = 0; left < valueRects.length; left += 1) {
            for (let right = left + 1; right < valueRects.length; right += 1) {
              if (intersectionArea(valueRects[left], valueRects[right]) > 0)
                overlaps.push([left, right]);
            }
          }
          const heading = [...document.querySelectorAll("h1, h2")].find(
            (element) => element.textContent?.trim() === "KPI 分析室",
          );
          const title = document.querySelector("#kpi-category-title");
          const renderedLeafTextCount = [
            ...document.querySelectorAll("body *"),
          ].filter(
            (element) =>
              element.children.length === 0 &&
              (element.textContent?.trim().length ?? 0) > 0 &&
              element instanceof HTMLElement &&
              rendered(element),
          ).length;
          return {
            categoryTitle: title?.textContent?.trim() ?? null,
            categoryTitleRendered:
              title instanceof HTMLElement && rendered(title),
            documentAnimationCount: document.getAnimations().length,
            fontsStatus: document.fonts.status,
            headingRendered:
              heading instanceof HTMLElement && rendered(heading),
            kpiRects: valueRects,
            kpiValueCount: values.length,
            kpiValuesRendered: values.every(
              (element) => element instanceof HTMLElement && rendered(element),
            ),
            kpiValueTexts: values.map(
              (element) => element.textContent?.trim() ?? "",
            ),
            outgoingLayerCount: document.querySelectorAll(".mo4-layer-outgoing")
              .length,
            overlappingKpiPairs: overlaps,
            renderedLeafTextCount,
          };
        });
      await settlePaint();
      const before = await page.evaluate(() => {
        const ids = ["radar-sweep", "sonar-breathe", "sonar-particles"];
        return {
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
          matchMediaReduce: matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
          moAnimationCount: ids.reduce((count, id) => {
            const element = document.querySelector(`[data-testid='${id}']`);
            return count + element.getAnimations({ subtree: true }).length;
          }, 0),
        };
      });
      const layoutA = await readLayout();
      await page.screenshot({ fullPage: false, path: paths.reduceA });
      await page.waitForTimeout(1_000);
      await settlePaint();
      const layoutB = await readLayout();
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
        const wrappers = [
          document.querySelector("[data-testid='mode-transition']"),
          document.querySelector("[data-testid='category-transition']"),
        ];
        return {
          categorySelected: profitTab.getAttribute("data-state") === "active",
          categoryState: wrappers[1]?.getAttribute("data-transition-state"),
          categoryTitle:
            document
              .querySelector("#kpi-category-title")
              ?.textContent?.trim() ?? "",
          cssAnimationCount: wrappers.reduce(
            (count, wrapper) =>
              count +
              (wrapper
                ?.getAnimations({ subtree: true })
                .filter((animation) => animation instanceof CSSAnimation)
                .length ?? 0),
            0,
          ),
          documentAnimationCount: document.getAnimations().length,
          hasOutgoingLayer:
            document.querySelector(".mo4-layer-outgoing") != null,
          modeResult:
            document
              .querySelector("[data-kpi='finalProfit'] strong")
              ?.textContent?.trim() ?? "",
          modeSelected: actualButton.getAttribute("aria-pressed") === "true",
          modeState: wrappers[0]?.getAttribute("data-transition-state"),
          transitionCount: wrappers.reduce(
            (count, wrapper) =>
              count +
              (wrapper
                ?.getAnimations({ subtree: true })
                .filter((animation) => animation instanceof CSSTransition)
                .length ?? 0),
            0,
          ),
        };
      });
      return {
        before,
        layoutA,
        layoutB,
        screenshotAHash: createHash("sha256")
          .update(await readFile(paths.reduceA))
          .digest("hex"),
        screenshotBHash: createHash("sha256")
          .update(await readFile(paths.reduceB))
          .digest("hex"),
        switchResult,
      };
    } finally {
      await context.close();
    }
  }

  try {
    const forcedFull = {
      frames: await controlledFrames(),
      rapidCategory: await rapidRetarget("category"),
      rapidMode: await rapidRetarget("mode"),
    };
    const nativeDegraded = await nativeDegradedEvidence();
    const reduced = await reducedEvidence();
    const frameLayers = (frame) => [
      frame.modeOutgoing,
      frame.modeIncoming,
      frame.categoryOutgoing,
      frame.categoryIncoming,
    ];
    const rapidChecks = (evidence, finalContentMatches) => ({
      cadenceForcedFull: evidence.cadence === "full",
      cssAnimationsAndKeyframesZero:
        evidence.cssAnimationCountBefore === 0 &&
        evidence.cssAnimationCountAfter === 0,
      finalContent: finalContentMatches(evidence.finalContent),
      finalSelected: evidence.finalSelected,
      finalStateIdle: evidence.finalState === "idle" && evidence.settled,
      noOutgoingAfterSettle: evidence.noOutgoingAfterSettle,
      presentationContinuity:
        Math.abs(
          evidence.after.outgoing.opacity - evidence.before.incoming.opacity,
        ) <= 0.02 &&
        Math.abs(
          evidence.after.outgoing.translateY -
            evidence.before.incoming.translateY,
        ) <= 0.25 &&
        Math.abs(
          evidence.after.incoming.opacity - evidence.before.outgoing.opacity,
        ) <= 0.02 &&
        Math.abs(
          evidence.after.incoming.translateY -
            evidence.before.outgoing.translateY,
        ) <= 0.25,
      compositeOpacityContinuity:
        Math.abs(
          evidence.after.incoming.opacity +
            evidence.after.outgoing.opacity -
            (evidence.before.incoming.opacity +
              evidence.before.outgoing.opacity),
        ) <= 0.02,
      presentationWasMidTransition:
        evidence.before.incoming.opacity > 0.02 &&
        evidence.before.incoming.opacity < 0.98 &&
        evidence.before.outgoing.opacity > 0.02 &&
        evidence.before.outgoing.opacity < 0.98,
      sameReactKeysReuseDom:
        evidence.firstIncomingBecameOutgoing &&
        evidence.firstOutgoingBecameIncoming,
      sonarCleanup: evidence.finalSonarPaused === "false",
      transitionPropertiesOnly:
        evidence.transitionPropertiesAfter.length > 0 &&
        evidence.transitionPropertiesAfter.every((property) =>
          ["opacity", "transform"].includes(property),
        ),
    });
    const checks = {
      forcedFullOverrideInstalled:
        forcedFull.frames.cadenceOverride.installed &&
        forcedFull.frames.cadenceOverride.syntheticFrameCount >= 13,
      forcedFullActualFinalSource:
        forcedFull.frames.captureMode ===
        "actual-final-source-forced-full-cadence-css-transitions",
      forcedFullNoCssAnimationsOrKeyframes:
        forcedFull.frames.setup.cssAnimationCount === 0,
      forcedFullTransitionDuration150Ms:
        forcedFull.frames.setup.transitionCount >= 4 &&
        forcedFull.frames.setup.transitionDurationsMs.length === 1 &&
        forcedFull.frames.setup.transitionDurationsMs[0] === 150,
      frame0InitialState: frameLayers(forcedFull.frames.at0).every(
        (layer, index) =>
          layer != null &&
          (index % 2 === 0 ? layer.opacity >= 0.99 : layer.opacity <= 0.01),
      ),
      frame75NoBlankTrough:
        forcedFull.frames.at75.modeOutgoing.opacity +
          forcedFull.frames.at75.modeIncoming.opacity >=
          0.95 &&
        forcedFull.frames.at75.categoryOutgoing.opacity +
          forcedFull.frames.at75.categoryIncoming.opacity >=
          0.95,
      frame150FinalState: frameLayers(forcedFull.frames.at150).every(
        (layer, index) =>
          layer != null &&
          (index % 2 === 0 ? layer.opacity <= 0.02 : layer.opacity >= 0.98),
      ),
      ...Object.fromEntries(
        Object.entries(
          rapidChecks(forcedFull.rapidMode, (text) => text.includes("33,791")),
        ).map(([key, value]) => [`rapidMode_${key}`, value]),
      ),
      ...Object.fromEntries(
        Object.entries(
          rapidChecks(forcedFull.rapidCategory, (text) =>
            text.startsWith("概覽"),
          ),
        ).map(([key, value]) => [`rapidCategory_${key}`, value]),
      ),
      nativeCadenceMeasuredDegraded:
        Math.round(nativeDegraded.rafBaseline.medianMs) >= 25 &&
        nativeDegraded.cadence === "degraded",
      nativeDegradedImmediate:
        nativeDegraded.elapsedMs <= 100 &&
        nativeDegraded.transitionCount === 0 &&
        nativeDegraded.cssAnimationCount === 0 &&
        nativeDegraded.outgoingLayerCount === 0,
      nativeDegradedSettled:
        nativeDegraded.finalSelected &&
        nativeDegraded.finalState === "idle" &&
        nativeDegraded.finalSonarPaused === "false" &&
        nativeDegraded.finalContent.includes("27,607"),
      reducedAllAmbientMoHidden:
        reduced.before.matchMediaReduce &&
        reduced.before.moAnimationCount === 0 &&
        reduced.before.elements.every(
          (element) =>
            element.display === "none" && element.animationName === "none",
        ),
      reducedImmediateAndNoMo4:
        reduced.switchResult.modeSelected &&
        reduced.switchResult.categorySelected &&
        reduced.switchResult.modeState === "idle" &&
        reduced.switchResult.categoryState === "idle" &&
        !reduced.switchResult.hasOutgoingLayer &&
        reduced.switchResult.transitionCount === 0 &&
        reduced.switchResult.cssAnimationCount === 0 &&
        reduced.switchResult.modeResult.includes("27,607") &&
        reduced.switchResult.categoryTitle.startsWith("損益"),
      reducedScreenshotsIdentical:
        reduced.screenshotAHash === reduced.screenshotBHash,
      reducedLayoutStable:
        JSON.stringify(reduced.layoutA) === JSON.stringify(reduced.layoutB),
      reducedVisibleLayoutNormal:
        reduced.layoutA.fontsStatus === "loaded" &&
        reduced.layoutA.documentAnimationCount === 0 &&
        reduced.layoutA.outgoingLayerCount === 0 &&
        reduced.layoutA.headingRendered &&
        reduced.layoutA.categoryTitleRendered &&
        reduced.layoutA.categoryTitle?.startsWith("概覽") &&
        reduced.layoutA.kpiValueCount === 4 &&
        reduced.layoutA.kpiValuesRendered &&
        reduced.layoutA.kpiValueTexts.every((text) => text.length > 0) &&
        reduced.layoutA.overlappingKpiPairs.length === 0 &&
        reduced.layoutA.renderedLeafTextCount >= 25,
      noConsoleErrors: consoleErrors.length === 0,
      noPageErrors: pageErrors.length === 0,
    };
    const metrics = {
      browserVersion: browser.version(),
      checks,
      consoleErrors,
      forcedFull,
      generatedAt: new Date().toISOString(),
      nativeDegraded,
      pageErrors,
      passed: Object.values(checks).every(Boolean),
      paths,
      reduced,
    };
    await writeFile(paths.metrics, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(JSON.stringify(metrics, null, 2));
    assert.equal(
      metrics.passed,
      true,
      "Final-source MO-4 full/degraded/reduced gate failed",
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
