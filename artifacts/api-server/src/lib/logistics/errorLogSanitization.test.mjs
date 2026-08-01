import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeError } from "../sanitizeError.ts";

const SOURCE_FILES = [
  "../../routes/logisticsSync.ts",
  "../../routes/internalLogisticsSync.ts",
  "../../routes/orders.ts",
];

const DRIZZLE_LIKE_ERROR = {
  name: "DrizzleQueryError",
  message:
    "Failed query: select * from orders where phone = $1\nparams: 0912345678\nat /home/runner/app.ts:10",
  code: "23505",
  query: "select * from orders",
  params: ["0912345678"],
  stack: "Error at /home/runner/app.ts:10",
};

async function readSource(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return readFile(url, "utf8");
}

function captureConsoleError(callback) {
  const previous = console.error;
  const calls = [];
  console.error = (...args) =>
    calls.push(
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
  try {
    callback();
  } finally {
    console.error = previous;
  }
  return calls.join("\n");
}

for (const sourceFile of SOURCE_FILES) {
  test(`${sourceFile} sanitizes caught errors before console.error`, async () => {
    const source = await readSource(sourceFile);
    assert.match(source, /sanitizeError/);
    assert.doesNotMatch(
      source,
      /console\.error\([\s\S]{0,240}?[,\s]err\s*[,)][\s\S]{0,40}?\)/,
    );

    const output = captureConsoleError(() => {
      console.error(
        "simulated caught error:",
        sanitizeError(DRIZZLE_LIKE_ERROR),
      );
    });
    assert.doesNotMatch(
      output,
      /select \* from orders|0912345678|params|home\/runner|app\.ts/i,
    );
    assert.match(output, /query: \[redacted\]/);
  });
}
