import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";

import {
  OWNER_STORE_MUTATION_RATE_LIMIT,
  ownerStoreMutationLimiter,
} from "./ownerStoreRateLimit.ts";

const app = express();
app.post(
  "/stores/:storeId/sensitive-action",
  ownerStoreMutationLimiter,
  (_req, res) => res.json({ ok: true }),
);

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
});

async function post(storeId) {
  const response = await fetch(
    `${baseUrl}/stores/${storeId}/sensitive-action`,
    { method: "POST" },
  );
  return { status: response.status, body: await response.json() };
}

test("the 61st sensitive action for one store is rate limited", async () => {
  for (let index = 0; index < OWNER_STORE_MUTATION_RATE_LIMIT; index += 1) {
    assert.equal((await post("91001")).status, 200);
  }
  assert.equal((await post("91001")).status, 429);
});

test("one store cannot consume another store's allowance", async () => {
  for (let index = 0; index < OWNER_STORE_MUTATION_RATE_LIMIT; index += 1) {
    assert.equal((await post("91002")).status, 200);
  }
  assert.equal((await post("91002")).status, 429);
  assert.equal((await post("91003")).status, 200);
});

test("a 429 response contains only the public error field", async () => {
  for (let index = 0; index < OWNER_STORE_MUTATION_RATE_LIMIT; index += 1) {
    assert.equal((await post("91004")).status, 200);
  }
  const response = await post("91004");
  assert.equal(response.status, 429);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(
    response.body.error,
    "Too many requests, please try again later.",
  );
});
