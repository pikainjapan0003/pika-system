import { defineConfig } from "@playwright/test";

const ciOnlyWebServers = process.env.CI
  ? [
      {
        command:
          "PORT=8080 CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jb20k pnpm --filter @workspace/api-server exec node --import tsx/esm src/index.ts",
        url: "http://127.0.0.1:8080/api/p/ci-smoke-product",
        reuseExistingServer: false,
        timeout: 120_000,
      },
      {
        command:
          "PORT=4173 API_SERVER_PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jb20k pnpm --filter @workspace/shop-app run dev",
        url: "http://127.0.0.1:4173/p/ci-smoke-product",
        reuseExistingServer: false,
        timeout: 120_000,
      },
    ]
  : undefined;

export default defineConfig({
  testDir: ".",
  testMatch: "smoke.spec.mjs",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: ciOnlyWebServers,
});
