import type { Order, PickingListResponse, ShippingListResponse, ShippingListOrder } from "@workspace/api-client-react";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SHARED_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #111; background: white; padding: 20px; }
h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
.meta { font-size: 11px; color: #555; margin-bottom: 10px; }
.warning { background: #fffbeb; border: 1px solid #fcd34d; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; font-size: 11px; color: #92400e; }
.card { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
.row:last-child { border-bottom: none; }
.row-label { color: #555; white-space: nowrap; flex-shrink: 0; }
.row-value { font-weight: 500; text-align: right; word-break: break-all; }
@media print { @page { size: A4; margin: 15mm; } }
`;

function htmlDoc(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function openPrint(html: string): void {
  // Clean up any leftover iframe from a prior call
  const prev = document.getElementById("__print_frame__");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.setAttribute("aria-hidden", "true");
  // Hidden visually but still renderable; position:fixed keeps it out of layout
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;visibility:hidden;border:none;z-index:-9999;pointer-events:none;";

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { cleanup(); return; }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render, then print from within the iframe
  setTimeout(() => {
    const cw = iframe.contentWindow;
    if (!cw) { cleanup(); return; }
    try {
      cw.focus();
      cw.print();
    } catch {
      // ignore
    }
    // afterprint fires when the print dialog closes; fallback after 5 min
    cw.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(cleanup, 5 * 60_000);
  }, 250);
}

const STORAGE_TEMP_LABELS: Record<string, string> = {
  room_temp: "常溫",
  refrigerated: "冷藏",
  frozen: "冷凍",
};

export function printPickingList(data: PickingListResponse): void {
  const generatedAt = new Date(data.generatedAt).toLocaleString("zh-TW");

  const excludedHtml = data.excludedOrderIds.length > 0
    ? `<div class="warning">已排除 ${data.excludedOrderIds.length} 筆已取消訂單（ID: ${esc(data.excludedOrderIds.join("、"))}）</div>`
    : "";

  const itemsHtml = data.items.map((item) => {
    const tempLabel = item.storageTemp ? (STORAGE_TEMP_LABELS[item.storageTemp] ?? item.storageTemp) : null;
    const rows = [
      item.specLabel ? `<div class="row"><span class="row-label">規格</span><span class="row-value">${esc(item.specLabel)}</span></div>` : "",
      item.skuCode ? `<div class="row"><span class="row-label">SKU</span><span class="row-value">${esc(item.skuCode)}</span></div>` : "",
      tempLabel ? `<div class="row"><span class="row-label">溫層</span><span class="row-value">${esc(tempLabel)}</span></div>` : "",
      item.shelfLife ? `<div class="row"><span class="row-label">保存期限</span><span class="row-value">${esc(item.shelfLife)}</span></div>` : "",
      `<div class="row"><span class="row-label">對應訂單</span><span class="row-value">${esc(item.orderNumbers.join("、"))}</span></div>`,
      item.notes ? `<div class="row"><span class="row-label">備註</span><span class="row-value" style="font-style:italic">${esc(item.notes)}</span></div>` : "",
    ].filter(Boolean).join("");

    return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
    <div>
      <div style="font-weight:600;font-size:13px">${esc(item.productName)}</div>
    </div>
    <div style="font-size:22px;font-weight:bold;white-space:nowrap">×${item.quantityTotal}</div>
  </div>
  ${rows}
</div>`;
  }).join("");

  const body = `<h1>撿貨單</h1>
<div class="meta">產生時間：${esc(generatedAt)}　｜　${data.orderCount} 筆訂單　｜　${data.items.length} 項商品組合</div>
${excludedHtml}
${itemsHtml}`;

  openPrint(htmlDoc("撿貨單", body));
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "未付款",
  pending: "待確認",
  partially_paid: "部分付款",
  paid: "已付款",
  refunded: "已退款",
  failed: "付款失敗",
};
const SHIPPING_STATUS_LABELS: Record<string, string> = {
  not_shipped: "未出貨",
  preparing: "備貨中",
  shipped: "已出貨",
  arrived: "已到貨",
  picked_up: "已取貨",
  returned: "已退回",
  cancelled: "已取消",
};
const SHIPPING_METHOD_LABELS: Record<string, string> = {
  self_pickup: "自取",
  convenience_store: "超商取貨",
  home_delivery: "宅配",
  other: "其他",
};

function shippingOrderHtml(order: ShippingListOrder): string {
  const specText = order.specValues && Object.keys(order.specValues).length > 0
    ? Object.entries(order.specValues).map(([k, v]) => `${k}: ${v}`).join("、")
    : null;

  const rows: string[] = [
    `<div class="row"><span class="row-label">買家</span><span class="row-value">${esc(order.buyerName)}</span></div>`,
    `<div class="row"><span class="row-label">電話</span><span class="row-value">${esc(order.buyerPhone)}</span></div>`,
    order.productName ? `<div class="row"><span class="row-label">商品</span><span class="row-value">${esc(order.productName)}</span></div>` : "",
    specText ? `<div class="row"><span class="row-label">規格</span><span class="row-value">${esc(specText)}</span></div>` : "",
    `<div class="row"><span class="row-label">數量</span><span class="row-value">× ${order.quantity}</span></div>`,
    `<div class="row"><span class="row-label">付款狀態</span><span class="row-value">${esc(PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus)}</span></div>`,
    `<div class="row"><span class="row-label">出貨狀態</span><span class="row-value">${esc(SHIPPING_STATUS_LABELS[order.shippingStatus] ?? order.shippingStatus)}</span></div>`,
    order.shippingMethod ? `<div class="row"><span class="row-label">物流方式</span><span class="row-value">${esc(SHIPPING_METHOD_LABELS[order.shippingMethod] ?? order.shippingMethod)}</span></div>` : "",
    order.trackingCode ? `<div class="row"><span class="row-label">追蹤碼</span><span class="row-value">${esc(order.trackingCode)}</span></div>` : "",
    order.trackingProvider ? `<div class="row"><span class="row-label">物流商</span><span class="row-value">${esc(order.trackingProvider)}</span></div>` : "",
    order.storeCode ? `<div class="row"><span class="row-label">超商店號</span><span class="row-value">${esc(order.storeCode)}</span></div>` : "",
    order.storeName ? `<div class="row"><span class="row-label">超商店名</span><span class="row-value">${esc(order.storeName)}</span></div>` : "",
    order.recipientName ? `<div class="row"><span class="row-label">收件人</span><span class="row-value">${esc(order.recipientName)}</span></div>` : "",
    order.recipientPhone ? `<div class="row"><span class="row-label">收件電話</span><span class="row-value">${esc(order.recipientPhone)}</span></div>` : "",
    order.recipientAddress ? `<div class="row"><span class="row-label">收件地址</span><span class="row-value">${esc(order.recipientAddress)}</span></div>` : "",
    order.shippingNote ? `<div class="row"><span class="row-label">物流備註</span><span class="row-value">${esc(order.shippingNote)}</span></div>` : "",
    `<div class="row"><span class="row-label">商品明細</span><span class="row-value">${esc(order.itemsText)}</span></div>`,
  ].filter(Boolean) as string[];

  return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <span style="font-weight:700;font-size:13px">#${esc(order.orderNumber)}</span>
    <span style="font-size:11px;border:1px solid #d1d5db;padding:1px 6px;border-radius:4px">${esc(order.status)}</span>
  </div>
  ${rows.join("")}
</div>`;
}

export function printShippingList(data: ShippingListResponse): void {
  const generatedAt = new Date(data.generatedAt).toLocaleString("zh-TW");

  const excludedHtml = data.excludedOrderIds.length > 0
    ? `<div class="warning">已排除 ${data.excludedOrderIds.length} 筆已取消訂單（ID: ${esc(data.excludedOrderIds.join("、"))}）</div>`
    : "";

  const ordersHtml = data.orders.map(shippingOrderHtml).join("");

  const body = `<h1>出貨單</h1>
<div class="meta">產生時間：${esc(generatedAt)}　｜　${data.orderCount} 筆訂單</div>
${excludedHtml}
${ordersHtml}`;

  openPrint(htmlDoc("出貨單", body));
}

const ORDER_STATUS_RECEIPT_LABELS: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  preparing: "備貨中",
  shipped: "已出貨",
  arrived: "已到貨",
  completed: "已完成",
  cancelled: "已取消",
};

function formatCurrency(value: number): string {
  return `NT$ ${Number(value).toLocaleString()}`;
}

export function printOrderReceipt(order: Order): void {
  const now = new Date().toLocaleString("zh-TW");

  const productSubtotal = Number(order.totalPrice ?? 0);
  const shippingFee = Number(order.shippingFee ?? 0);
  const discountAmount = Number(order.discountAmount ?? 0);
  const orderTotal = order.orderTotal ?? (productSubtotal + shippingFee);
  const paidAmount = Number(order.paidAmount ?? 0);
  const remainingAmount = order.remainingAmount ?? Math.max(orderTotal - paidAmount, 0);

  const paymentStatusText = order.paymentStatus
    ? (PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus)
    : null;

  const shippingMethodText = order.shippingMethod
    ? (SHIPPING_METHOD_LABELS[order.shippingMethod] ?? order.shippingMethod)
    : null;

  const specText =
    order.specValues && Object.keys(order.specValues).length > 0
      ? Object.entries(order.specValues)
          .map(([k, v]) => `${esc(k)}: ${esc(String(v))}`)
          .join("、")
      : null;

  const discountRow =
    discountAmount > 0
      ? `<tr><td style="color:#555;padding:4px 0">折讓</td><td style="text-align:right;padding:4px 0;color:#e11d48">-${formatCurrency(discountAmount)}</td></tr>`
      : "";

  const discountNoteRow =
    (order.discountNote ?? "").trim()
      ? `<tr><td style="color:#555;padding:4px 0">折讓備註</td><td style="text-align:right;padding:4px 0">${esc((order.discountNote ?? "").trim())}</td></tr>`
      : "";

  const storeRows = [
    order.storeName ? `<div class="row"><span class="row-label">超商店名</span><span class="row-value">${esc(order.storeName)}</span></div>` : "",
    order.storeCode ? `<div class="row"><span class="row-label">超商店號</span><span class="row-value">${esc(order.storeCode)}</span></div>` : "",
    order.cvsStoreAddress ? `<div class="row"><span class="row-label">門市地址</span><span class="row-value">${esc(order.cvsStoreAddress)}</span></div>` : "",
  ].filter(Boolean).join("");

  const notesHtml = (order.notes ?? "").trim()
    ? `<div style="border-top:1px dashed #d1d5db;margin-top:12px;padding-top:10px">
  <div style="font-size:11px;color:#555;margin-bottom:4px">訂單備註</div>
  <div style="font-size:11px">${esc((order.notes ?? "").trim())}</div>
</div>`
    : "";

  const body = `
<div style="text-align:center;border-bottom:2px solid #fb7185;padding-bottom:12px;margin-bottom:16px">
  <div style="font-size:22px;font-weight:bold;color:#fb7185">PickBee 代購蜂</div>
  <div style="font-size:16px;font-weight:600;margin-top:4px">銷貨單</div>
  <div style="font-size:11px;color:#777;margin-top:4px">列印時間：${esc(now)}</div>
</div>

<div class="card">
  <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#555">訂單資訊</div>
  <div class="row"><span class="row-label">訂單編號</span><span class="row-value">#${order.id}</span></div>
  <div class="row"><span class="row-label">客戶名稱</span><span class="row-value">${esc(order.buyerName)}</span></div>
  <div class="row"><span class="row-label">客戶電話</span><span class="row-value">${esc(order.buyerPhone)}</span></div>
  <div class="row"><span class="row-label">訂單狀態</span><span class="row-value">${esc(ORDER_STATUS_RECEIPT_LABELS[order.status] ?? order.status)}</span></div>
  ${paymentStatusText ? `<div class="row"><span class="row-label">付款狀態</span><span class="row-value">${esc(paymentStatusText)}</span></div>` : ""}
  ${shippingMethodText ? `<div class="row"><span class="row-label">物流方式</span><span class="row-value">${esc(shippingMethodText)}</span></div>` : ""}
  ${storeRows}
</div>

<div class="card">
  <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#555">商品明細</div>
  <div class="row"><span class="row-label">商品名稱</span><span class="row-value">${esc(order.productName ?? "（未設定）")}</span></div>
  ${specText ? `<div class="row"><span class="row-label">規格</span><span class="row-value">${specText}</span></div>` : ""}
  <div class="row"><span class="row-label">數量</span><span class="row-value">× ${order.quantity}</span></div>
  ${order.unitPrice != null ? `<div class="row"><span class="row-label">單價</span><span class="row-value">${formatCurrency(Number(order.unitPrice))}</span></div>` : ""}
  <div class="row"><span class="row-label">商品小計</span><span class="row-value" style="font-weight:700">${formatCurrency(productSubtotal)}</span></div>
</div>

<div class="card">
  <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#555">金額明細</div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr><td style="color:#555;padding:4px 0">商品小計</td><td style="text-align:right;padding:4px 0">${formatCurrency(productSubtotal)}</td></tr>
    <tr><td style="color:#555;padding:4px 0">運費</td><td style="text-align:right;padding:4px 0">${formatCurrency(shippingFee)}</td></tr>
    ${discountRow}
    ${discountNoteRow}
    <tr style="border-top:1px solid #d1d5db">
      <td style="padding:6px 0;font-weight:700">訂單總額</td>
      <td style="text-align:right;padding:6px 0;font-weight:700;font-size:14px;color:#fb7185">${formatCurrency(orderTotal)}</td>
    </tr>
    <tr><td style="color:#555;padding:4px 0">已收金額</td><td style="text-align:right;padding:4px 0">${formatCurrency(paidAmount)}</td></tr>
    <tr>
      <td style="padding:4px 0;font-weight:600">待收金額</td>
      <td style="text-align:right;padding:4px 0;font-weight:600;color:#e11d48">${formatCurrency(remainingAmount)}</td>
    </tr>
  </table>
  ${notesHtml}
</div>

<div style="text-align:center;font-size:10px;color:#999;margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb">
  本銷貨單由 PickBee 代購蜂管理系統產生
</div>`;

  openPrint(htmlDoc("銷貨單 — PickBee 代購蜂", body));
}
