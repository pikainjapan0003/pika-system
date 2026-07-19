import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

mock.module("fs/promises", {
  namedExports: {
    readFile: async () =>
      JSON.stringify({ finalStatus: "fake", summary: "synthetic handoff" }),
    writeFile: async () => undefined,
  },
});

const { default: express } = await import("express");
const { default: devHandoffRouter } = await import("./devHandoff.ts");

const originalNodeEnv = process.env.NODE_ENV;
const app = express();
app.use(express.json());
app.use("/api", devHandoffRouter);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("production rejects every dev handoff data route", async () => {
  process.env.NODE_ENV = "production";
  const requests = [
    fetch(`${baseUrl}/dev/handoff/data`),
    fetch(`${baseUrl}/dev/handoff/data/a`),
    fetch(`${baseUrl}/dev/handoff/data/b`),
    fetch(`${baseUrl}/dev/handoff/data`, { method: "DELETE" }),
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  }
});

test("non-production can read synthetic handoff data", async () => {
  process.env.NODE_ENV = "test";
  const response = await fetch(`${baseUrl}/dev/handoff/data`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    finalStatus: "fake",
    summary: "synthetic handoff",
  });
});
