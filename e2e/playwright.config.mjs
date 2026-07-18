import { defineConfig } from "@playwright/test";

const ciOnlyWebServers = process.env.CI
  ? [
      {
        command:
          "PORT=8080 CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jb20k CLERK_SECRET_KEY=sk_test_Y2ktZHVtbXktbm90LXJlYWw= pnpm --filter @workspace/api-server exec node --import tsx/esm src/index.ts",
        url: "http://127.0.0.1:8080/api/p/ci-smoke-product",
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      },
      {
        command:
          "PORT=4173 API_SERVER_PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jb20k pnpm --filter @workspace/shop-app run dev",
        url: "http://127.0.0.1:4173/p/ci-smoke-product",
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      },
    ]
  : undefined;

export default defineConfig({
  testDir: ".",
  testMatch: ["smoke.spec.mjs", "customer-navigation.spec.mjs"],
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: ciOnlyWebServers,
});
