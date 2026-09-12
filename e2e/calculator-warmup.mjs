import { chromium } from "@playwright/test";
const target = process.env.CALCULATOR_URL || "http://127.0.0.1:4317/calculator";
if (!["127.0.0.1", "localhost"].includes(new URL(target).hostname))
  throw new Error("Warmup is local-only");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const evidence = { errors: [], writes: [] };
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      evidence.writes.push(request.url());
  });
  await page.route("https://**", (route) => route.abort());
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByRole("heading", { name: "價格計算機", exact: true })
    .waitFor({ timeout: 180000 });
  if (evidence.errors.length || evidence.writes.length)
    throw new Error(JSON.stringify(evidence));
  console.log(
    "READY: original calculator route loaded from local mock server without browser auth/API replacement; zero write intents",
    target,
  );
} finally {
  await browser.close();
}
