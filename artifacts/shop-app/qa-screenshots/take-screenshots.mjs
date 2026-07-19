import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Use cached playwright from npx cache
let pw;
try {
  pw = require("/home/runner/.npm/_npx/705bc6b22212b352/node_modules/playwright");
} catch {
  pw = require("/home/runner/.npm/_npx/fd3bca3c548369c0/node_modules/playwright");
}

const { chromium } = pw;

const chromiumExec =
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  "/nix/store/kcvsxrmgwp3ffz5jijyy7wn9fcsjl4hz-playwright-browsers-1.55.0-with-cjk/chromium-1187/chrome-linux/chrome";

console.log("Using Chromium:", chromiumExec);

const browser = await chromium.launch({
  executablePath: chromiumExec,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--headless=new",
  ],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 900, height: 1200 });

const testHtmlPath = `file://${join(__dirname, "receipt-test.html")}`;
console.log("Loading:", testHtmlPath);
await page.goto(testHtmlPath, { waitUntil: "load" });

// Full page screenshot
await page.screenshot({
  path: join(__dirname, "receipt-full-page.png"),
  fullPage: true,
});
console.log("Saved: receipt-full-page.png");

// Section 1: 有折讓訂單
const section1 = await page.locator(".test-section").first();
await section1.screenshot({
  path: join(__dirname, "receipt-discount-order.png"),
});
console.log("Saved: receipt-discount-order.png");

// Section 2: 無折讓訂單
const section2 = await page.locator(".test-section").nth(1);
await section2.screenshot({
  path: join(__dirname, "receipt-no-discount-order.png"),
});
console.log("Saved: receipt-no-discount-order.png");

await browser.close();
console.log("Done.");
