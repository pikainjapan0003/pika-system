import assert from "node:assert/strict";
import { test, mock } from "node:test";
import worker from "./worker.mjs";

const env = { PIKA_POC_API_ORIGIN: "https://isolated-api.example.test", PIKA_POC_PROXY_SECRET: "new-test-gateway-secret-not-a-production-secret" };
test("gateway fails closed without an HTTPS origin and service secret", async () => {
  for (const configuration of [{}, { ...env, PIKA_POC_API_ORIGIN: "http://localhost" }, { ...env, PIKA_POC_API_ORIGIN: "https://a.test/redirect" }, { ...env, PIKA_POC_PROXY_SECRET: "short" }]) {
    assert.equal((await worker.fetch(new Request("https://site.test/api/me/store"), configuration)).status, 503);
  }
});
test("fixed upstream preserves request body and Clerk bearer; strips untrusted headers and upstream cookies", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://isolated-api.example.test/api/cart/orders?x=1");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.get("authorization"), "Bearer synthetic-token");
    assert.equal(options.headers.get("x-pika-poc-key"), env.PIKA_POC_PROXY_SECRET);
    for (const name of ["cookie", "x-forwarded-host", "x-test-clerk-user", "origin"]) assert.equal(options.headers.has(name), false);
    assert.equal(await new Response(options.body).text(), '{"quantity":2}');
    return new Response('{"saved":true}', { status: 201, headers: { "content-type": "application/json", "set-cookie": "unexpected=1" } });
  });
  try {
    const response = await worker.fetch(new Request("https://site.test/api/cart/orders?x=1", { method: "POST", headers: {
      authorization: "Bearer synthetic-token", cookie: "private=1", "x-forwarded-host": "attacker.test", "x-pika-poc-key": "attacker", "x-test-clerk-user": "owner",
    }, body: '{"quantity":2}' }), env);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.has("set-cookie"), false);
  } finally { fetchMock.mock.restore(); }
});
test("redirects and upstream failures cannot disclose the service credential", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 302, headers: { location: "https://other.test" } }));
  try { assert.equal((await worker.fetch(new Request("https://site.test/api/me/store"), env)).status, 502); }
  finally { fetchMock.mock.restore(); }
});
test("ledger and cleartext export confirmation headers reach the authenticated API", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.get("x-confirm-store-credit"), "true");
    assert.equal(options.headers.get("x-confirm-cleartext-export"), "true");
    assert.equal(options.headers.has("cookie"), false);
    assert.equal(options.headers.get("authorization"), "Bearer synthetic-clerk-token");
    return new Response('"客戶代號"\r\n"POC-ONLY"', { headers: { "content-type": "text/csv; charset=utf-8" } });
  });
  try {
    const response = await worker.fetch(new Request("https://site.test/api/stores/1/customers/export?mode=cleartext", { headers: {
      authorization: "Bearer synthetic-clerk-token", "x-confirm-store-credit": "true", "x-confirm-cleartext-export": "true", cookie: "private=1",
    } }), env);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.match(await response.text(), /POC-ONLY/);
  } finally { fetchMock.mock.restore(); }
});
test("OCR forwards its stable client request ID and keeps the long wait scoped to analyze", async () => {
  const deadlines = [];
  const timeoutMock = mock.method(AbortSignal, "timeout", ms => { deadlines.push(ms); return new AbortController().signal; });
  const fetchMock = mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.get("x-client-request-id"), "synthetic-request-id");
    return Response.json({ run: { id: 1 } });
  });
  try {
    for (const path of ["/api/stores/1/invoice-ocr/test-cases/1/analyze", "/api/cart/orders"]) {
      await worker.fetch(new Request("https://site.test" + path, { method: "POST",
        headers: { "x-client-request-id": "synthetic-request-id" }, body: "{}" }), env);
    }
    assert.deepEqual(deadlines, [140000, 25000]);
  } finally { fetchMock.mock.restore(); timeoutMock.mock.restore(); }
});
test("SPA deep links fall back to HTML, assets and unsupported methods do not", async () => {
  const assetEnv = { ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname;
    if (path === "/index.html") return new Response(null, { status: 307, headers: { location: "/" } });
    return new Response(path === "/" ? "<html>POC</html>" : "Not found", { status: path === "/" ? 200 : 404 });
  } } };
  for (const path of ["/track/fake", "/products", "/settings/invoice-ocr"]) {
    const response = await worker.fetch(new Request("https://site.test" + path, { headers: { accept: "text/html" } }), assetEnv);
    assert.equal(response.status, 200);
    assert.equal(response.headers.has("location"), false);
    assert.equal(await response.text(), "<html>POC</html>");
  }
  assert.equal((await worker.fetch(new Request("https://site.test/missing.js"), assetEnv)).status, 404);
  assert.equal((await worker.fetch(new Request("https://site.test/products", { method: "POST" }), assetEnv)).status, 405);
});
