import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { installTestDom } from "./domBootstrap.mjs";
const restoreDom = installTestDom();
const previousReact = globalThis.React;
globalThis.React = React;
const getToken = async () => "synthetic-owner-token";
mock.module("@clerk/react", { namedExports: { useAuth: () => ({ getToken, isLoaded: true }) } });
const { cleanup, render, waitFor } = await import("@testing-library/react");
const { default: Storefront } = await import("../pages/Storefront.tsx");
const { default: ProductImage } = await import("../components/ProductImage.tsx");
afterEach(() => { cleanup(); mock.restoreAll(); });
after(() => { globalThis.React = previousReact; restoreDom(); });

test("public brand and product entrance contains no synthetic catalog or signup workflow", () => {
  const view = render(React.createElement(Storefront));
  assert.ok(view.getByRole("heading", { name: "商品準備中" }));
  assert.equal(view.getByRole("link", { name: "商品" }).getAttribute("href"), "/shop");
  assert.equal(view.getByRole("link", { name: "店主管理" }).getAttribute("href"), "/sign-in");
  assert.doesNotMatch(view.container.textContent, /合成|POC|假客戶|註冊|建立店鋪|Seller Agent/);
});

test("private image uses owner bearer only on the same-origin stable path and releases blob after unmount", async () => {
  const path = "/api/poc/images/products/1/1234567890123-0000000000000000.png";
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, path);
    assert.equal(options.headers.authorization, "Bearer synthetic-owner-token");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
  });
  mock.method(URL, "createObjectURL", () => "blob:synthetic-image");
  const revoke = mock.method(URL, "revokeObjectURL", () => {});
  const view = render(React.createElement(ProductImage, { src: "https://old-site.example" + path, alt: "商品圖" }));
  await waitFor(() => assert.equal(view.getByAltText("商品圖").getAttribute("src"), "blob:synthetic-image"), { timeout: 10000 });
  assert.equal(fetchMock.mock.callCount(), 1);
  view.unmount();
  assert.equal(revoke.mock.callCount(), 1);
});

test("ordinary logos and local upload previews do not receive Clerk bearer fetches", () => {
  const network = mock.method(globalThis, "fetch", () => { throw new Error("unexpected fetch"); });
  const view = render(React.createElement(ProductImage, { src: "blob:local-upload", alt: "預覽" }));
  assert.equal(view.getByAltText("預覽").getAttribute("src"), "blob:local-upload");
  assert.equal(network.mock.callCount(), 0);
});

test("app no longer imports Agent, signup, setup or automatic store creation; owner gate remains", async () => {
  const source = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /AgentSettings|useCreateStore|createStore|SignUpPage|SetupPage|<SignUp\b/);
  assert.match(source, /withSignUp=\{false\}/);
  assert.match(source, /if \(!isSignedIn\) return <Redirect to="\/sign-in"/);
  assert.match(source, /isAuthError/);
  assert.match(source, /VITE_PUBLIC_SHOP/);
  assert.match(source, /VITE_PRIVATE_POC/);
});
