/**
 * Step 8L-2-MANUAL-VQA-USER
 * Launch non-headless browser on DISPLAY=:1 (VNC port 5901).
 * Navigates to the app → Clerk login appears.
 * Waits up to 3 minutes for the user to complete Clerk login.
 * Then auto-navigates to Orders and takes screenshots.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let pw;
try {
  pw = require("/home/runner/.npm/_npx/705bc6b22212b352/node_modules/playwright");
} catch {
  pw = require("/home/runner/.npm/_npx/fd3bca3c548369c0/node_modules/playwright");
}
const { chromium } = pw;

const chromiumExec = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
console.log("Using Chromium:", chromiumExec);
console.log("DISPLAY:", process.env.DISPLAY);

// Launch non-headless so user can see/interact via VNC :1
const browser = await chromium.launch({
  executablePath: chromiumExec,
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--start-maximized",
    "--window-size=1280,900",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

console.log("\n=== Opening app at http://localhost:22696 ===");
console.log(
  "Please complete Clerk login in the browser window (visible via VNC on port 5901).",
);
console.log("Waiting up to 180 seconds for login to complete...\n");

await page.goto("http://localhost:22696/", {
  waitUntil: "networkidle",
  timeout: 15000,
});
await page.screenshot({ path: join(__dirname, "real-app-before-login.png") });
console.log("Screenshot saved: real-app-before-login.png");

// Wait for successful navigation away from landing/sign-in page
// Clerk redirects to /dashboard or /orders after login
try {
  await page.waitForFunction(
    () => {
      const url = window.location.href;
      // After login, Clerk will redirect to a page that's not the landing page
      return (
        url.includes("/dashboard") ||
        url.includes("/orders") ||
        url.includes("/store") ||
        url.includes("/products") ||
        // Clerk sign-in page might show after redirect - wait until we're past it
        document.querySelector('[data-testid="main-content"]') !== null ||
        (document.querySelector("nav") !== null &&
          !url.includes("/sign-in") &&
          !url.includes("/sign-up"))
      );
    },
    { timeout: 180_000, polling: 2000 },
  );
  console.log("Login detected! Current URL:", page.url());
} catch (e) {
  console.log("Login wait timed out. Current URL:", page.url());
  await page.screenshot({
    path: join(__dirname, "real-app-login-timeout.png"),
  });
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: join(__dirname, "real-app-after-login.png") });
console.log("Screenshot saved: real-app-after-login.png");

// Navigate to orders page
console.log("\nNavigating to /orders...");
await page.goto("http://localhost:22696/orders", {
  waitUntil: "networkidle",
  timeout: 15000,
});
await new Promise((r) => setTimeout(r, 2000)); // extra wait for data load
await page.screenshot({
  path: join(__dirname, "real-orders-page.png"),
  fullPage: true,
});
console.log("Screenshot saved: real-orders-page.png");

// Look for order expand buttons
const expandButtons = page.locator("button").filter({ hasText: /展開|▼|⌄|展/ });
const count = await expandButtons.count();
console.log(`Found ${count} potential expand buttons`);

if (count > 0) {
  // Click first order to expand
  await expandButtons.first().click();
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({
    path: join(__dirname, "real-order-expanded.png"),
    fullPage: true,
  });
  console.log("Screenshot saved: real-order-expanded.png");
}

// Broader search for the panel - look for 列印銷貨單 button
const printButton = page
  .locator("button, [role='button']")
  .filter({ hasText: "列印銷貨單" });
const printCount = await printButton.count();
console.log(`Found ${printCount} 列印銷貨單 button(s)`);

await page.screenshot({
  path: join(__dirname, "real-orders-looking-for-print.png"),
  fullPage: true,
});

await browser.close();
console.log("\nDone. Check qa-screenshots/ for results.");
