import assert from "node:assert/strict";
import test from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

test("Testing Library renders into the shared jsdom environment", async () => {
  const restoreDom = installTestDom();
  const { cleanup, render } = await import("@testing-library/react");

  try {
    const view = render(React.createElement("div", null, "DOM ready"));
    assert.equal(view.container.textContent, "DOM ready");
  } finally {
    cleanup();
    restoreDom();
  }
});
