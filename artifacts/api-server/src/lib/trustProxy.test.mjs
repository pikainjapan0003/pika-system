import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express from "express";
import rateLimit from "express-rate-limit";
import {
  configureTrustProxy,
  TRUSTED_REVERSE_PROXY_HOPS,
} from "./trustProxy.ts";

const openServers = new Set();

afterEach(async () => {
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  openServers.clear();
});

async function listen(app) {
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  openServers.add(server);
  return `http://127.0.0.1:${server.address().port}`;
}

test("trusts exactly the single reverse proxy in front of the API", () => {
  const app = express();
  configureTrustProxy(app);

  assert.equal(app.get("trust proxy"), TRUSTED_REVERSE_PROXY_HOPS);

  const trustProxy = app.get("trust proxy fn");
  assert.equal(trustProxy("127.0.0.1", 0), true);
  assert.equal(trustProxy("127.0.0.1", 1), false);
});

test("uses the nearest forwarded address without rate-limit proxy validation errors", async () => {
  const app = express();
  configureTrustProxy(app);

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.get("/ip", (request, response) => response.json({ ip: request.ip }));

  const reportedErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => reportedErrors.push(args.map(String).join(" "));

  try {
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/ip`, {
      headers: {
        // The left-most value is attacker-controlled. With one trusted proxy,
        // Express must use only the nearest address written by that proxy.
        "x-forwarded-for": "198.51.100.99, 203.0.113.42",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ip: "203.0.113.42" });
    assert.equal(
      reportedErrors.some(
        (message) =>
          message.includes("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR") ||
          message.includes("ERR_ERL_PERMISSIVE_TRUST_PROXY"),
      ),
      false,
    );
  } finally {
    console.error = originalConsoleError;
  }
});
