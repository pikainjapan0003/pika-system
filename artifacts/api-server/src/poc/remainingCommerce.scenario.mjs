import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// The same normal HTTP operations run locally and against the private Site.
// No provider calls, real customers, or direct database writes are used here.
export async function commerceScenario(request, storeId, record = () => {}) {
  const tag = `RM-${Date.now()}`;
  const base = `/stores/${storeId}`;
  const call = async (method, path, body, status = 200, headers = {}) => {
    const r = await request(method, path, { body, headers });
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const category = await call("POST", `${base}/categories`, { name: `${tag} 合成分類` }, 201);
  await call("PATCH", `${base}/categories/${category.id}`, { name: `${tag} 測試分類` });
  const product = await call("POST", `${base}/products`, {
    name: `${tag} 四層假商品`, price: 120, vipPrice: "100", wholesalePrice: "80",
    partnerPrice: "60", inventory: 40, categoryId: category.id, storageTempClass: "normal",
    costJpy: 100, isTransportCostExempt: true,
  }, 201);
  assert.equal((await call("GET", `${base}/products/${product.id}`)).categoryId, category.id);
  const tierResults = [];
  for (const [tier, expected] of [["general", 120], ["vip", 100], ["wholesale", 80], ["partner", 60]]) {
    const customer = await call("POST", `${base}/customers`, {
      code: `${tag}-${tier}`, name: `合成${tier}`, tier, phone: "0900000000",
    }, 201);
    const order = await call("POST", `${base}/orders`, {
      productId: product.id, customerId: customer.id, buyerName: `合成${tier}`,
      buyerPhone: "0900000000", pickupMethod: "自取", quantity: 2,
      unitPrice: 1, totalPrice: 1, // untrusted client prices must be ignored
    }, 201);
    assert.equal(Number(order.unitPrice), expected);
    assert.equal(Number(order.totalPrice), expected * 2);
    tierResults.push({ tier, customerId: customer.id, orderId: order.id, unitPrice: expected, total: expected * 2 });
  }
  await call("PATCH", `${base}/products/${product.id}`, { partnerPrice: null });
  const fallback = await call("POST", `${base}/orders`, {
    productId: product.id, customerId: tierResults[3].customerId,
    buyerName: "合成價格回退", buyerPhone: "0900000000", pickupMethod: "自取", quantity: 1,
  }, 201);
  assert.equal(Number(fallback.unitPrice), 120, "unset tier falls back to the existing general price");
  const creditPath = `${base}/customers/${tierResults[0].customerId}/store-credit`;
  const confirmed = { "x-confirm-store-credit": "true" };
  const grant = { type: "grant", amount: "80", reasonCode: "synthetic_migration", idempotencyKey: `${tag}-grant` };
  await call("POST", creditPath, grant, 201, confirmed);
  const repeatedGrant = await call("POST", creditPath, grant, 200, confirmed);
  assert.equal(Number(repeatedGrant.balance), 80);
  const adjusted = await call("POST", creditPath, {
    type: "adjust", amount: "-10", reasonCode: "synthetic_migration", idempotencyKey: `${tag}-adjust`,
  }, 201, confirmed);
  assert.equal(Number(adjusted.balance), 70);
  const creditRequest = {
    productId: product.id, customerId: tierResults[0].customerId,
    buyerName: "合成購物金", buyerPhone: "0900000000", pickupMethod: "自取", quantity: 1,
    creditSpent: "30", clientRequestId: randomUUID(),
  };
  const spent = await call("POST", `${base}/orders`, creditRequest, 201);
  assert.equal(Number(spent.creditSpent), 30);
  assert.equal(Number(spent.payableAfterCredit), 90);
  assert.equal(Number((await call("GET", creditPath)).balance), 40);
  const replay = await call("POST", `${base}/orders`, creditRequest, 200);
  assert.equal(replay.id, spent.id, "retry must return the same order without spending again");
  await call("POST", `${base}/orders`, { ...creditRequest, quantity: 2 }, 409);
  assert.equal(Number((await call("GET", creditPath)).balance), 40);
  await call("PATCH", `/orders/${spent.id}/status`, { status: "cancelled" });
  await call("PATCH", `/orders/${spent.id}/status`, { status: "cancelled" });
  assert.equal(Number((await call("GET", creditPath)).balance), 70);
  const orderId = tierResults[0].orderId;
  const edited = await call("PATCH", `/orders/${orderId}`, {
    notes: `${tag} 測試備註`, internalNote: "SYNTHETIC_INTERNAL_ONLY", paymentLast5: "12345",
    paymentMethod: "bank_transfer", paymentStatus: "partially_paid", paidAmount: 100,
  });
  assert.equal(edited.paymentLast5, "12345");
  assert.equal(Number(edited.paidAmount), 100);
  const paid = await call("PATCH", `/orders/${orderId}`, { paymentStatus: "paid", paidAmount: 240 });
  assert.equal(paid.paymentStatus, "paid");
  const resized = await call("PATCH", `/orders/${orderId}`, { quantity: 3 });
  assert.equal(Number(resized.totalPrice), 360);
  assert.equal(Number(resized.payableAfterCredit), 360, "editing subtotal cannot leave the old payable behind");
  await call("PATCH", `/orders/${orderId}`, { quantity: 2 });
  await call("PATCH", `/orders/${orderId}/status`, { status: "preparing" });
  const picking = await call("POST", "/orders/picking-list", { orderIds: [orderId] });
  const itemKey = picking.orderItems[0].itemKey;
  await call("POST", `/orders/${orderId}/picking-check`, { itemKey, checked: true });
  assert.equal((await call("POST", "/orders/picking-list", { orderIds: [orderId] })).orderItems[0].checked, true);
  assert.ok(await call("POST", "/orders/shipping-list", { orderIds: [orderId] }));
  const logs = await call("GET", `${base}/audit-logs`);
  for (const action of ["store_credit_spend", "store_credit_reversal"]) assert.ok(logs.some(l => l.action === action));
  const detail = await call("GET", `${base}/customers/${tierResults[0].customerId}`);
  assert.ok(detail.orders.some(o => o.id === orderId && o.profit));
  assert.ok(await call("GET", `${base}/stats`));
  await call("DELETE", `${base}/categories/${category.id}`, undefined, 204);
  assert.equal((await call("GET", `${base}/products/${product.id}`)).categoryId, null, "category deletion preserves product");
  const proof = { tag, storeId, productId: product.id, tierResults, fallbackOrderId: fallback.id,
    creditCustomerId: tierResults[0].customerId, creditOrderId: spent.id, creditBalance: 70,
    paidOrderId: orderId, paidAmount: 240, pickingItemKey: itemKey };
  record(proof);
  return proof;
}
