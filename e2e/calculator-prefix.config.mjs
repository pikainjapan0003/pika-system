import base, { mockPreviewServer } from "./calculator.config.mjs";
const port = process.env.CALCULATOR_TEST_PORT ?? "4318";
export default {
  ...base,
  testMatch: "calculator-prefix.spec.mjs",
  outputDir: "../test-results/calculator-prefix",
  webServer:
    process.env.CI || process.env.CALCULATOR_TEST_SERVER
      ? mockPreviewServer(port, "/pika/")
      : undefined,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
};
