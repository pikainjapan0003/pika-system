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

const { default: app } = await import("../app.ts");
const { logger } = await import("./logger.ts");
const { pool } = await import("@workspace/db");
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("preserves a valid incoming request id and returns it in the header", async () => {
  const response = await fetch(`${baseUrl}/api/request-id-missing`, {
    headers: { "x-request-id": "batch21-client-42" },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-request-id"), "batch21-client-42");
});

test("generates a UUID request id when the header is absent or invalid", async () => {
  const response = await fetch(`${baseUrl}/api/request-id-missing`, {
    headers: { "x-request-id": "bad id with spaces" },
  });
  const requestId = response.headers.get("x-request-id");
  assert.equal(response.status, 404);
  assert.match(requestId, /^[0-9a-f-]{36}$/);
});

test("global error logs carry only the request id and sanitized error", async () => {
  const errorMock = mock.method(logger, "error");
  try {
    const response = await fetch(`${baseUrl}/api/p/batch15-forced-db-error`, {
      headers: { "x-request-id": "batch21-error-7" },
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-request-id"), "batch21-error-7");
    assert.equal(errorMock.mock.calls.length, 1);
    const [payload] = errorMock.mock.calls[0].arguments;
    assert.equal(payload.requestId, "batch21-error-7");
    assert.doesNotMatch(
      JSON.stringify(payload),
      /body|headers|user-agent|x-forwarded-for|127\.0\.0\.1|postgresql|select \* from|0912345678/i,
    );
  } finally {
    errorMock.mock.restore();
  }
});
