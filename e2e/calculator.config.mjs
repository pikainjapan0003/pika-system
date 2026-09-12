import base from "./playwright.config.mjs";
import { fileURLToPath } from "node:url";

// CI starts only the calculator's mock app, never the inherited API/DB servers.
export function mockPreviewServer(port, basePath = "/") {
  return {
    command: "node calculator-preview.mjs",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { CALCULATOR_PORT: String(port), CALCULATOR_BASE_PATH: basePath },
    url: `http://127.0.0.1:${port}${basePath}calculator`,
    reuseExistingServer: false,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
  };
}

const port = process.env.CALCULATOR_TEST_PORT ?? "4317";
export default {
  ...base,
  testMatch: "calculator.spec.mjs",
  testIgnore: [],
  workers: 1,
  timeout: 60000,
  webServer:
    process.env.CI || process.env.CALCULATOR_TEST_SERVER
      ? mockPreviewServer(port)
      : undefined,
  outputDir: "../test-results/calculator",
  use: {
    ...base.use,
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`,
    headless: true,
  },
};
