import assert from "node:assert/strict";
import test from "node:test";

const { default: express } = await import("express");
const { PublicSafeError, handlePublicError } = await import("./publicError.ts");

const app = express();
app.get("/unknown-400", () => {
  const error = Object.assign(new Error("select * from customers; params: 1"), {
    status: 400,
  });
  throw error;
});
app.get("/unknown-404", () => {
  throw Object.assign(new Error("/home/runner/private-path"), { status: 404 });
});
app.get("/safe-409", () => {
  throw new PublicSafeError(409, "Order is already confirmed");
});
app.get("/exposed-422", () => {
  throw Object.assign(new Error("Quantity must be positive"), {
    status: 422,
    expose: true,
  });
});
app.get("/unknown-500", () => {
  throw Object.assign(new Error("postgresql://secret@example/db"), {
    status: 500,
  });
});
app.use(handlePublicError);

let server;
let baseUrl;
test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

test("unknown 400 errors use a fixed public-safe message", async () => {
  assert.deepEqual(await get("/unknown-400"), {
    status: 400,
    body: { error: "Bad request" },
  });
});

test("unknown 404 errors do not echo server paths", async () => {
  assert.deepEqual(await get("/unknown-404"), {
    status: 404,
    body: { error: "Not found" },
  });
});

test("PublicSafeError may expose an intentional 4xx message", async () => {
  assert.deepEqual(await get("/safe-409"), {
    status: 409,
    body: { error: "Order is already confirmed" },
  });
});

test("an explicit expose flag may expose an intentional 4xx message", async () => {
  assert.deepEqual(await get("/exposed-422"), {
    status: 422,
    body: { error: "Quantity must be positive" },
  });
});

test("5xx errors always use the generic message", async () => {
  assert.deepEqual(await get("/unknown-500"), {
    status: 500,
    body: { error: "Internal server error" },
  });
});
