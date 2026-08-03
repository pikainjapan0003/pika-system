import { defineConfig } from "@playwright/test";

const ciOnlyWebServer = process.env.CI
  ? {
      command:
        "PORT=4173 API_SERVER_PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jb20k pnpm --filter @workspace/shop-app run dev",
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    }
  : undefined;

export default defineConfig({
  testDir: "./suite",
  testMatch: ["*.spec.mjs"],
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: ciOnlyWebServer,
});
