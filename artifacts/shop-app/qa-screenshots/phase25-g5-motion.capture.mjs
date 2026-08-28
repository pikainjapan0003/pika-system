import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { installClerkStub } from "../../../e2e/clerkStub.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function option(name) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1];
  const prefix = `${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (args.includes("--help")) {
  console.log(`Usage: node ${fileURLToPath(import.meta.url)} [options]

Options:
  --base-url <url>       App origin (default: E2E_BASE_URL or http://127.0.0.1:4173)
  --output-dir <path>    Artifact directory (default: ./phase25-g5-motion)
  --executable <path>    Chromium executable override
  --headed               Show the browser while capturing
  --run-id <id>          Filename-safe run identifier`);
  process.exit(0);
}

const baseURL = new URL(
  option("--base-url") ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
);
const outputDir = resolve(
  option("--output-dir") ?? join(scriptDir, "phase25-g5-motion"),
);
const runId = (
  option("--run-id") ??
  `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`
).replaceAll(/[^a-zA-Z0-9_-]/g, "-");
const prefix = `phase25-g5-${runId}`;
const PAGE_READY_TIMEOUT_MS = 120_000;
const targetURL = new URL("/reports/monthly-profit?view=kpi", baseURL).href;
const monthlyTargetURL = new URL("/reports/monthly-profit", baseURL).href;
const dashboardTargetURL = new URL("/dashboard", baseURL).href;
const executablePath =
  option("--executable") ??
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  process.env.CHROMIUM_EXECUTABLE_PATH;

await mkdir(outputDir, { recursive: true });

const paths = {
  mobile: join(outputDir, `${prefix}-mobile-390-full.png`),
  dashboard: join(outputDir, `${prefix}-dashboard-ambient.png`),
  reduceA: join(outputDir, `${prefix}-reduce-a.png`),
  reduceB: join(outputDir, `${prefix}-reduce-b.png`),
  metrics: join(outputDir, `${prefix}-metrics.json`),
  radar: Object.fromEntries(
    [0, 1750, 3500, 5250, 7000].map((time) => [
      time,
      join(outputDir, `${prefix}-radar-${String(time).padStart(4, "0")}ms.png`),
    ]),
  ),
};

const ESTIMATE_SUMMARY = summaryFixture("ESTIMATE", {
  quantity: 700,
  unitProfit: "130.000000000000",
  adjustedRevenue: "130000.000000000000",
  grossProfit: "91000.000000000000",
  margin: "0.420000000000",
  finalProfit: "33791.489400000000",
  outcome: "SALARY_TARGET_MET",
});

const ACTUAL_SUMMARY = summaryFixture("ACTUAL", {
  quantity: 684,
  unitProfit: "124.000000000000",
  adjustedRevenue: "124500.000000000000",
  grossProfit: "84816.000000000000",
  margin: "0.398000000000",
  finalProfit: "27607.489400000000",
  outcome: "PROFIT_BELOW_SALARY_TARGET",
});

function summaryFixture(mode, values) {
  return {
    status: "ready",
    mode,
    exchangeRate: "0.205",
    totalItemQuantity: values.quantity,
    unitGrossProfitTwd: values.unitProfit,
    entries: [],
    categories: [],
    sections: {
      fixed: {
        status: "ready",
        totalTwd: "39147.715000000000",
        paymentFeeTwd: "228.235725000000",
      },
      variable: {
        status: "ready",
        totalTwd: "17642.325000000000",
        paymentFeeTwd: "190.234875000000",
      },
      purchase: {
        status: "ready",
        totalTwd: "9876.000000000000",
        paymentFeeTwd: "0.000000000000",
      },
    },
    tripProfit: {
      status: "ready",
      projections: {
        unit: {
          status: "ready",
          outcome: values.outcome,
          grossProfitTwd: values.grossProfit,
          adjustedRevenueTwd: values.adjustedRevenue,
          grossMarginRate: values.margin,
          operatingProfitBeforeAdjustmentsTwd: values.finalProfit,
          finalOperatingProfitTwd: values.finalProfit,
          salaryTargetTwd: "30000.000000000000",
        },
        daily: {
          status: "ready",
          outcome: values.outcome,
          grossProfitTwd: values.grossProfit,
          adjustedRevenueTwd: values.adjustedRevenue,
          grossMarginRate: values.margin,
          operatingProfitBeforeAdjustmentsTwd: values.finalProfit,
          finalOperatingProfitTwd: values.finalProfit,
          salaryTargetTwd: "30000.000000000000",
        },
      },
      fixedCostTotalTwd: "39147.715000000000",
      variableCostTotalTwd: "17642.325000000000",
      purchaseCostPrincipalTwd: "9876.000000000000",
      paymentFeeTwd: "418.470600000000",
      operatingExpenseTwd: "57208.510600000000",
    },
    estimateLocked: mode === "ESTIMATE",
    estimateModifiedAfterLock: false,
  };
}

function apiResponse(url) {
  const path = url.pathname;
  if (path === "/api/me/store") {
    return {
      id: 1,
      merchantId: "user_e2e_merchant",
      name: "G5 動效驗證店鋪",
      slug: "g5-motion-store",
    };
  }
  if (path === "/api/stores/1/trips") {
    return [{ id: 1, name: "G5 聲吶驗證行程" }];
  }
  if (path === "/api/stores/1/stats") {
    return {
      totalOrders: 0,
      pendingOrders: 0,
      totalRevenue: 0,
      statusBreakdown: [],
    };
  }
  if (path === "/api/stores/1/orders") return [];
  if (path === "/api/stores/1/products") return [];
  if (path === "/api/stores/1/logistics/exceptions") {
    return { ok: true, items: [] };
  }
  if (path === "/api/stores/1/orders/profit-summary") {
    return {
      capturedProfitSubtotalDisplayTwd: "1559",
      pendingOrderCount: 2,
      missingSnapshotOrderCount: 3,
    };
  }
  if (path === "/api/stores/1/trips/1/operating-summary") {
    return url.searchParams.get("mode") === "ACTUAL"
      ? ACTUAL_SUMMARY
      : ESTIMATE_SUMMARY;
  }
  if (path === "/api/stores/1/trips/1/fixed-cost-comparison") {
    return {
      status: "ready",
      rows: [
        {
          key: "shipping",
          label: "國際運費",
          state: "ready",
          estimatedTwd: "18000.000000000000",
          actualTwd: "17500.000000000000",
          variance: {
            status: "ready",
            difference: "-500.000000000000",
            percent: "-0.027777777778",
            direction: "favorable",
          },
        },
      ],
    };
  }
  if (path === "/api/stores/1/orders/monthly-profit") {
    return {
      month: url.searchParams.get("month") ?? "2026-08",
      timeZone: "Asia/Taipei",
      orderCount: 5,
      capturedProfitSubtotalDisplayTwd: "1559",
      pendingOrderCount: 2,
      missingSnapshotOrderCount: 3,
    };
  }
  if (path === "/api/stores/1/charts/route-cost-ranking") {
    return { status: "ready", items: [] };
  }
  if (path === "/api/stores/1/charts/area-scatter") {
    return { status: "ready", items: [] };
  }
  if (path === "/api/stores/1/charts/history-trend") {
    return { status: "ready", mode: "ACTUAL", items: [] };
  }
  return undefined;
}

async function installMocks(page, label, requestLog, unhandledRequests) {
  await installClerkStub(page, {
    signedIn: true,
    userId: "user_e2e_merchant",
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestLog.push({ label, method: request.method(), url: url.href });
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.startsWith("/api/__clerk/")) {
      return route.fulfill({ status: 204, body: "" });
    }
    const json = apiResponse(url);
    if (json !== undefined) {
      return route.fulfill({
        status: 200,
        headers: { "cache-control": "no-store" },
        json,
      });
    }
    unhandledRequests.push({ label, method: request.method(), url: url.href });
    return route.fulfill({
      status: 500,
      json: { error: `G5 capture mock missing: ${url.pathname}` },
    });
  });
}

function attachDiagnostics(page, label, consoleErrors, pageErrors) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ label, text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push({ label, message: error.message, stack: error.stack });
  });
}

async function waitForBoard(page) {
  await page.goto(targetURL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await page.locator("[data-testid='sonar-whale']").waitFor({
    state: "visible",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await page
    .locator(".particle-whale-canvas, .particle-whale-fallback")
    .first()
    .waitFor({ state: "visible", timeout: PAGE_READY_TIMEOUT_MS });
  if (await page.getByText("雷達視覺暫時無法載入").count()) {
    throw new Error("Particle whale renderer failed to load");
  }
  await page.locator("[data-kpi='finalProfit'] strong").waitFor({
    state: "visible",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-testid='sonar-particle']").length === 6,
  );
  await page.evaluate(() => document.fonts.ready);
}

async function motionDefinitions(page) {
  return page.evaluate(() => {
    const compactKeyframes = (element) =>
      element
        ?.getAnimations()[0]
        ?.effect?.getKeyframes()
        .map((frame) => ({
          offset: frame.offset,
          computedOffset: frame.computedOffset,
          easing: frame.easing,
          opacity: frame.opacity,
          transform: frame.transform,
        })) ?? [];
    const sweep = document.querySelector("[data-testid='radar-sweep']");
    const breathe = document.querySelector("[data-testid='sonar-breathe']");
    if (!(sweep instanceof HTMLElement) || !(breathe instanceof HTMLElement)) {
      throw new Error("MO-1/MO-2 elements are missing");
    }
    const sweepStyle = getComputedStyle(sweep);
    const breatheStyle = getComputedStyle(breathe);
    const breatheKeyframes = compactKeyframes(breathe);
    const opacities = breatheKeyframes
      .map((frame) => (frame.opacity === undefined ? NaN : +frame.opacity))
      .filter((value) => !globalThis.isNaN(value));
    const minimumOpacity = Math.min(...opacities);
    const maximumOpacity = Math.max(...opacities);
    return {
      mo1: {
        dataDurationMs: +(sweep.dataset.durationMs ?? "0"),
        animationName: sweepStyle.animationName,
        animationDuration: sweepStyle.animationDuration,
        animationTimingFunction: sweepStyle.animationTimingFunction,
        animationIterationCount: sweepStyle.animationIterationCount,
        keyframes: compactKeyframes(sweep),
      },
      mo2: {
        animationName: breatheStyle.animationName,
        animationDuration: breatheStyle.animationDuration,
        keyframes: breatheKeyframes,
        minimumOpacity,
        maximumOpacity,
        opacityDelta:
          Math.round((maximumOpacity - minimumOpacity) * 1000) / 1000,
      },
    };
  });
}

async function mo3Metrics(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-testid='sonar-whale']");
    const layer = document.querySelector("[data-testid='sonar-particles']");
    const particles = [
      ...document.querySelectorAll("[data-testid='sonar-particle']"),
    ];
    if (!(host instanceof HTMLElement) || !(layer instanceof HTMLElement)) {
      throw new Error("MO-3 host/layer is missing");
    }

    const hostRect = host.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const epsilon = 0.75;
    const contains = (outer, inner) =>
      inner.left >= outer.left - epsilon &&
      inner.top >= outer.top - epsilon &&
      inner.right <= outer.right + epsilon &&
      inner.bottom <= outer.bottom + epsilon;
    const intersects = (first, second) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;

    const visibleTextRects = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (
            !parent ||
            parent.closest("[aria-hidden='true']") ||
            parent.closest("script, style, noscript")
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          const style = getComputedStyle(parent);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            +style.opacity === 0
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) {
          visibleTextRects.push({
            text: node.textContent.trim().slice(0, 80),
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          });
        }
      }
      range.detach();
    }

    const particleRects = particles.map((particle, index) => {
      const rect = particle.getBoundingClientRect();
      const overlaps = visibleTextRects
        .filter((textRect) => intersects(rect, textRect))
        .map(({ text }) => text);
      return {
        index,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
        withinHost: contains(hostRect, rect),
        withinParticleLayer: contains(layerRect, rect),
        visibleTextOverlaps: overlaps,
      };
    });
    const overlapCount = particleRects.reduce(
      (count, particle) => count + particle.visibleTextOverlaps.length,
      0,
    );

    return {
      count: particles.length,
      limit: 8,
      hostContainment: {
        allWithinHost: particleRects.every((particle) => particle.withinHost),
        allWithinParticleLayer: particleRects.every(
          (particle) => particle.withinParticleLayer,
        ),
      },
      visibleTextOverlap: {
        count: overlapCount,
        overlaps: particleRects
          .filter((particle) => particle.visibleTextOverlaps.length > 0)
          .map((particle) => ({
            particle: particle.index,
            text: particle.visibleTextOverlaps,
          })),
      },
      particles: particleRects,
    };
  });
}

async function measureSwitch(page, kind) {
  return page.evaluate(async (switchKind) => {
    let button;
    let target;
    if (switchKind === "mode") {
      const group = document.querySelector(
        "[role='group'][aria-label='KPI 資料模式']",
      );
      button = [...(group?.querySelectorAll("button") ?? [])].find(
        (candidate) => candidate.textContent?.trim() === "實際",
      );
      target = document.querySelector("[data-testid='mode-transition']");
    } else {
      button = document.querySelector("[data-testid='tab-profit']");
      target = document.querySelector("[data-testid='category-transition']");
    }
    if (
      !(button instanceof HTMLButtonElement) ||
      !(target instanceof HTMLElement)
    ) {
      throw new Error(`MO-4 ${switchKind} measurement target is missing`);
    }

    const transitionStyle = getComputedStyle(target);
    const phaseDurationMs = transitionStyle.transitionDuration
      .split(",")
      .map((duration) => duration.trim())
      .map((duration) =>
        duration.endsWith("ms")
          ? +duration.slice(0, -2)
          : +duration.slice(0, -1) * 1000,
      )[0];
    const declaredPhaseDurationMs = +(
      target.dataset.transitionPhaseDurationMs ?? "0"
    );
    const declaredTotalDurationMs = +(
      target.dataset.transitionTotalDurationMs ?? "0"
    );
    const sonar = document.querySelector("[data-testid='sonar-whale']");
    const sonarPaused = () =>
      sonar instanceof HTMLElement
        ? sonar.dataset.sonarInteractionPaused === "true"
        : null;
    const samples = [];
    const classChanges = [
      {
        elapsedMs: 0,
        className: target.className,
        phase: target.dataset.transitionPhase ?? null,
        opacity: +getComputedStyle(target).opacity,
        sonarPaused: sonarPaused(),
      },
    ];
    let sawFade = false;
    let restored = false;
    let restoredAtMs = null;
    const start = performance.now();
    const transitionEvents = [];
    const onTransitionEvent = (event) => {
      if (event.target !== target) return;
      transitionEvents.push({
        elapsedMs: Math.round((performance.now() - start) * 10) / 10,
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
    const observer = new MutationObserver(() => {
      const elapsedMs = Math.round((performance.now() - start) * 10) / 10;
      const opacity = +getComputedStyle(target).opacity;
      const phase = target.dataset.transitionPhase ?? null;
      classChanges.push({
        elapsedMs,
        className: target.className,
        phase,
        opacity: Math.round(opacity * 1000) / 1000,
        sonarPaused: sonarPaused(),
      });
      sawFade ||= opacity < 0.99 || phase === "out";
      if (sawFade && phase === "idle" && opacity >= 0.99) {
        restored = true;
        restoredAtMs = elapsedMs;
      }
    });
    observer.observe(target, {
      attributes: true,
      attributeFilter: ["class", "data-transition-phase"],
    });
    if (switchKind === "category") {
      button.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: false,
        }),
      );
    } else {
      button.click();
    }
    while (!restored && performance.now() - start < 2000) {
      await new Promise(requestAnimationFrame);
      const elapsedMs = performance.now() - start;
      const opacity = +getComputedStyle(target).opacity;
      samples.push({
        elapsedMs: Math.round(elapsedMs * 10) / 10,
        opacity: Math.round(opacity * 1000) / 1000,
        className: target.className,
        phase: target.dataset.transitionPhase ?? null,
      });
      sawFade ||=
        opacity < 0.99 || classChanges.some(({ phase }) => phase === "out");
      const selectedState =
        switchKind === "mode"
          ? document
              .querySelector(
                "[role='group'][aria-label='KPI 資料模式'] button[aria-pressed='true']",
              )
              ?.textContent?.trim()
          : document
              .querySelector("[data-testid='tab-profit']")
              ?.getAttribute("data-state");
      const selected =
        switchKind === "mode"
          ? selectedState === "實際"
          : selectedState === "active";
      if (
        sawFade &&
        selected &&
        opacity >= 0.99 &&
        target.dataset.transitionPhase === "idle"
      ) {
        restored = true;
        restoredAtMs ??= Math.round(elapsedMs * 10) / 10;
        break;
      }
    }
    observer.disconnect();
    for (const eventName of [
      "transitionrun",
      "transitionstart",
      "transitionend",
    ]) {
      target.removeEventListener(eventName, onTransitionEvent);
    }
    const selectedState =
      switchKind === "mode"
        ? document
            .querySelector(
              "[role='group'][aria-label='KPI 資料模式'] button[aria-pressed='true']",
            )
            ?.textContent?.trim()
        : document
            .querySelector("[data-testid='tab-profit']")
            ?.getAttribute("data-state");
    const observedOpacities = [...samples, ...classChanges]
      .map(({ opacity }) => opacity)
      .filter(Number.isFinite);
    const phaseSequence = classChanges
      .map(({ phase }) => phase)
      .filter((phase, index, phases) => phase !== phases[index - 1]);
    const frameIntervals = samples
      .slice(1)
      .map((sample, index) => sample.elapsedMs - samples[index].elapsedMs)
      .sort((left, right) => left - right);
    const rafMedianMs =
      frameIntervals.length === 0
        ? null
        : frameIntervals[Math.floor(frameIntervals.length / 2)];
    const compositorActiveDurationMs = transitionEvents
      .filter(
        (event) =>
          event.type === "transitionend" && event.propertyName === "opacity",
      )
      .reduce((total, event) => total + event.elapsedTimeMs, 0);
    return {
      kind: switchKind,
      sawFade,
      restored,
      clickToRestoredOpacityMs: restoredAtMs,
      nominalTotalMs: declaredTotalDurationMs,
      declaredPhaseDurationMs,
      declaredTotalDurationMs,
      compositorActiveDurationMs:
        Math.round(compositorActiveDurationMs * 10) / 10,
      minimumOpacity:
        observedOpacities.length > 0 ? Math.min(...observedOpacities) : null,
      cssTransitionDuration: transitionStyle.transitionDuration,
      cssTransitionProperty: transitionStyle.transitionProperty,
      sampleCount: samples.length,
      samples,
      classChanges,
      phaseSequence,
      rafMedianMs:
        rafMedianMs == null ? null : Math.round(rafMedianMs * 10) / 10,
      selectedState,
      timingEnvironmentValid:
        samples.length >= 8 && rafMedianMs !== null && rafMedianMs <= 25,
      transitionEvents,
    };
  }, kind);
}

async function rapidRetargetMetrics(page) {
  return page.evaluate(async () => {
    const waitFor = async (predicate, timeoutMs = 1500) => {
      const startedAt = performance.now();
      while (!predicate() && performance.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return predicate();
    };
    const delay = (durationMs) =>
      new Promise((resolve) => setTimeout(resolve, durationMs));
    const modeButtons = [
      ...document.querySelectorAll(
        "[role='group'][aria-label='KPI 資料模式'] button",
      ),
    ];
    const differenceButton = modeButtons.find(
      (button) => button.textContent?.trim() === "差異",
    );
    const estimateButton = modeButtons.find(
      (button) => button.textContent?.trim() === "預估",
    );
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
      throw new Error("MO-4 rapid-retarget controls are missing");
    }
    const pressTab = (button) =>
      button.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: false,
        }),
      );

    differenceButton.click();
    await delay(40);
    estimateButton.click();
    const modeSettled = await waitFor(
      () =>
        estimateButton.getAttribute("aria-pressed") === "true" &&
        document.querySelector("[data-testid='mode-transition']")?.dataset
          .transitionPhase === "idle" &&
        (
          document.querySelector("[data-kpi='finalProfit'] strong")
            ?.textContent ?? ""
        ).includes("33,791"),
    );

    pressTab(costButton);
    await delay(40);
    pressTab(overviewButton);
    const categorySettled = await waitFor(
      () =>
        overviewButton.getAttribute("data-state") === "active" &&
        document.querySelector("[data-testid='category-transition']")?.dataset
          .transitionPhase === "idle" &&
        (
          document.querySelector("#kpi-category-title")?.textContent ?? ""
        ).startsWith("概覽"),
    );

    return {
      modeSettled,
      categorySettled,
      finalMode: modeButtons
        .find((button) => button.getAttribute("aria-pressed") === "true")
        ?.textContent?.trim(),
      finalCategory: document
        .querySelector("[role='tab'][data-state='active']")
        ?.textContent?.trim(),
      sonarPaused:
        document.querySelector("[data-testid='sonar-whale']")?.dataset
          .sonarInteractionPaused ?? null,
    };
  });
}

async function reducedMetrics(page) {
  return page.evaluate(() => {
    const ids = ["radar-sweep", "sonar-breathe", "sonar-particles"];
    const elements = ids.map((id) => {
      const element = document.querySelector(`[data-testid='${id}']`);
      if (!(element instanceof HTMLElement)) {
        return { id, missing: true, display: null, animationName: null };
      }
      const style = getComputedStyle(element);
      return {
        id,
        missing: false,
        display: style.display,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        animationCount: element.getAnimations({ subtree: true }).length,
      };
    });
    const resultText =
      document
        .querySelector("[data-kpi='finalProfit'] strong")
        ?.textContent?.trim() ?? "";
    return {
      matchMediaReduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
      elements,
      moAnimationCount: elements.reduce(
        (count, element) => count + (element.animationCount ?? 0),
        0,
      ),
      documentAnimationCount: document.getAnimations().length,
      resultText,
      resultTextStillExists:
        resultText.length > 0 &&
        resultText !== "待確認" &&
        /NT\$/.test(resultText),
      resultStatusStillExists:
        document.body.textContent?.includes("已達標") ?? false,
    };
  });
}

async function reducedSwitchMetrics(page) {
  return page.evaluate(async () => {
    const waitFor = async (predicate, startedAt) => {
      while (!predicate() && performance.now() - startedAt < 500) {
        await new Promise(requestAnimationFrame);
      }
      return Math.round((performance.now() - startedAt) * 10) / 10;
    };
    const modeButton = [
      ...document.querySelectorAll("[aria-label='KPI 資料模式'] button"),
    ].find((button) => button.textContent?.trim() === "實際");
    const categoryButton = document.querySelector("[data-testid='tab-profit']");
    if (
      !(modeButton instanceof HTMLButtonElement) ||
      !(categoryButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Reduced-motion MO-4 controls are missing");
    }

    const modeStartedAt = performance.now();
    modeButton.click();
    const modeUpdatedBeforeEventReturned =
      modeButton.getAttribute("aria-pressed") === "true" &&
      (
        document.querySelector("[data-kpi='finalProfit'] strong")
          ?.textContent ?? ""
      ).includes("27,607");
    const modeUpdateMs = await waitFor(
      () =>
        modeButton.getAttribute("aria-pressed") === "true" &&
        (
          document.querySelector("[data-kpi='finalProfit'] strong")
            ?.textContent ?? ""
        ).includes("27,607"),
      modeStartedAt,
    );
    const modeResultText =
      document
        .querySelector("[data-kpi='finalProfit'] strong")
        ?.textContent?.trim() ?? "";

    const categoryStartedAt = performance.now();
    categoryButton.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: false,
      }),
    );
    const categoryUpdatedBeforeEventReturned =
      document
        .querySelector("[data-testid='tab-profit']")
        ?.getAttribute("data-state") === "active" &&
      (
        document.querySelector("#kpi-category-title")?.textContent ?? ""
      ).startsWith("損益");
    const categoryUpdateMs = await waitFor(
      () =>
        document
          .querySelector("[data-testid='tab-profit']")
          ?.getAttribute("data-state") === "active" &&
        (
          document.querySelector("#kpi-category-title")?.textContent ?? ""
        ).startsWith("損益"),
      categoryStartedAt,
    );
    const categoryTitle =
      document.querySelector("#kpi-category-title")?.textContent?.trim() ?? "";

    return {
      mode: {
        updateMs: modeUpdateMs,
        selected: modeButton.getAttribute("aria-pressed") === "true",
        resultText: modeResultText,
        updatedBeforeEventReturned: modeUpdatedBeforeEventReturned,
        transitionPhase:
          document.querySelector("[data-testid='mode-transition']")?.dataset
            ?.transitionPhase ?? null,
      },
      category: {
        updateMs: categoryUpdateMs,
        selected:
          document
            .querySelector("[data-testid='tab-profit']")
            ?.getAttribute("data-state") === "active",
        title: categoryTitle,
        updatedBeforeEventReturned: categoryUpdatedBeforeEventReturned,
        transitionPhase:
          document.querySelector("[data-testid='category-transition']")?.dataset
            ?.transitionPhase ?? null,
      },
      documentAnimationCountAfterSwitches: document.getAnimations().length,
    };
  });
}

async function dashboardAmbientMetrics(page) {
  return page.evaluate(() => {
    const ambient = document.querySelector("[data-testid='sonar-ambient']");
    const band = ambient?.parentElement;
    const particles = [
      ...document.querySelectorAll(
        "[data-testid='sonar-ambient'] [data-testid='sonar-particle']",
      ),
    ];
    if (!(ambient instanceof HTMLElement) || !(band instanceof HTMLElement)) {
      throw new Error("Dashboard ambient sonar is missing");
    }
    const ambientStyle = getComputedStyle(ambient);
    const bandStyle = getComputedStyle(band);
    const bandRect = band.getBoundingClientRect();
    return {
      profile: ambient.dataset.sonarMotionProfile,
      variant: ambient.dataset.sonarVariant,
      bandHeight: Math.round(bandRect.height * 10) / 10,
      bandOverflowX: bandStyle.overflowX,
      bandOverflowY: bandStyle.overflowY,
      ambientPosition: ambientStyle.position,
      particleCount: particles.length,
      bandText: band.textContent?.trim() ?? "",
      whaleRendererCount: document.querySelectorAll(
        ".particle-whale-canvas, .particle-whale-fallback",
      ).length,
    };
  });
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function waitUntil(startedAt, targetElapsedMs, page) {
  const remaining = targetElapsedMs - (performance.now() - startedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

const requestLog = [];
const unhandledRequests = [];
const consoleErrors = [];
const pageErrors = [];
let browser;
const timingBrowser = await chromium.launch({
  headless: !args.includes("--headed"),
  args: [
    "--disable-webgl",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
  ...(executablePath ? { executablePath } : {}),
});

let desktopContext;
let evidenceContext;
let mobileContext;
let reducedContext;
const metrics = {
  schemaVersion: 1,
  runId,
  startedAt: new Date().toISOString(),
  baseURL: baseURL.href,
  targetURL,
  monthlyTargetURL,
  dashboardTargetURL,
  outputDir,
  browserVersion: timingBrowser.version(),
  artifacts: paths,
};

try {
  desktopContext = await timingBrowser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    reducedMotion: "no-preference",
  });
  const desktopPage = await desktopContext.newPage();
  attachDiagnostics(desktopPage, "desktop", consoleErrors, pageErrors);
  await installMocks(desktopPage, "desktop", requestLog, unhandledRequests);
  await waitForBoard(desktopPage);

  const definitions = await motionDefinitions(desktopPage);
  const particleMetrics = await mo3Metrics(desktopPage);
  const transformSamples = [];
  const sweep = desktopPage.locator("[data-testid='radar-sweep']");
  const captureStartedAt = performance.now();

  for (const scheduledMs of [0, 1750, 3500, 5250, 7000]) {
    await waitUntil(captureStartedAt, scheduledMs, desktopPage);
    const sample = await sweep.evaluate((element) => {
      const style = getComputedStyle(element);
      const animation = element.getAnimations()[0];
      return {
        transform: style.transform,
        opacity: style.opacity,
        animationCurrentTimeMs:
          typeof animation?.currentTime === "number"
            ? animation.currentTime
            : null,
        animationPlayState: animation?.playState ?? null,
      };
    });
    const actualMs =
      Math.round((performance.now() - captureStartedAt) * 10) / 10;
    transformSamples.push({ scheduledMs, actualMs, ...sample });
  }

  await waitUntil(captureStartedAt, 8500, desktopPage);
  const liveCaptureWindowMs =
    Math.round((performance.now() - captureStartedAt) * 10) / 10;
  await desktopContext.close();
  desktopContext = undefined;
  await timingBrowser.close();

  browser = await chromium.launch({
    headless: !args.includes("--headed"),
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
    ...(executablePath ? { executablePath } : {}),
  });

  evidenceContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    reducedMotion: "no-preference",
  });
  const evidencePage = await evidenceContext.newPage();
  attachDiagnostics(
    evidencePage,
    "desktop-evidence",
    consoleErrors,
    pageErrors,
  );
  await installMocks(
    evidencePage,
    "desktop-evidence",
    requestLog,
    unhandledRequests,
  );
  await waitForBoard(evidencePage);
  const normalWebglRenderer = await evidencePage.evaluate(() => ({
    canvasCount: document.querySelectorAll(".particle-whale-canvas").length,
    fallbackCount: document.querySelectorAll(".particle-whale-fallback").length,
  }));
  await evidencePage.waitForTimeout(250);
  await evidencePage.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const normalWebglModeSwitch = await measureSwitch(evidencePage, "mode");
  const normalWebglCategorySwitch = await measureSwitch(
    evidencePage,
    "category",
  );
  const normalWebglRapidRetarget = await rapidRetargetMetrics(evidencePage);
  const evidenceSweep = evidencePage.locator("[data-testid='radar-sweep']");
  const radarClip = await evidencePage
    .locator("[data-testid='sonar-whale']")
    .boundingBox();
  if (!radarClip) throw new Error("Radar capture clip is unavailable");

  for (const phaseMs of [0, 1750, 3500, 5250, 7000]) {
    await evidenceSweep.evaluate((element, currentTime) => {
      const host = element.closest("[data-testid='sonar-whale']");
      host
        ?.getAnimations({ subtree: true })
        .forEach((animation) => animation.pause());
      const sweepAnimation = element.getAnimations()[0];
      if (!sweepAnimation) throw new Error("Radar sweep animation is missing");
      sweepAnimation.currentTime = currentTime;
    }, phaseMs);
    await evidencePage.evaluate(
      () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)),
    );
    await evidencePage.screenshot({
      path: paths.radar[phaseMs],
      clip: radarClip,
      animations: "allow",
      caret: "hide",
    });
  }

  await evidencePage.goto(monthlyTargetURL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await evidencePage.locator("[data-testid='sonar-breathe-only']").waitFor({
    state: "visible",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  const monthlyMotionProfile = await evidencePage.evaluate(() => {
    const sonar = document.querySelector("[data-testid='sonar-breathe-only']");
    return {
      profile:
        sonar instanceof HTMLElement ? sonar.dataset.sonarMotionProfile : null,
      hasBreathe: Boolean(
        document.querySelector("[data-testid='sonar-breathe']"),
      ),
      hasSweep: Boolean(document.querySelector("[data-testid='radar-sweep']")),
      particleCount: document.querySelectorAll("[data-testid='sonar-particle']")
        .length,
    };
  });
  await evidencePage.goto(dashboardTargetURL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await evidencePage.locator("[data-testid='sonar-ambient']").waitFor({
    state: "visible",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await evidencePage.waitForTimeout(250);
  const dashboardAmbient = await dashboardAmbientMetrics(evidencePage);
  await evidencePage.screenshot({
    path: paths.dashboard,
    fullPage: false,
    animations: "allow",
    caret: "hide",
  });
  await evidenceContext.close();
  evidenceContext = undefined;

  metrics.normalMotion = {
    matchMediaReduce: false,
    mo1: { ...definitions.mo1, transformSamples },
    mo2: definitions.mo2,
    mo3: particleMetrics,
    mo4: {
      normalWebgl: {
        renderer: normalWebglRenderer,
        modeSwitch: normalWebglModeSwitch,
        categorySwitch: normalWebglCategorySwitch,
        rapidRetarget: normalWebglRapidRetarget,
      },
    },
    monthlyMotionProfile,
    dashboardAmbient,
  };
  metrics.liveMotionWindow = {
    captureWindowMs: liveCaptureWindowMs,
    guaranteedMinimumMs: 8500,
    rendererIsolation:
      "The timing browser isolates MO-1 transform samples and closes before the normal browser starts. MO-4 is gated with a real WebGL canvas, where the product pauses decorative sonar work during the 240ms content switch.",
  };

  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    reducedMotion: "no-preference",
  });
  const mobilePage = await mobileContext.newPage();
  attachDiagnostics(mobilePage, "mobile-390", consoleErrors, pageErrors);
  await installMocks(mobilePage, "mobile-390", requestLog, unhandledRequests);
  await waitForBoard(mobilePage);
  await mobilePage.waitForTimeout(250);
  await mobilePage.screenshot({
    path: paths.mobile,
    fullPage: true,
    animations: "allow",
    caret: "hide",
  });
  metrics.mobile = {
    viewport: { width: 390, height: 844 },
    fullPage: true,
    documentSize: await mobilePage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  };
  await mobileContext.close();
  mobileContext = undefined;

  reducedContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    reducedMotion: "reduce",
  });
  const reducedPage = await reducedContext.newPage();
  attachDiagnostics(reducedPage, "reduced", consoleErrors, pageErrors);
  await installMocks(reducedPage, "reduced", requestLog, unhandledRequests);
  await waitForBoard(reducedPage);
  await reducedPage.waitForTimeout(800);
  await reducedPage.screenshot({
    path: paths.reduceA,
    fullPage: true,
    animations: "allow",
    caret: "hide",
  });
  const reduceAHash = await sha256(paths.reduceA);
  await reducedPage.waitForTimeout(1000);
  await reducedPage.screenshot({
    path: paths.reduceB,
    fullPage: true,
    animations: "allow",
    caret: "hide",
  });
  const reduceBHash = await sha256(paths.reduceB);
  const reducedBaseline = await reducedMetrics(reducedPage);
  const reducedSwitches = await reducedSwitchMetrics(reducedPage);
  metrics.reducedMotion = {
    ...reducedBaseline,
    switches: reducedSwitches,
    screenshots: {
      separationMs: 1000,
      aSha256: reduceAHash,
      bSha256: reduceBHash,
      sha256Equal: reduceAHash === reduceBHash,
    },
  };
  await reducedContext.close();
  reducedContext = undefined;

  metrics.requests = {
    count: requestLog.length,
    allMocked: unhandledRequests.length === 0,
    log: requestLog,
    unhandled: unhandledRequests,
  };
  metrics.diagnostics = { consoleErrors, pageErrors };
  const sweepTimes = transformSamples.map(
    ({ animationCurrentTimeMs }) => animationCurrentTimeMs,
  );
  const sweepTimesAdvance = sweepTimes.every(
    (time, index) =>
      Number.isFinite(time) && (index === 0 || time > sweepTimes[index - 1]),
  );
  const distinctSweepTransforms = new Set(
    transformSamples.map(({ transform }) => transform),
  ).size;
  const sweepScheduleWithinTolerance = transformSamples.every(
    ({ scheduledMs, actualMs }) => Math.abs(actualMs - scheduledMs) <= 500,
  );
  metrics.checks = {
    mo1DurationWithinSixToTenSeconds:
      definitions.mo1.dataDurationMs >= 6000 &&
      definitions.mo1.dataDurationMs <= 10_000 &&
      definitions.mo1.animationDuration === "7s",
    mo1IsLinearInfiniteAndActivelyRotating:
      definitions.mo1.animationTimingFunction === "linear" &&
      definitions.mo1.animationIterationCount === "infinite" &&
      definitions.mo1.keyframes.length >= 2 &&
      transformSamples.length === 5 &&
      transformSamples.every(
        ({ animationPlayState }) => animationPlayState === "running",
      ) &&
      sweepTimesAdvance &&
      distinctSweepTransforms >= 4 &&
      sweepScheduleWithinTolerance,
    mo2OpacityDeltaWithinDesignLimit:
      definitions.mo2.keyframes.length >= 2 &&
      Number.isFinite(definitions.mo2.minimumOpacity) &&
      Number.isFinite(definitions.mo2.maximumOpacity) &&
      Number.isFinite(definitions.mo2.opacityDelta) &&
      definitions.mo2.opacityDelta >= 0 &&
      definitions.mo2.opacityDelta <= 0.15,
    mo3AtMostEightParticles: particleMetrics.count <= 8,
    mo3ContainedAndNoTextOverlap:
      particleMetrics.hostContainment.allWithinHost &&
      particleMetrics.hostContainment.allWithinParticleLayer &&
      particleMetrics.visibleTextOverlap.count === 0,
    mo4ModeWithinOneHundredFiftyToTwoHundredFiftyMilliseconds:
      normalWebglRenderer.canvasCount === 1 &&
      normalWebglRenderer.fallbackCount === 0 &&
      normalWebglModeSwitch.restored &&
      normalWebglModeSwitch.sawFade &&
      (normalWebglModeSwitch.timingEnvironmentValid
        ? normalWebglModeSwitch.clickToRestoredOpacityMs >= 150 &&
          normalWebglModeSwitch.clickToRestoredOpacityMs <= 250
        : normalWebglModeSwitch.compositorActiveDurationMs >= 150 &&
          normalWebglModeSwitch.compositorActiveDurationMs <= 250) &&
      normalWebglModeSwitch.minimumOpacity <= 0.15 &&
      normalWebglModeSwitch.phaseSequence.join(",") === "idle,out,in,idle" &&
      normalWebglModeSwitch.classChanges
        .filter(({ phase }) => ["out", "in"].includes(phase))
        .every(({ sonarPaused }) => sonarPaused === true) &&
      normalWebglModeSwitch.classChanges.at(-1)?.sonarPaused === false &&
      normalWebglModeSwitch.nominalTotalMs >= 150 &&
      normalWebglModeSwitch.nominalTotalMs <= 250 &&
      normalWebglModeSwitch.cssTransitionProperty.includes("opacity") &&
      normalWebglModeSwitch.cssTransitionProperty.includes("transform") &&
      normalWebglModeSwitch.selectedState === "實際",
    mo4CategoryWithinOneHundredFiftyToTwoHundredFiftyMilliseconds:
      normalWebglCategorySwitch.restored &&
      normalWebglCategorySwitch.sawFade &&
      (normalWebglCategorySwitch.timingEnvironmentValid
        ? normalWebglCategorySwitch.clickToRestoredOpacityMs >= 150 &&
          normalWebglCategorySwitch.clickToRestoredOpacityMs <= 250
        : normalWebglCategorySwitch.compositorActiveDurationMs >= 150 &&
          normalWebglCategorySwitch.compositorActiveDurationMs <= 250) &&
      normalWebglCategorySwitch.minimumOpacity <= 0.15 &&
      normalWebglCategorySwitch.phaseSequence.join(",") ===
        "idle,out,in,idle" &&
      normalWebglCategorySwitch.classChanges
        .filter(({ phase }) => ["out", "in"].includes(phase))
        .every(({ sonarPaused }) => sonarPaused === true) &&
      normalWebglCategorySwitch.classChanges.at(-1)?.sonarPaused === false &&
      normalWebglCategorySwitch.nominalTotalMs >= 150 &&
      normalWebglCategorySwitch.nominalTotalMs <= 250 &&
      normalWebglCategorySwitch.cssTransitionProperty.includes("opacity") &&
      normalWebglCategorySwitch.cssTransitionProperty.includes("transform") &&
      normalWebglCategorySwitch.selectedState === "active",
    mo4RapidRetargetSettlesOnLatestSelection:
      normalWebglRapidRetarget.modeSettled &&
      normalWebglRapidRetarget.categorySettled &&
      normalWebglRapidRetarget.finalMode === "預估" &&
      normalWebglRapidRetarget.finalCategory?.startsWith("概覽") &&
      normalWebglRapidRetarget.sonarPaused === "false",
    monthlyProfileIsBreatheOnly:
      monthlyMotionProfile.profile === "breathe-only" &&
      monthlyMotionProfile.hasBreathe &&
      !monthlyMotionProfile.hasSweep &&
      monthlyMotionProfile.particleCount === 0,
    dashboardAmbientIsClippedAndTextFree:
      dashboardAmbient.variant === "ambient" &&
      dashboardAmbient.profile === "full" &&
      dashboardAmbient.bandHeight <= 100 &&
      dashboardAmbient.bandOverflowX === "hidden" &&
      dashboardAmbient.bandOverflowY === "hidden" &&
      dashboardAmbient.ambientPosition === "absolute" &&
      dashboardAmbient.particleCount <= 8 &&
      dashboardAmbient.bandText === "" &&
      dashboardAmbient.whaleRendererCount === 0,
    reducedMediaMatched: metrics.reducedMotion.matchMediaReduce,
    reducedMoLayersHidden: metrics.reducedMotion.elements.every(
      (element) => !element.missing && element.display === "none",
    ),
    reducedMoAnimationCountZero: metrics.reducedMotion.moAnimationCount === 0,
    reducedPngsIdentical: metrics.reducedMotion.screenshots.sha256Equal,
    reducedResultTextAndStatusRemain:
      metrics.reducedMotion.resultTextStillExists &&
      metrics.reducedMotion.resultStatusStillExists,
    reducedMo4UpdatesImmediatelyWithoutAnimations:
      reducedSwitches.mode.selected &&
      reducedSwitches.mode.updatedBeforeEventReturned &&
      reducedSwitches.mode.transitionPhase === "idle" &&
      /NT\$/.test(reducedSwitches.mode.resultText) &&
      reducedSwitches.category.selected &&
      reducedSwitches.category.updatedBeforeEventReturned &&
      reducedSwitches.category.transitionPhase === "idle" &&
      reducedSwitches.category.title.startsWith("損益") &&
      reducedSwitches.documentAnimationCountAfterSwitches === 0,
    liveCaptureWindowAtLeastEightSeconds: liveCaptureWindowMs >= 8000,
    everyApiRequestMocked: unhandledRequests.length === 0,
    noPageErrors: pageErrors.length === 0,
  };
  metrics.passed = Object.values(metrics.checks).every(Boolean);
  metrics.finishedAt = new Date().toISOString();

  await writeFile(paths.metrics, `${JSON.stringify(metrics, null, 2)}\n`, {
    flag: "wx",
  });

  console.log(JSON.stringify(metrics, null, 2));
  if (!metrics.passed) {
    const failures = Object.entries(metrics.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(`G5 motion capture checks failed: ${failures.join(", ")}`);
  }
} finally {
  await desktopContext?.close().catch(() => undefined);
  await evidenceContext?.close().catch(() => undefined);
  await mobileContext?.close().catch(() => undefined);
  await reducedContext?.close().catch(() => undefined);
  await timingBrowser.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}
