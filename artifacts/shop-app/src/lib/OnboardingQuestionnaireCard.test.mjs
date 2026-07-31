import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

import React from "react";

import { installTestDom } from "../test/domBootstrap.mjs";

const restoreDom = installTestDom();
const originalFetch = globalThis.fetch;
const originalReact = globalThis.React;
globalThis.React = React;

const requests = [];
let appliedCallbackCount = 0;

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

globalThis.fetch = async (input, init = {}) => {
  const path = String(input);
  const method = init.method ?? "GET";
  requests.push({
    path,
    method,
    body: init.body ? JSON.parse(init.body) : null,
  });
  if (method === "GET" && path.endsWith("/skills")) {
    return response({ catalogVersion: 7, skills: [] });
  }
  if (path.endsWith("/preview")) {
    const packageKey = path.split("/").at(-2);
    return response({
      packageKey,
      enableNow: packageKey === "beginner" ? ["S-01"] : ["S-07"],
      alreadyEnabled: [],
      missingPrerequisite: [],
      requiresConfirmation: packageKey === "cost" ? ["S-08"] : [],
    });
  }
  if (path.endsWith("/apply")) {
    return response({ applied: true });
  }
  throw new Error(`unexpected fetch: ${method} ${path}`);
};

mock.module("@clerk/react", {
  namedExports: {
    useAuth: () => ({ getToken: async () => "fake-token" }),
  },
});

const { cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { OnboardingQuestionnaire } =
  await import("./OnboardingQuestionnaireCard.tsx");

function renderQuestionnaire() {
  return render(
    React.createElement(OnboardingQuestionnaire, {
      storeId: 17,
      onApplied: async () => {
        appliedCallbackCount += 1;
      },
    }),
  );
}

afterEach(() => {
  cleanup();
  requests.length = 0;
  appliedCallbackCount = 0;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  restoreDom();
});

test("a zero-skill owner sees all four questions", () => {
  const view = renderQuestionnaire();
  assert.match(view.container.textContent, /1\. 你現在最想先處理哪件事/);
  assert.match(view.container.textContent, /2\. 你目前對成本管理的需要/);
  assert.match(view.container.textContent, /3\. 你平常一次大約處理多少訂單/);
  assert.match(view.container.textContent, /4\. 你目前的出貨與物流需求/);
});

test("cost answers preview beginner and cost without applying them", async () => {
  const view = renderQuestionnaire();
  fireEvent.click(view.getByLabelText("看懂成本與毛利"));
  fireEvent.click(view.getByLabelText("需要精確分攤與定格毛利"));
  fireEvent.click(view.getByText("查看推薦"));

  await view.findByText("新手套餐 ＋ 成本套餐");
  assert.equal(
    requests.filter((item) => item.path.endsWith("/preview")).length,
    2,
  );
  assert.equal(
    requests.filter((item) => item.path.endsWith("/apply")).length,
    0,
  );
  assert.match(view.container.textContent, /需到技能地圖確認：S-08/);
});

test("apply is sent only after confirmation and keeps package order", async () => {
  const view = renderQuestionnaire();
  fireEvent.click(view.getByLabelText("看懂成本與毛利"));
  fireEvent.click(view.getByText("查看推薦"));
  await view.findByText("新手套餐 ＋ 成本套餐");

  fireEvent.click(view.getByText("套用推薦"));
  await waitFor(() => assert.equal(appliedCallbackCount, 1));

  const applyRequests = requests.filter((item) => item.path.endsWith("/apply"));
  assert.deepEqual(
    applyRequests.map((item) => item.path.split("/").at(-2)),
    ["beginner", "cost"],
  );
  assert.deepEqual(
    applyRequests.map((item) => item.body),
    [{ catalogVersion: 7 }, { catalogVersion: 7 }],
  );
});

test("skipping previews only the beginner package", async () => {
  const view = renderQuestionnaire();
  fireEvent.click(view.getByText("跳過問卷，使用新手套餐"));
  await view.findByText("你的推薦套餐");

  const previewRequests = requests.filter((item) =>
    item.path.endsWith("/preview"),
  );
  assert.equal(previewRequests.length, 1);
  assert.match(previewRequests[0].path, /skill-packages\/beginner\/preview$/);
});
