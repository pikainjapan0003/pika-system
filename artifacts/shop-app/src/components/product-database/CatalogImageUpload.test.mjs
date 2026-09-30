import assert from "node:assert/strict";
import { test, after, afterEach, mock } from "node:test";
import React, { useState } from "react";
import { installTestDom } from "../../test/domBootstrap.mjs";
const restore = installTestDom();
const originalReact = globalThis.React;
globalThis.React = React;
const originalFetch = globalThis.fetch;
let calls = [],
  changes = [],
  handler;
globalThis.fetch = (...args) => {
  calls.push(args);
  return handler(...args);
};
mock.module("@clerk/react", {
  namedExports: { useAuth: () => ({ getToken: async () => "test-token" }) },
});
mock.module("./shared.tsx", {
  namedExports: { action: "min-h-11", control: "" },
});
const { render, cleanup, fireEvent, waitFor, act } =
  await import("@testing-library/react");
const { CatalogImageUpload } = await import("./CatalogImageUpload.tsx");
function Harness({ storeId = 7 }) {
  const [value, setValue] = useState("https://example.com/original.jpg");
  const [busy, setBusy] = useState(false);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CatalogImageUpload, {
      storeId,
      value,
      onUploadingChange: setBusy,
      onChange: (url) => {
        changes.push(url);
        setValue(url);
      },
    }),
    React.createElement("button", { disabled: busy }, "儲存商品"),
    React.createElement("output", { "aria-label": "儲存的圖片" }, value),
  );
}
function choose(
  v,
  file = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
    type: "image/png",
  }),
) {
  fireEvent.change(v.getByLabelText("選擇商品圖片"), {
    target: { files: [file] },
  });
}
afterEach(() => {
  cleanup();
  calls = [];
  changes = [];
});
after(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  globalThis.React = originalReact;
  restore();
});

test("upload shows a local preview, blocks saving, and only saves the returned image URL", async () => {
  let resolve;
  handler = () =>
    new Promise((r) => {
      resolve = r;
    });
  const v = render(React.createElement(Harness));
  assert.equal(v.container.querySelector("details").open, false);
  choose(v);
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][0], "/api/stores/7/products/image");
  assert.equal(calls[0][1].body.get("image").name, "photo.png");
  assert.equal(calls[0][1].headers.Authorization, "Bearer test-token");
  assert.equal(v.getByRole("button", { name: "儲存商品" }).disabled, true);
  assert.match(v.getByAltText("商品圖片預覽").src, /^blob:/);
  await act(async () =>
    resolve(
      new Response(
        JSON.stringify({ imageUrl: "https://example.com/new.png" }),
        { status: 201 },
      ),
    ),
  );
  await v.findByText("圖片已上傳，儲存商品後套用。");
  assert.deepEqual(changes, ["https://example.com/new.png"]);
  assert.equal(v.getByRole("button", { name: "儲存商品" }).disabled, false);
  fireEvent.click(v.getByRole("button", { name: "移除照片" }));
  assert.deepEqual(changes, ["https://example.com/new.png", ""]);
});
test("failed upload retains the existing saved image and permits retry", async () => {
  handler = async () => new Response("", { status: 403 });
  const v = render(React.createElement(Harness));
  choose(v);
  await v.findByRole("alert");
  assert.match(v.getByRole("alert").textContent, /重新登入/);
  assert.equal(
    v.getByAltText("商品圖片預覽").src,
    "https://example.com/original.jpg",
  );
  assert.deepEqual(changes, []);
  assert.equal(v.getByRole("button", { name: "儲存商品" }).disabled, false);
});
test("invalid type and oversized files are rejected before any request", () => {
  const v = render(React.createElement(Harness));
  choose(v, new File(["x"], "document.txt", { type: "text/plain" }));
  assert.match(v.getByRole("alert").textContent, /僅支援/);
  choose(
    v,
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    }),
  );
  assert.match(v.getByRole("alert").textContent, /5MB/);
  assert.equal(calls.length, 0);
  assert.deepEqual(changes, []);
});
test("store switch aborts upload and rejects its late result", async () => {
  let resolve;
  handler = () =>
    new Promise((r) => {
      resolve = r;
    });
  const v = render(React.createElement(Harness));
  choose(v);
  await waitFor(() => assert.equal(calls.length, 1));
  const signal = calls[0][1].signal;
  v.rerender(React.createElement(Harness, { storeId: 8 }));
  assert.equal(signal.aborted, true);
  await act(async () =>
    resolve(
      new Response(
        JSON.stringify({ imageUrl: "https://example.com/wrong-store.png" }),
        { status: 201 },
      ),
    ),
  );
  assert.deepEqual(changes, []);
  assert.equal(v.getByRole("button", { name: "儲存商品" }).disabled, false);
});
