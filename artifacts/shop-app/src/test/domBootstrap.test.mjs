import assert from "node:assert/strict";
import test from "node:test";

import React from "react";

import { applyThemeRouteScope } from "../lib/themeScope.ts";
import { installTestDom } from "./domBootstrap.mjs";

test("Testing Library renders into the shared jsdom environment", async () => {
  const restoreDom = installTestDom();
  const { cleanup, render } = await import("@testing-library/react");

  try {
    const view = render(React.createElement("div", null, "DOM ready"));
    assert.equal(view.container.textContent, "DOM ready");

    applyThemeRouteScope("night", false, document);
    assert.equal(document.body.dataset.pikaTheme, "night");
    assert.equal(document.body.dataset.pikaBrand, "disabled");
    assert.equal(document.body.classList.contains("dark"), true);
    assert.equal(document.body.style.colorScheme, "dark");

    applyThemeRouteScope("light", true, document);
    assert.equal(document.body.dataset.pikaTheme, "light");
    assert.equal(document.body.dataset.pikaBrand, "enabled");
    assert.equal(document.body.classList.contains("dark"), false);
    assert.equal(document.body.style.colorScheme, "light");

    applyThemeRouteScope("legacy", false, document);
    assert.equal(document.body.dataset.pikaTheme, "legacy");
    assert.equal(document.body.dataset.pikaBrand, "disabled");
    assert.equal(document.body.classList.contains("dark"), false);
    assert.equal(document.body.style.colorScheme, "");
  } finally {
    cleanup();
    restoreDom();
  }
});

test("Testing Library shares the configured async timeout", async () => {
  const restoreDom = installTestDom();

  try {
    const { getConfig } = await import("@testing-library/react");
    assert.equal(getConfig().asyncUtilTimeout, 15_000);
  } finally {
    restoreDom();
  }
});
