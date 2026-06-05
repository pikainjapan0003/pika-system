import type { PickingListResponse, ShippingListResponse, ShippingListOrder } from "@workspace/api-client-react";

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
