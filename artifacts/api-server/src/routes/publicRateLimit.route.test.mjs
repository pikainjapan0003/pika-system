import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "@workspace/db";
import publicRouter from "./public.ts";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use("/api", publicRouter);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(method, path, body, forwardedFor) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedFor,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
  };
}

function assertSafeRateLimitResponse(data) {
  assert.deepStrictEqual(Object.keys(data).sort(), ["error"]);
  assert.equal(typeof data.error, "string");
  assert.equal(
    JSON.stringify(data).match(/cost|profit|snapshot|buyer|phone|token/gi),
    null,
    "a public 429 response must not expose internal or personal fields",
  );
}

describe("public endpoint rate limits", () => {
  test("the 21st order submission within ten minutes returns a safe 429", async () => {
    const forwardedFor = "203.0.113.21";
    for (let requestNumber = 1; requestNumber <= 20; requestNumber += 1) {
      const { status } = await request(
        "POST",
        "/p/rate-limit-test-product/orders",
        {},
        forwardedFor,
      );
      assert.notStrictEqual(
        status,
        429,
        `request ${requestNumber} must remain below the limit`,
      );
    }

    const { status, data } = await request(
      "POST",
      "/p/rate-limit-test-product/orders",
      {},
      forwardedFor,
    );
    assert.strictEqual(status, 429);
    assertSafeRateLimitResponse(data);
  });

  test("the 31st tracking request within ten minutes returns a safe 429", async () => {
    const forwardedFor = "203.0.113.31";
    for (let requestNumber = 1; requestNumber <= 30; requestNumber += 1) {
      const { status } = await request(
        "GET",
        "/orders/track/rate-limit-test-token",
        undefined,
        forwardedFor,
      );
      assert.notStrictEqual(
        status,
        429,
        `request ${requestNumber} must remain below the limit`,
      );
    }

    const { status, data } = await request(
      "GET",
      "/orders/track/rate-limit-test-token",
      undefined,
      forwardedFor,
    );
    assert.strictEqual(status, 429);
    assertSafeRateLimitResponse(data);
  });
});
