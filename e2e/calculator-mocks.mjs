import { installClerkStub } from "./clerkStub.mjs";

export const fakeStore = {
  id: 1,
  merchantId: "user_e2e_merchant",
  name: "計算機驗收用模擬店鋪",
  slug: "calculator-mock",
  createdAt: "2026-09-11T00:00:00.000Z",
  purchaseExchangeRate: "0.777",
  brandPrimaryColor: "#8B5CF6",
};
export function readMock(path) {
  if (path === "/api/me/store") return fakeStore;
  if (/\/stats$/.test(path))
    return {
      totalOrders: 0,
      totalRevenue: 0,
      totalProfit: 0,
      pendingOrders: 0,
      totalProducts: 0,
      statusBreakdown: [],
      recentOrders: [],
    };
  if (/profit-summary/.test(path))
    return {
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      missingSnapshotOrderCount: 0,
    };
  if (/logistics\/exceptions/.test(path))
    return { items: [], total: 0, page: 1, pageSize: 50 };
  if (/low-stock/.test(path)) return [];
  return [];
}
export async function mockCalculator(
  page,
  {
    signedIn = true,
    firstStore = false,
    storeStatus = 200,
    createFailure = false,
    createStatuses = [],
  } = {},
) {
  await installClerkStub(page, { signedIn });
  const writes = [];
  const errors = [];
  let created = !firstStore;
  let createAttempt = 0;
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
      });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.includes("clerk.browser.js")) return route.fallback();
    if (request.method() === "GET") {
      if (path === "/api/me/store" && storeStatus !== 200)
        return route.fulfill({
          status: storeStatus,
          json: { error: "Mock store error" },
        });
      if (path === "/api/me/store" && !created)
        return route.fulfill({
          status: 404,
          json: { error: "mock store absent" },
        });
      return route.fulfill({ json: readMock(path) });
    }
    if (firstStore && path === "/api/stores" && request.method() === "POST") {
      const status =
        createStatuses[createAttempt++] ?? (createFailure ? 500 : 201);
      if (status !== 201)
        return route.fulfill({
          status,
          json: { error: "Mock initialization failure" },
        });
      created = true;
      return route.fulfill({ status: 201, json: fakeStore });
    }
    return route.fulfill({
      status: 405,
      json: {
        error:
          "Unexpected business-write intent recorded and blocked by calculator test",
      },
    });
  });
  // All nonlocal requests are blocked. Auth and business API responses are mocks.
  await page.route(
    (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
    (route) => route.abort(),
  );
  return { writes, errors };
}
