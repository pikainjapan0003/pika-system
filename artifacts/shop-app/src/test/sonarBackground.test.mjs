import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;
const whaleControllers = [];

mock.module("../components/particle-whale/createParticleWhale.js", {
  namedExports: {
    createParticleWhale: () => {
      const controller = {
        isFallback: false,
        resize: mock.fn(),
        pause: mock.fn(),
        resume: mock.fn(),
        destroy: mock.fn(),
      };
      whaleControllers.push(controller);
      return controller;
    },
  },
});

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { SonarBackground } = await import("../components/SonarBackground.tsx");
const motionCss = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
);
const profitKpiBoardSource = readFileSync(
  new URL("../components/ProfitKpiBoard.tsx", import.meta.url),
  "utf8",
);

afterEach(() => {
  cleanup();
  whaleControllers.length = 0;
});

after(() => {
  mock.restoreAll();
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("MO-1 exposes the existing seven-second decorative radar sweep", () => {
  const view = render(React.createElement(SonarBackground));
  const sweep = view.getByTestId("radar-sweep");

  assert.equal(sweep.dataset.motion, "MO-1");
  assert.equal(sweep.dataset.durationMs, "7000");
  assert.ok(sweep.classList.contains("sonar-sweep"));
  assert.ok(sweep.classList.contains("animate-[spin_7s_linear_infinite]"));
  assert.equal(sweep.getAttribute("aria-hidden"), "true");
});

test("MO-2 keeps the breath layer decorative and within the opacity budget", () => {
  const view = render(React.createElement(SonarBackground));
  const breathe = view.getByTestId("sonar-breathe");
  const keyframesStart = motionCss.indexOf("@keyframes sonar-breathe");
  const keyframesEnd = motionCss.indexOf(".sonar-breathe", keyframesStart);
  const keyframes = motionCss.slice(keyframesStart, keyframesEnd);
  const opacities = [...keyframes.matchAll(/opacity:\s*(0(?:\.\d+)?)/g)].map(
    ([, opacity]) => opacity,
  );

  assert.equal(breathe.dataset.motion, "MO-2");
  assert.equal(breathe.getAttribute("aria-hidden"), "true");
  assert.ok(breathe.classList.contains("pointer-events-none"));
  assert.deepEqual(opacities, ["0.18", "0.3"]);
  assert.ok(0.3 - 0.18 <= 0.15, "breath opacity delta must stay at most 0.15");
});

test("MO-3 renders six clipped, text-free decorative particles", () => {
  const view = render(React.createElement(SonarBackground));
  const sonar = view.getByTestId("sonar-whale");
  const layer = view.getByTestId("sonar-particles");
  const particles = view.getAllByTestId("sonar-particle");

  assert.equal(layer.dataset.motion, "MO-3");
  assert.equal(layer.getAttribute("aria-hidden"), "true");
  assert.ok(layer.classList.contains("overflow-hidden"));
  assert.ok(layer.classList.contains("rounded-full"));
  assert.ok(sonar.classList.contains("overflow-hidden"));
  assert.equal(particles.length, 6);
  assert.ok(particles.length <= 8);
  assert.equal(layer.textContent, "");
  for (const particle of particles) {
    assert.equal(particle.getAttribute("aria-hidden"), "true");
    assert.ok(particle.classList.contains("absolute"));
    assert.equal(particle.textContent, "");
  }
});

test("the dashboard ambient variant reuses MO-1 through MO-3 without a whale", () => {
  const view = render(
    React.createElement(SonarBackground, { variant: "ambient" }),
  );
  const ambient = view.getByTestId("sonar-ambient");

  assert.equal(ambient.dataset.sonarVariant, "ambient");
  assert.ok(ambient.parentElement.classList.contains("h-20"));
  assert.ok(ambient.parentElement.classList.contains("overflow-hidden"));
  assert.ok(ambient.classList.contains("absolute"));
  assert.ok(ambient.classList.contains("-right-3"));
  assert.equal(view.queryByTestId("sonar-whale"), null);
  assert.equal(view.getByTestId("radar-sweep").dataset.motion, "MO-1");
  assert.equal(view.getByTestId("sonar-breathe").dataset.motion, "MO-2");
  assert.equal(view.getByTestId("sonar-particles").dataset.motion, "MO-3");
  assert.equal(view.getAllByTestId("sonar-particle").length, 6);
});

test("the monthly-profit profile keeps MO-2 without scan or particles", () => {
  const view = render(
    React.createElement(SonarBackground, { motionProfile: "breathe-only" }),
  );
  const sonar = view.getByTestId("sonar-breathe-only");

  assert.equal(sonar.dataset.sonarMotionProfile, "breathe-only");
  assert.equal(view.queryByTestId("sonar-whale"), null);
  assert.equal(view.getByTestId("sonar-breathe").dataset.motion, "MO-2");
  assert.equal(view.queryByTestId("radar-sweep"), null);
  assert.equal(view.queryByTestId("sonar-particles"), null);
  assert.equal(view.queryAllByTestId("sonar-particle").length, 0);
});

test("an MO-4 interaction pauses every sonar layer until the timeline finishes", async () => {
  const view = render(
    React.createElement(SonarBackground, { interactionPaused: true }),
  );
  const sonar = view.getByTestId("sonar-whale");

  await waitFor(() => assert.equal(whaleControllers.length, 1));
  assert.equal(sonar.dataset.sonarInteractionPaused, "true");
  assert.equal(whaleControllers[0].pause.mock.callCount(), 1);
  assert.match(
    motionCss,
    /\[data-sonar-interaction-paused="true"\] \.sonar-sweep,[\s\S]*?\.sonar-breathe,[\s\S]*?\.sonar-particle\s*\{[\s\S]*?animation-play-state:\s*paused;/,
  );

  view.rerender(
    React.createElement(SonarBackground, { interactionPaused: false }),
  );
  await waitFor(() =>
    assert.equal(whaleControllers[0].resume.mock.callCount(), 1),
  );
  assert.equal(sonar.dataset.sonarInteractionPaused, "false");
});

test("MO-4 uses an interruptible concurrent 150ms transition with a low-cadence fallback", () => {
  assert.doesNotMatch(profitKpiBoardSource, /setTimeout/);
  assert.doesNotMatch(profitKpiBoardSource, /startViewTransition/);
  assert.doesNotMatch(profitKpiBoardSource, /MO4_PHASE_MS/);
  assert.doesNotMatch(profitKpiBoardSource, /incomingVariant/);
  assert.doesNotMatch(motionCss, /@keyframes mo4-content-/);
  assert.doesNotMatch(motionCss, /mo4-layer-incoming-(?:odd|even)/);
  assert.match(
    profitKpiBoardSource,
    /typeof window\.TransitionEvent !== "function"/,
  );
  assert.match(
    profitKpiBoardSource,
    /const MO4_MAX_FRAME_INTERVAL_MS = 25;[\s\S]*?const MO4_CADENCE_SAMPLE_COUNT = 12;/,
  );
  assert.match(
    profitKpiBoardSource,
    /requestAnimationFrame\(sampleCadence\)[\s\S]*?medianInterval <= MO4_MAX_FRAME_INTERVAL_MS[\s\S]*?mo4CadenceRef\.current = nextCadence/,
  );
  assert.match(
    profitKpiBoardSource,
    /mo4CadenceRef\.current !== "full"[\s\S]*?setActiveMo4Transition\(null\)/,
  );
  assert.match(profitKpiBoardSource, /data-mo4-cadence=\{mo4Cadence\}/);
  assert.match(
    profitKpiBoardSource,
    /data-mo4-retarget="current-presentation-value"/,
  );
  assert.match(
    profitKpiBoardSource,
    /data-transition-strategy="css-transition"/,
  );
  assert.match(
    profitKpiBoardSource,
    /flushSync\(\(\) => \{[\s\S]*?selectControl\(\);[\s\S]*?setVisibleMode\(nextView\.mode\);[\s\S]*?setVisibleCategory\(nextView\.category\);[\s\S]*?setActiveMo4Transition\(\{/,
  );
  assert.match(
    profitKpiBoardSource,
    /interactionPaused=\{sonarInteractionPaused\}/,
  );
  assert.match(
    profitKpiBoardSource,
    /activeMo4Transition\?\.kind === "mode"[\s\S]*?renderModeContent\(activeMo4Transition\.from\)[\s\S]*?renderCategoryContent\(activeMo4Transition\.from\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /attribute\.name === "id"[\s\S]*?attribute\.name\.startsWith\("aria-"\)[\s\S]*?attribute\.name\.startsWith\("data-"\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /const mo4SanitizedAttributes = new WeakMap<[\s\S]*?removedAttributes\.push\(\[attribute\.name, attribute\.value\]\)[\s\S]*?mo4SanitizedAttributes\.set\(snapshotElement, removedAttributes\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /function restoreMo4OutgoingLayer[\s\S]*?snapshotElement\.setAttribute\(name, value\)[\s\S]*?mo4SanitizedAttributes\.delete\(snapshotElement\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /restoreMo4OutgoingLayer\(modeOutgoingRef\.current\);[\s\S]*?restoreMo4OutgoingLayer\(categoryOutgoingRef\.current\);[\s\S]*?!motionEnabled\(\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /function captureMo4RetargetPresentation[\s\S]*?window\.getComputedStyle\(element\)[\s\S]*?--mo4-retarget-opacity[\s\S]*?--mo4-retarget-transform/,
  );
  assert.match(
    profitKpiBoardSource,
    /if \(activeMo4Transition\) \{[\s\S]*?captureMo4RetargetPresentation\([\s\S]*?modeOutgoingRef\.current[\s\S]*?categoryOutgoingRef\.current[\s\S]*?restoreMo4OutgoingLayer/,
  );
  assert.match(
    profitKpiBoardSource,
    /function clearMo4RetargetPresentation[\s\S]*?removeProperty\("--mo4-retarget-opacity"\)[\s\S]*?removeProperty\("--mo4-retarget-transform"\)[\s\S]*?capturedElements\.clear\(\)/,
  );
  assert.match(
    profitKpiBoardSource,
    /setActiveMo4Transition\(null\);[\s\S]*?clearMo4RetargetPresentation\(mo4RetargetElementsRef\.current\);[\s\S]*?return;/,
  );
  assert.match(
    profitKpiBoardSource,
    /transitionTokenRef\.current !== token[\s\S]*?clearMo4RetargetPresentation\(mo4RetargetElementsRef\.current\)[\s\S]*?setActiveMo4Transition/,
  );
  assert.match(
    profitKpiBoardSource,
    /useEffect\(\(\) => \{[\s\S]*?clearMo4RetargetPresentation\(mo4RetargetElementsRef\.current\);[\s\S]*?setActiveMo4Transition\(null\);[\s\S]*?return \(\) => \{[\s\S]*?clearMo4RetargetPresentation\(mo4RetargetElementsRef\.current\);/,
  );
  assert.match(
    profitKpiBoardSource,
    /ref=\{modeOutgoingRef\}[\s\S]*?className="mo4-layer-outgoing"[\s\S]*?aria-hidden="true"[\s\S]*?inert/,
  );
  assert.match(
    profitKpiBoardSource,
    /flushSync\([\s\S]*?sanitizeMo4OutgoingLayer\(modeOutgoingRef\.current\);[\s\S]*?sanitizeMo4OutgoingLayer\(categoryOutgoingRef\.current\);/,
  );
  assert.match(
    profitKpiBoardSource,
    /event\.propertyName !== "opacity"[\s\S]*?active\?\.token === token \? null : active/,
  );
  assert.match(profitKpiBoardSource, /onTransitionEnd=/);
  assert.match(profitKpiBoardSource, /onTransitionCancel=/);
  assert.match(profitKpiBoardSource, /const MO4_TOTAL_MS = 150;/);
  assert.match(
    motionCss,
    /\.mo4-layer-live,[\s\S]*?\.mo4-layer-outgoing,[\s\S]*?\.mo4-layer-incoming\s*\{[\s\S]*?transition-property:\s*opacity, transform;[\s\S]*?transition-duration:\s*150ms;[\s\S]*?transition-timing-function:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\);/,
  );
  assert.match(
    motionCss,
    /\.mo4-layer-outgoing\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*none;[\s\S]*?transform:\s*translate3d\(0, -4px, 0\);/,
  );
  assert.match(
    motionCss,
    /@starting-style\s*\{[\s\S]*?\.mo4-layer-incoming\s*\{[\s\S]*?opacity:\s*var\(--mo4-retarget-opacity, 0\);[\s\S]*?transform:\s*var\(--mo4-retarget-transform, translate3d\(0, 4px, 0\)\);/,
  );
  assert.match(
    profitKpiBoardSource,
    /key=\{`mode-\$\{activeMo4Transition\.from\.mode\}`\}[\s\S]*?className="mo4-layer-outgoing"[\s\S]*?activeMo4Transition\.to\.mode[\s\S]*?"mo4-layer-incoming"/,
  );
});

test("reduced-motion contract removes every MO sonar layer", () => {
  const view = render(React.createElement(SonarBackground));

  for (const testId of ["radar-sweep", "sonar-breathe", "sonar-particles"]) {
    assert.ok(
      view.getByTestId(testId).classList.contains("motion-reduce:hidden"),
    );
  }
  assert.match(
    motionCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sonar-sweep,[\s\S]*?\.sonar-breathe,[\s\S]*?\.sonar-particles\s*\{[\s\S]*?display:\s*none !important;[\s\S]*?animation:\s*none !important;/,
  );
});
