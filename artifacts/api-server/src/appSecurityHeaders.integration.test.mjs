import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

const originalEnv = {
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};
process.env.CLERK_PUBLISHABLE_KEY = "pk_test_ZXhhbXBsZS5jb20k";
process.env.DATABASE_URL = "postgresql://fake:fake@127.0.0.1:1/fake";
process.env.NODE_ENV = "test";

mock.module("@clerk/express", {
  namedExports: {
    clerkMiddleware: () => (_request, _response, next) => next(),
    getAuth: () => ({ userId: null }),
  },
});
mock.module("@clerk/shared/keys", {
  namedExports: {
    publishableKeyFromHost: (_host, fallback) => fallback,
  },
});

const { default: app } = await import("./app.ts");
const { PUBLIC_RESPONSE_SECURITY_HEADERS } =
  await import("./lib/securityHeaders.ts");
const { pool } = await import("@workspace/db");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(
    PUBLIC_RESPONSE_SECURITY_HEADERS,
  )) {
    assert.equal(response.headers.get(name), value);
  }
}

test("the assembled app applies headers to the health response", async () => {
  const response = await fetch(`${baseUrl}/api/healthz`);
  assert.equal(response.status, 200);
  assertSecurityHeaders(response);
});

test("the assembled app retains headers on its JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/batch13-missing`);
  assert.equal(response.status, 404);
  assertSecurityHeaders(response);
});
