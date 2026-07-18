import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import {
  PUBLIC_RESPONSE_SECURITY_HEADERS,
  configureSecurityHeaders,
} from "./securityHeaders.ts";

async function withServer(configure, run) {
  const app = express();
  configure(app);
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(
    PUBLIC_RESPONSE_SECURITY_HEADERS,
  )) {
    assert.equal(response.headers.get(name), value);
  }
}

test("successful responses receive the public security headers", async () => {
  await withServer(
    (app) => {
      configureSecurityHeaders(app);
      app.get("/ok", (_request, response) =>
        response.status(200).json({ ok: true }),
      );
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ok`);
      assert.equal(response.status, 200);
      assertSecurityHeaders(response);
    },
  );
});

test("unmatched responses also retain the public security headers", async () => {
  await withServer(
    (app) => configureSecurityHeaders(app),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/missing`);
      assert.equal(response.status, 404);
      assertSecurityHeaders(response);
    },
  );
});
