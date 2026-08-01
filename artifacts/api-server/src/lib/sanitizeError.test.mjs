import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeError } from "./sanitizeError.ts";

test("redacts SQL, params, and stack details from Drizzle-style errors", () => {
  const result = sanitizeError({
    name: "DrizzleQueryError",
    message:
      "Failed query: select * from customers where phone = $1\nparams: 0912345678\nat /home/runner/app.ts:10",
    code: "23505",
    query: "select * from customers",
    params: ["0912345678"],
    stack: "Error at /home/runner/app.ts:10",
  });
  assert.deepEqual(result, {
    name: "DrizzleQueryError",
    message: "query: [redacted]",
    code: "23505",
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /select|0912345678|params|home|app\.ts|at /i,
  );
});

test("redacts connection strings from a message", () => {
  const result = sanitizeError(
    new Error("connect failed postgresql://user:pass@example.test:5432/db"),
  );
  assert.equal(result.message, "connect failed [redacted]");
  assert.doesNotMatch(result.message, /postgresql|user|pass|example\.test/i);
});

test("keeps a safe ordinary Error message", () => {
  assert.deepEqual(sanitizeError(new TypeError("bad input")), {
    name: "TypeError",
    message: "bad input",
  });
});

test("handles a thrown string", () => {
  assert.deepEqual(sanitizeError("something went wrong"), {
    name: "Error",
    message: "something went wrong",
  });
});

test("handles null and undefined without throwing", () => {
  assert.deepEqual(sanitizeError(null), {
    name: "Error",
    message: "Unknown error",
  });
  assert.deepEqual(sanitizeError(undefined), {
    name: "Error",
    message: "Unknown error",
  });
});

test("truncates a long message to 200 characters", () => {
  const result = sanitizeError(new Error("x".repeat(500)));
  assert.equal(result.message.length, 200);
});

test("redacts Windows paths, node_modules, and stack-shaped lines", () => {
  const result = sanitizeError(
    new Error(
      "failed at C:\\workspace\\node_modules\\pg\\index.js\n at foo (C:\\app\\index.ts:1)",
    ),
  );
  assert.match(result.message, /^failed (?:\[redacted\] ?)+$/);
  assert.doesNotMatch(result.message, /C:|node_modules|at foo|index\.js/i);
});
