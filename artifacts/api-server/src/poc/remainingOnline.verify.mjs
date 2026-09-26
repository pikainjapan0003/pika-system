import assert from "node:assert/strict";
import { commerceScenario } from "./remainingCommerce.scenario.mjs";
import { fulfillmentScenario } from "./remainingFulfillment.scenario.mjs";

// Invoked explicitly by the task runner. Credentials arrive only on stdin,
// never in command arguments, source files, receipts, or provider requests.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
input = "";
assert.ok(config.clerkKey?.startsWith("sk_test_"));
assert.ok(config.ownerId?.startsWith("user_"));
assert.equal(typeof config.siteToken, "string");
const origin = "https://pika-system-private-poc-20260925.bill831206.chatgpt.site";
const clerkHeaders = { authorization: `Bearer ${config.clerkKey}`, "content-type": "application/json" };
const sessions = await fetch("https://api.clerk.com/v1/sessions?user_id=" + encodeURIComponent(config.ownerId) + "&limit=10", { headers: clerkHeaders });
assert.equal(sessions.status, 200);
const session = (await sessions.json()).find(s => s.status === "active");
assert.ok(session, "An existing active test-owner Clerk session is required");
let jwt, jwtAt = 0;
async function request(method, path, { body, owner = true, headers = {} } = {}) {
  if (owner && Date.now() - jwtAt > 30000) {
    const token = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
      method: "POST", headers: clerkHeaders, body: "{}",
    });
    assert.equal(token.status, 200); jwt = (await token.json()).jwt; jwtAt = Date.now();
  }
  const form = body instanceof FormData;
  const r = await fetch(origin + "/api" + path, { method, redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "OAI-Sites-Authorization": `Bearer ${config.siteToken}`,
      ...(form ? {} : { "content-type": "application/json" }), ...(owner ? { authorization: `Bearer ${jwt}` } : {}), ...headers },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  const bytes = Buffer.from(await r.arrayBuffer()); const text = bytes.toString("utf8");
  return { status: r.status, bytes, text, headers: Object.fromEntries(r.headers),
    body: r.status === 204 ? null : r.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
}
const must = r => { assert.equal(r.status, 200); return r.body; };
const store = must(await request("GET", "/me/store"));
assert.equal(store.id, 1); assert.equal(store.merchantId, config.ownerId);
let commerce = config.proof?.commerce, fulfillment = config.proof?.fulfillment;
if (config.mode === "run") {
  commerce = await commerceScenario(request, store.id);
  console.log(JSON.stringify({ action: "remaining_commerce", commerce }));
  fulfillment = await fulfillmentScenario(request, store.id, commerce.productId);
  console.log(JSON.stringify({ action: "remaining_fulfillment", fulfillment }));
  const rates = must(await request("GET", "/exchange-rate-reference/jpy/compare"));
  assert.equal(rates.currency, "JPY");
  for (const result of rates.sources) {
    assert.ok(["available", "unavailable"].includes(result.status));
    if (result.status === "available") assert.ok(Number(result.quote.rate) > 0);
    else assert.equal(result.quote, undefined);
  }
  const quote = rates.sources.find(s => s.status === "available")?.quote;
  const priorRate = store.purchaseExchangeRate;
  const originalOrder = must(await request("GET", "/stores/1/orders")).find(o => o.id === 1);
  try {
    if (quote) assert.equal((await request("POST", "/stores/1/audit-events", {
      body: { action: "apply_exchange_rate_reference", target: `store:${quote.sourceId}` },
    })).status, 204);
    const selectedRate = quote ? Number(quote.rate) : 0.2;
    must(await request("PATCH", "/stores/1", { body: { purchaseExchangeRate: selectedRate } }));
    assert.equal(must(await request("GET", "/me/store")).purchaseExchangeRate, selectedRate);
    assert.deepEqual(must(await request("GET", "/stores/1/orders")).find(o => o.id === 1).profit, originalOrder.profit);
  } finally {
    must(await request("PATCH", "/stores/1", { body: { purchaseExchangeRate: priorRate } }));
    assert.equal(must(await request("GET", "/me/store")).purchaseExchangeRate, priorRate);
  }
  console.log(JSON.stringify({ action: "remaining_reference_verified", sources: rates.sources,
    application: quote ? "existing_manual_reference_apply" : "manual_input_only", restoredRate: priorRate,
    historicalProfitUnchanged: true }));
} else { assert.equal(config.mode, "verify"); assert.ok(commerce && fulfillment); }
const orders = must(await request("GET", "/stores/1/orders"));
assert.equal(Number(orders.find(o => o.id === 1).totalPrice), 200, "original successful order remains");
for (const tier of commerce.tierResults) {
  const saved = orders.find(o => o.id === tier.orderId);
  assert.equal(Number(saved.unitPrice), tier.unitPrice); assert.equal(Number(saved.totalPrice), tier.total);
}
assert.equal(Number(must(await request("GET", `/stores/1/customers/${commerce.creditCustomerId}/store-credit`)).balance), 70);
assert.equal(orders.find(o => o.id === commerce.creditOrderId).status, "cancelled");
for (const item of fulfillment.providers) {
  const order = orders.find(o => o.id === item.orderId);
  assert.equal(order.trackingCode, item.trackingCode); assert.equal(order.shipmentTracking.id, item.trackingId);
  const guest = orders.find(o => o.id === item.guestOrderId);
  assert.equal(guest.cvsStoreId, item.storeCode); assert.equal(guest.storeSelectedBy, "customer");
  const track = must(await request("GET", `/orders/track/${order.publicToken}`, { owner: false }));
  assert.equal(track.trackingCode, item.trackingCode);
  assert.notEqual(track.latestTrackingStatus, "delivered");
  if (config.mode === "verify") assert.equal(track.latestTrackingStatus, item.provider === "711" ? "arrived_store" : "exception");
  assert.equal("internalNote" in track, false); assert.equal("checkError" in track, false);
}
const detail = must(await request("GET", `/stores/1/customers/${commerce.creditCustomerId}`));
assert.ok(detail.orders.some(o => o.id === commerce.paidOrderId && o.profit));
const audit = must(await request("GET", "/stores/1/audit-logs"));
assert.ok(audit.some(l => l.action === "export_maihuobian_cleartext"));
assert.ok(must(await request("GET", "/stores/1/stats")));
for (const path of ["/stores/1/categories", "/stores/1/orders", "/stores/1/audit-logs", "/stores/1/logistics/import-batches"]) {
  assert.equal((await request("GET", path, { owner: false })).status, 401);
}
assert.equal((await request("POST", "/stores/2/orders", { body: {} })).status, 403);
for (const path of ["/stores", "/cvs/711/import-from-emap", "/stores/1/logistics/sync",
  "/stores/1/logistics/sync/manual-provider/commit", "/stores/1/skills/S-09/enable"]) {
  assert.equal((await request("POST", path, { body: {} })).status, 403);
}
// No OCR POST, no carrier request, and no background synchronization.
console.log(JSON.stringify({ action: "remaining_online_readback", mode: config.mode,
  storeId: 1, originalOrderId: 1, originalOrderTotal: 200, creditBalance: 70,
  commerceOrderIds: commerce.tierResults.map(t => t.orderId), trackingIds: fulfillment.providers.map(p => p.trackingId),
  auditVerified: true, privateOwnerChecks: true, ocrCalls: 0, carrierCalls: 0 }));
