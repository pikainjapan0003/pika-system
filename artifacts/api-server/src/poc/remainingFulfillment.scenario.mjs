import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { inspectMaihuobianXlsm, MAIHUOBIAN_OFFICIAL_VBA_SHA256 } from "../lib/maihuobianXlsm.ts";

// Synthetic spreadsheet imports and normal business endpoints only. Tracking
// identifiers deliberately contain POC text and must never be sent to carriers.
export async function fulfillmentScenario(request, storeId, productId) {
  const tag = `RM-L-${Date.now()}`;
  const base = `/stores/${storeId}`;
  const call = async (method, path, body, status = 200, headers = {}) => {
    const r = await request(method, path, { body, headers });
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    return r;
  };
  const proof = { tag, storeId, productId, providers: [] };
  const product = (await call("GET", `${base}/products/${productId}`)).body;
  for (const [provider, cvsProvider, code, pickup] of [
    ["711", "seven", "901001", "7-11 賣貨便"], ["familymart", "family", "901002", "全家取貨（先付款）"],
  ]) {
    const regions = (await call("GET", `/cvs/regions?provider=${cvsProvider}`)).body;
    assert.ok(regions.cities.some(c => c.city === "合成市"));
    const stores = (await call("GET", `/cvs/stores?provider=${cvsProvider}&q=${code}`)).body.stores;
    const selected = stores.find(s => s.storeId === code);
    assert.ok(selected && selected.storeName.includes("合成"));
    const guestResult = await request("POST", `/p/${product.shareToken}/orders`, { owner: false, body: {
      buyerName: `合成${provider}選店${tag}`, buyerPhone: "0900000000", quantity: 1, pickupMethod: pickup,
      cvsStoreId: code, cvsStoreName: selected.storeName, cvsStoreAddress: selected.storeAddress,
      storeSelectedBy: "admin", unitPrice: 1, totalPrice: 1,
    } });
    assert.equal(guestResult.status, 201);
    assert.equal(guestResult.body.cvsStoreId, code);
    assert.equal(guestResult.body.orderTotal, provider === "711" ? 158 : 180);
    const guestSaved = (await call("GET", `${base}/orders`)).body.find(o => o.publicToken === guestResult.body.publicToken);
    assert.equal(guestSaved.cvsStoreId, code); assert.equal(guestSaved.storeSelectedBy, "customer");
    const last5 = await request("PATCH", `/orders/track/${guestResult.body.publicToken}/payment-last5`, { owner: false, body: { paymentLast5: "54321" } });
    assert.equal(last5.status, 200);
    const buyerName = provider === "711" ? "合成七甲" : "合成全乙";
    const order = (await call("POST", `${base}/orders`, {
      productId, buyerName, buyerPhone: "0900000000", recipientName: buyerName,
      recipientPhone: "0900000000", quantity: 2, pickupMethod: pickup,
      shippingMethod: "convenience_store", storeCode: code, storeName: `${selected.storeName}-${tag}`,
      cvsStoreAddress: selected.storeAddress, storeSelectedBy: "admin", notes: tag,
    }, 201)).body;
    await call("PATCH", `/orders/${order.id}/status`, { status: "preparing" });
    assert.equal(order.cvsStoreId, code);
    const trackingCode = `POC-${provider}-${tag}`;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("合成物流測試");
    sheet.addRow(provider === "711"
      ? ["收件人姓名", "配送單編號", "取件地址", "訂單編號", "商品名稱", "狀態"]
      : ["收件人姓名", "寄件編號", "取件店名", "訂單編號", "取件人手機", "寄件日期"]);
    sheet.addRow([buyerName, trackingCode, order.cvsStoreName, `POC-ORDER-${order.id}`,
      provider === "711" ? "合成商品" : "0900000000", provider === "711" ? "合成測試狀態" : "2026/09/27"]);
    sheet.addRow(["無配對合成客", `POC-NONE-${tag}`, "不存在合成店", "POC-MISSING",
      provider === "711" ? "合成商品" : "0900000099", ""]);
    const file = await workbook.xlsx.writeBuffer();
    const upload = async (bytes = file) => {
      const form = new FormData(); form.append("provider", provider);
      form.append("file", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${tag}-${provider}.xlsx`);
      return (await call("POST", `${base}/logistics/imports/dry-run`, form)).body;
    };
    const dry = await upload();
    assert.equal(dry.dryRun.matchedRows, 1);
    assert.equal(dry.dryRun.notFoundRows, 1);
    assert.equal(dry.dryRun.rows.find(r => r.matchStatus === "matched").matchedOrderId, order.id);
    const rowList = (await call("GET", `${base}/logistics/import-batches/${dry.batchId}/rows`)).body;
    const rows = rowList.items ?? rowList.rows;
    assert.equal(rows.length, 2);
    // Confirm both rows to exercise valid import and persisted exception handling.
    const confirmed = (await call("POST", `${base}/logistics/imports/${dry.batchId}/confirm`, { rowIds: rows.map(r => r.id) })).body;
    assert.equal(confirmed.importedCount, 1); assert.equal(confirmed.skippedCount, 1);
    await call("POST", `${base}/logistics/imports/${dry.batchId}/confirm`, { confirmAllMatched: true }, 409);
    const again = await upload();
    assert.equal(again.dryRun.matchedRows, 1);
    await call("POST", `${base}/logistics/imports/${again.batchId}/confirm`, { confirmAllMatched: true });
    const saved = (await call("GET", `${base}/orders`)).body.find(o => o.id === order.id);
    assert.equal(saved.trackingCode, trackingCode); assert.equal(saved.trackingProvider, provider);
    assert.ok(saved.shipmentTracking?.id);
    const customer = (await call("GET", `/orders/track/${order.publicToken}`)).body;
    assert.equal(customer.trackingCode, trackingCode);
    assert.notEqual(customer.latestTrackingStatus, "delivered");
    for (const key of ["checkError", "rawData", "internalNote", "buyerPhone", "buyerName"]) assert.equal(key in customer, false);
    const history = (await call("GET", `${base}/logistics/import-batches`)).body.items;
    assert.ok(history.some(b => b.id === dry.batchId && b.status === "confirmed"));
    const conflictBook = new ExcelJS.Workbook();
    const conflictSheet = conflictBook.addWorksheet("合成重複單號");
    conflictSheet.addRow(sheet.getRow(1).values.slice(1));
    conflictSheet.addRow([`合成${provider}選店${tag}`, trackingCode, selected.storeName, `POC-ORDER-${guestSaved.id}`,
      provider === "711" ? "合成商品" : "0900000000", ""]);
    const conflictDry = await upload(await conflictBook.xlsx.writeBuffer());
    assert.equal(conflictDry.dryRun.matchedRows, 1);
    const conflict = (await call("POST", `${base}/logistics/imports/${conflictDry.batchId}/confirm`, { confirmAllMatched: true })).body;
    assert.equal(conflict.importedCount, 0);
    assert.ok(conflict.rows.some(r => r.errorCode === "TRACKING_CODE_CONFLICT"));
    assert.equal((await call("GET", `${base}/orders`)).body.find(o => o.id === guestSaved.id).trackingCode, null);
    proof.providers.push({ provider, orderId: order.id, trackingId: saved.shipmentTracking.id,
      guestOrderId: guestSaved.id, guestOrderTotal: guestResult.body.orderTotal,
      batchId: dry.batchId, repeatBatchId: again.batchId, conflictBatchId: conflictDry.batchId, storeCode: code, trackingCode });
    if (provider === "711") {
      const blocked = await call("POST", `${base}/logistics/sync/manual-provider/preview`,
        { provider, trackingIds: [saved.shipmentTracking.id] }, 422);
      assert.equal(blocked.body.errorCode, "LOGISTICS_TEST_SOURCE_REQUIRED");
    }
  }
  const exceptions = (await call("GET", `${base}/logistics/exceptions`)).body;
  assert.ok((exceptions.items ?? exceptions.exceptions).some(e => e.errorCode === "ROW_NOT_IMPORTABLE"));
  const eligibleId = proof.providers[0].orderId;
  const preview = (await call("GET", `${base}/orders/maihuobian-export`)).body;
  assert.ok(preview.eligible.some(o => o.orderId === eligibleId));
  assert.ok(preview.ineligible.some(o => o.orderId === proof.providers[1].orderId));
  const headers = { "x-confirm-cleartext-export": "true", "x-confirm-maihuobian-export": "true" };
  const csv = await call("POST", `${base}/orders/maihuobian-export?format=csv`, { orderIds: [eligibleId] }, 200, headers);
  assert.match(csv.text, /901001/); assert.match(csv.text, /240/);
  const xlsm = await call("POST", `${base}/orders/maihuobian-export?format=xlsm`, { orderIds: [eligibleId] }, 200, headers);
  const inspection = await inspectMaihuobianXlsm(xlsm.bytes);
  assert.equal(inspection.hasMacroEnabledContentType, true);
  assert.equal(inspection.vbaSha256, MAIHUOBIAN_OFFICIAL_VBA_SHA256);
  const zip = await JSZip.loadAsync(xlsm.bytes);
  const xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(xml, /901001/); assert.match(xml, /240\.00/);
  proof.xlsm = { bytes: xlsm.bytes.length, template: inspection.templateVersion, vbaSha256: inspection.vbaSha256 };
  for (const path of [`${base}/orders/export`, "/orders/picking-list.csv", "/orders/shipping-list.csv"]) {
    const r = await call(path.endsWith("/export") ? "GET" : "POST", path,
      path.endsWith("/export") ? undefined : { orderIds: [eligibleId] });
    assert.match(r.headers["content-type"], /text\/csv/); assert.ok(r.bytes.length > 20);
  }
  return proof;
}
