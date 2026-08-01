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
const packageApplyBodies = [];
let refreshDailyVisibilityCalls = 0;
let prerequisiteReady = true;

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
      catalogVersion: 11,
      skills: [
        {
          skillKey: "S-19",
          enabled: false,
          highRisk: false,
          prerequisite: {
            ready: prerequisiteReady,
            missing: prerequisiteReady ? [] : ["S-01"],
          },
        },
      ],
    });
  }
  if (path.endsWith("/skills/S-19/preview")) {
    return jsonResponse({
      prerequisite: { ready: true, missing: [] },
      highRiskConfirmationRequired: false,
    });
  }
  if (path.endsWith("/skills/S-19/enable")) {
    enableBodies.push(JSON.parse(init.body));
    return jsonResponse({ enabled: true });
  }
  if (path.endsWith("/skill-packages/wholesale/preview")) {
    return jsonResponse({
      packageKey: "wholesale",
      enableNow: ["S-19"],
      alreadyEnabled: [],
      requiresConfirmation: [],
      missingPrerequisite: [],
    });
  }
  if (path.endsWith("/skill-packages/wholesale/apply")) {
    packageApplyBodies.push(JSON.parse(init.body));
    return jsonResponse({ applied: ["S-19"] });
  }

  throw new Error(`unexpected fetch: ${method} ${path}`);
};
globalThis.window.confirm = () => true;

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
    useDailySkillVisibility: () => ({
      refresh: async () => {
        refreshDailyVisibilityCalls += 1;
      },
    }),
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
  packageApplyBodies.length = 0;
  refreshDailyVisibilityCalls = 0;
  prerequisiteReady = true;
});

after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window.confirm = originalConfirm;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("a normal skill enables with the standard confirmation body", async () => {
  const view = render(React.createElement(SkillMapPage));
  const skillKey = await view.findByText("S-19");
  const skillCard = skillKey.closest("article");
  assert.ok(skillCard);
  const toggle = within(skillCard).getByRole("button");
  await waitFor(() => assert.equal(toggle.disabled, false));

  fireEvent.click(toggle);

  await waitFor(() => assert.equal(enableBodies.length, 1));
  assert.deepEqual(enableBodies[0], {
    enabled: true,
    catalogVersion: 11,
    confirmImpact: false,
    confirmRisk: false,
  });
  assert.equal(refreshDailyVisibilityCalls, 1);
});

test("applying a package refreshes daily skill visibility", async () => {
  const view = render(React.createElement(SkillMapPage));
  await view.findByText("S-19");
  const packageSection = view.container.querySelector(
    'section[aria-labelledby="skill-group-wholesale"]',
  );
  assert.ok(packageSection);

  fireEvent.click(within(packageSection).getAllByRole("button")[0]);
  const dialog = await view.findByRole("dialog");
  fireEvent.click(within(dialog).getAllByRole("button")[1]);

  await waitFor(() => assert.equal(packageApplyBodies.length, 1));
  assert.deepEqual(packageApplyBodies[0], { catalogVersion: 11 });
  assert.equal(refreshDailyVisibilityCalls, 1);
});

test("a missing prerequisite disables the skill toggle and explains the lock", async () => {
  prerequisiteReady = false;
  const view = render(React.createElement(SkillMapPage));
  const skillKey = await view.findByText("S-19");
  const skillCard = skillKey.closest("article");
  assert.ok(skillCard);

  const toggle = within(skillCard).getByRole("button");
  assert.equal(toggle.disabled, true);
  assert.match(skillCard.textContent, /S-01/);
});
