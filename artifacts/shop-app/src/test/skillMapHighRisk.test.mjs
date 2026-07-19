import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "./domBootstrap.mjs";

const restoreDom = installTestDom();
const originalFetch = globalThis.fetch;
const originalReact = globalThis.React;
const originalConfirm = globalThis.window.confirm;
globalThis.React = React;

const enableBodies = [];
let confirmResult = true;

function jsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

globalThis.fetch = async (input, init = {}) => {
  const path = String(input);
  const method = init.method ?? "GET";

  if (method === "GET" && path.endsWith("/skills")) {
    return jsonResponse({
      catalogVersion: 7,
      skills: [
        {
          skillKey: "S-19",
          enabled: false,
          highRisk: true,
          prerequisite: { ready: true, missing: [] },
        },
      ],
    });
  }
  if (path.endsWith("/skills/S-19/preview")) {
    return jsonResponse({
      prerequisite: { ready: true, missing: [] },
      highRiskConfirmationRequired: true,
    });
  }
  if (path.endsWith("/skills/S-19/enable")) {
    enableBodies.push(JSON.parse(init.body));
    return jsonResponse({ enabled: true });
  }

  throw new Error(`unexpected fetch: ${method} ${path}`);
};
globalThis.window.confirm = () => confirmResult;

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
  },
});

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetMyStore: () => ({ data: { id: 17 } }),
  },
});

mock.module("wouter", {
  namedExports: {
    useLocation: () => ["/skill-map", () => undefined],
  },
});

mock.module("@/lib/dailySkillVisibilityContext", {
  namedExports: {
    useDailySkillVisibility: () => ({ refresh: async () => undefined }),
  },
});

mock.module("../pages/Dashboard.tsx", {
  namedExports: {
    BottomNav: () => null,
  },
});

const { cleanup, fireEvent, render, waitFor, within } =
  await import("@testing-library/react");
const { default: SkillMapPage } = await import("../pages/SkillMap.tsx");

afterEach(() => {
  cleanup();
  enableBodies.length = 0;
  confirmResult = true;
});

after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window.confirm = originalConfirm;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

async function openHighRiskConfirmation(view) {
  const skillKey = await view.findByText("S-19");
  const skillCard = skillKey.closest("article");
  assert.ok(skillCard);
  const toggle = within(skillCard).getByRole("button");
  await waitFor(() => assert.equal(toggle.disabled, false));
  fireEvent.click(toggle);
  return view.findByRole("dialog", { name: /第二次確認：客戶個資保護/ });
}

test("a ready high-risk skill opens the second confirmation before enabling", async () => {
  const view = render(React.createElement(SkillMapPage));

  await openHighRiskConfirmation(view);

  assert.equal(enableBodies.length, 0);
  assert.match(view.container.textContent, /我已閱讀影響與風險/);
});

test("acknowledging the risk sends both confirmations before enabling", async () => {
  const view = render(React.createElement(SkillMapPage));
  const dialog = await openHighRiskConfirmation(view);
  const acknowledgment = view.getByRole("checkbox");
  const confirmButton = view.getByRole("button", { name: "確認開啟" });

  assert.equal(confirmButton.disabled, true);
  fireEvent.click(acknowledgment);
  assert.equal(confirmButton.disabled, false);
  fireEvent.click(confirmButton);

  await waitFor(() => assert.equal(enableBodies.length, 1));
  assert.deepEqual(enableBodies[0], {
    enabled: true,
    catalogVersion: 7,
    confirmImpact: true,
    confirmRisk: true,
  });
  assert.equal(dialog.isConnected, false);
});

test("cancelling the second confirmation never enables the skill", async () => {
  const view = render(React.createElement(SkillMapPage));
  const dialog = await openHighRiskConfirmation(view);

  fireEvent.click(view.getByRole("button", { name: "取消" }));

  await waitFor(() => assert.equal(dialog.isConnected, false));
  assert.equal(enableBodies.length, 0);
});
