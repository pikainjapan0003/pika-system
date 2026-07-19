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
await page.setViewportSize({ width: 1280, height: 900 });

console.log("Loading shop-app...");
await page.goto("http://localhost:22696/", {
  waitUntil: "networkidle",
  timeout: 15000,
});
await page.screenshot({
  path: join(__dirname, "app-home.png"),
  fullPage: false,
});
console.log("Saved: app-home.png");

// Try orders page
await page.goto("http://localhost:22696/orders", {
  waitUntil: "networkidle",
  timeout: 15000,
});
await page.screenshot({
  path: join(__dirname, "app-orders.png"),
  fullPage: false,
});
console.log("Saved: app-orders.png");

await browser.close();
console.log("Done.");
