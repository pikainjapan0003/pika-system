import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Read-only checks against the existing isolated service. No OCR, carrier or writes.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input); input = "";
assert.ok(config.clerkKey?.startsWith("sk_test_"));
assert.ok(config.ownerId?.startsWith("user_"));
assert.ok(["baseline", "private", "public"].includes(config.mode));
const origin = "https://pika-system-private-poc-20260925.bill831206.chatgpt.site";
const clerkHeaders = { authorization: `Bearer ${config.clerkKey}`, "content-type": "application/json" };
const sessions = await fetch("https://api.clerk.com/v1/sessions?user_id=" + encodeURIComponent(config.ownerId) + "&limit=10", { headers: clerkHeaders });
assert.equal(sessions.status, 200);
const session = (await sessions.json()).find(s => s.status === "active");
assert.ok(session, "Existing owner test session required");
let jwt, jwtAt = 0;
async function request(path, { owner = true, method = "GET", body } = {}) {
  if (owner && Date.now() - jwtAt > 30000) {
    const token = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, { method: "POST", headers: clerkHeaders, body: "{}" });
    assert.equal(token.status, 200); jwt = (await token.json()).jwt; jwtAt = Date.now();
  }
  const response = await fetch(origin + path, { method, redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { accept: path.startsWith("/api/") ? "application/json" : "text/html",
      ...(config.mode !== "public" ? { "OAI-Sites-Authorization": `Bearer ${config.siteToken}` } : {}),
      ...(owner ? { authorization: `Bearer ${jwt}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes,
    body: response.headers.get("content-type")?.includes("json") ? JSON.parse(bytes.toString("utf8")) : null };
}
const must = result => { assert.equal(result.status, 200); return result.body; };
const store = must(await request("/api/me/store"));
assert.equal(store.id, 1); assert.equal(store.merchantId, config.ownerId);
const products = must(await request("/api/stores/1/products"));
const orders = must(await request("/api/stores/1/orders"));
const original = orders.find(o => o.id === 1);
assert.equal(Number(original.totalPrice), 200);
const image = products.find(p => p.imageUrl?.includes("/api/poc/images/"));
assert.ok(image);
const imagePath = new URL(image.imageUrl, origin).pathname;
const picture = await request(imagePath);
assert.equal(picture.status, 200); assert.ok(picture.bytes.length > 0);
const readPaths = ["/api/stores/1/customers", "/api/stores/1/orders/profit-summary",
  "/api/stores/1/invoice-ocr/test-cases/1", "/api/stores/1/logistics/exceptions",
  "/api/stores/1/logistics/import-batches", "/api/stores/1/logistics/sync/status", "/api/stores/1/audit-logs"];
for (const path of readPaths) must(await request(path));
const tracked = orders.filter(o => o.shipmentTracking);
const states = [];
for (const order of tracked) {
  const result = must(await request(`/api/orders/track/${order.publicToken}`));
  // Existing public DTO maps failed queries to "needs store confirmation".
  assert.equal(result.latestTrackingStatus, order.shipmentTracking.trackingStatus === "failed"
    ? "exception" : order.shipmentTracking.latestEventStatus);
  assert.equal("internalNote" in result, false); assert.equal("checkError" in result, false);
  states.push({ orderId: order.id, trackingId: order.shipmentTracking.id, status: result.latestTrackingStatus });
}
const snapshot = { products: products.length, orders: orders.length, originalTotal: 200,
  image: { productId: image.id, bytes: picture.bytes.length, sha256: createHash("sha256").update(picture.bytes).digest("hex") }, states };
if (config.baseline) assert.deepEqual(snapshot, config.baseline, "Existing synthetic business data must remain unchanged");
if (config.mode !== "baseline") {
  for (const path of ["/api/poc/catalog", `/api/p/${image.shareToken}`, `/api/orders/track/${original.publicToken}`, imagePath]) {
    assert.equal((await request(path, { owner: false })).status, 404);
  }
  assert.equal((await request("/api/cart/orders", { owner: false, method: "POST", body: {} })).status, 404);
  for (const path of ["/api/me/store", "/api/stores/1/products", "/api/stores/1/orders", "/api/stores/1/invoice-ocr/test-cases/1"]) {
    assert.equal((await request(path, { owner: false })).status, 401);
  }
  for (const path of ["/api/stores/1/agent/settings", "/api/internal/agent/orders/tracking-jobs"]) {
    assert.equal((await request(path)).status, 403, "Retired route remains blocked by the deployment allowlist; local router tests prove removal");
  }
  for (const path of ["/sign-up", "/setup", "/settings/agent"]) assert.equal((await request(path, { owner: false })).status, 404);
  for (const path of ["/", "/shop", "/cart", "/track"]) {
    const result = await request(path, { owner: false });
    assert.equal(result.status, 200);
    assert.match(result.bytes.toString(), /PIKA JP Selects/);
  }
}
console.log(JSON.stringify({ mode: config.mode, snapshot, ownerReads: readPaths.length + 4,
  anonymousBoundaries: config.mode === "baseline" ? "not_checked" : "passed", externalOcrOrCarrierCalls: 0 }));
