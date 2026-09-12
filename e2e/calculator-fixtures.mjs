import { test as base, expect } from "@playwright/test";

// Trace evidence: creating an empty Chromium page took 33.46s on this host.
// Keep that environment setup separate from the unchanged 60s test / 5s expect.
// https://playwright.dev/docs/test-timeouts#fixture-timeout
export const test = base.extend({
  page: [
    async ({ context }, use) => {
      const page = await context.newPage();
      await use(page);
      // The standard context fixture retains tracing/screenshots and closes pages.
    },
    { timeout: 120000 },
  ],
});
export { expect };
