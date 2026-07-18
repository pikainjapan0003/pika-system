import type { Order, PickingListResponse, ShippingListResponse, ShippingListOrder } from "@workspace/api-client-react";
import type { OrderStatus } from "@workspace/db";

import { STATUS_LABELS } from "./orderStatus";

// Local augmentation: generated Order may lag behind DB schema on these fields.
interface PrintOrderItem {
  productName: string;
  specValues?: Record<string, string> | null;
  quantity: number;
  unitPrice?: number | null;
  subtotal?: number | null;
}

type PrintableOrder = Order & {
  discountAmount?: number | null;
  discountNote?: string | null;
  items?: PrintOrderItem[] | null;
};

function normalizeOrderItems(order: PrintableOrder): PrintOrderItem[] {
  if (Array.isArray(order.items) && order.items.length > 0) return order.items;
  const qty = order.quantity ?? 1;
  const unitPrice = order.unitPrice != null
    ? Number(order.unitPrice)
    : (order.totalPrice != null && qty > 0 ? Number(order.totalPrice) / qty : 0);
  return [{
    productName: order.productName ?? "（商品）",
    specValues: (order.specValues as Record<string, string> | null | undefined) ?? null,
    quantity: qty,
    unitPrice,
    subtotal: unitPrice * qty,
  }];
}

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

function showReceiptPreviewOverlay(html: string): void {
  const existing = document.getElementById("__receipt_overlay__");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "__receipt_overlay__";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.72);display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;";

  const bar = document.createElement("div");
  bar.style.cssText =
    "background:#fb7185;color:white;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;";
  bar.innerHTML =
    `<span style="font-weight:700;font-size:15px">銷貨單預覽</span>` +
    `<div style="display:flex;gap:8px;">` +
    `<button id="__receipt_open_tab__" style="background:white;color:#e11d48;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">開新分頁</button>` +
    `<button id="__receipt_close__" style="background:rgba(255,255,255,0.22);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">✕ 關閉</button>` +
    `</div>`;

  const hint = document.createElement("div");
  hint.style.cssText =
    "background:#fff7ed;color:#92400e;font-size:11px;padding:6px 16px;flex-shrink:0;text-align:center;";
  hint.textContent =
    "手機 Chrome 若無法直接開啟新分頁，請在此預覽銷貨單，或改用 Safari / 分享 / 列印。";

  const wrap = document.createElement("div");
  wrap.style.cssText = "flex:1;overflow:hidden;background:white;";

  const preview = document.createElement("iframe");
  preview.style.cssText = "width:100%;height:100%;border:none;";
  wrap.appendChild(preview);

  overlay.appendChild(bar);
  overlay.appendChild(hint);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  const pdoc = preview.contentDocument ?? preview.contentWindow?.document;
  if (pdoc) { pdoc.open(); pdoc.write(html); pdoc.close(); }

  document.getElementById("__receipt_close__")?.addEventListener("click", () => overlay.remove());
  document.getElementById("__receipt_open_tab__")?.addEventListener("click", () => {
    const p = window.open("", "_blank");
    if (p) { p.document.open(); p.document.write(html); p.document.close(); }
  });
}

function openPrint(html: string): void {
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    // Store receipt HTML in localStorage and navigate to the dedicated /receipt-preview
    // route. This ensures iOS Chrome / Google App share / PDF captures only the receipt
    // page, not the surrounding Orders page.
    try {
      const key = (crypto as { randomUUID?: () => string }).randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(
        `pickbee-receipt-preview:${key}`,
        JSON.stringify({ html, title: "銷貨單", createdAt: Date.now() }),
      );
      const base = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
      const url = `${base}/receipt-preview?key=${encodeURIComponent(key)}`;
      const opened = window.open(url, "_blank");
      if (opened) return;
      // window.open blocked: navigate current tab to receipt-preview
      window.location.href = url;
      return;
    } catch {
      // localStorage or navigation failed — fall through to overlay
    }
    // Last resort: visible overlay (no navigation needed)
    showReceiptPreviewOverlay(html);
    return;
  }

  const prev = document.getElementById("__print_frame__");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.setAttribute("aria-hidden", "true");
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

  const triggerPrint = () => {
    const cw = iframe.contentWindow;
    if (!cw) { cleanup(); return; }
    try { cw.focus(); cw.print(); } catch { /* ignore */ }
    cw.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(cleanup, 5 * 60_000);
  };

  // Wait for images to load before printing (e.g. store logo from R2).
  setTimeout(() => {
    const imgs = Array.from((doc as Document).images ?? []) as HTMLImageElement[];
    const pending = imgs.filter((img) => !img.complete);
    if (pending.length === 0) {
      triggerPrint();
      return;
    }
    let settled = 0;
    let fired = false;
    const onSettle = () => {
      settled++;
      if (settled >= pending.length && !fired) {
        fired = true;
        triggerPrint();
      }
    };
    pending.forEach((img) => {
      img.addEventListener("load", onSettle, { once: true });
      img.addEventListener("error", onSettle, { once: true });
    });
    // Safety: print even if images don't load within 5s.
    setTimeout(() => { if (!fired) { fired = true; triggerPrint(); } }, 5000);
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

type ReceiptFulfillmentCat = "self_pickup" | "cvs_711" | "cvs_family" | "home_black_cat" | "home_post" | "other";

function getReceiptFulfillmentCat(order: PrintableOrder): ReceiptFulfillmentCat {
  const m = (order.pickupMethod ?? "").trim();
  if (m === "自取" || m === "面交") return "self_pickup";
  if (m.startsWith("7-11") || m.includes("711") || m.includes("統一")) return "cvs_711";
  if (m.startsWith("全家")) return "cvs_family";
  if (m.includes("黑貓") || m.includes("宅急便")) return "home_black_cat";
  if (m.includes("郵局")) return "home_post";
  if (m === "宅配") return "home_black_cat";
  if (order.shippingMethod === "self_pickup") return "self_pickup";
  if (order.shippingMethod === "convenience_store") return "cvs_711";
  if (order.shippingMethod === "home_delivery") return "home_black_cat";
  return "other";
}

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

export function getOrderReceiptStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

function formatCurrency(value: number): string {
  return `NT$ ${Number(value).toLocaleString()}`;
}

const RECEIPT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
  font-size: 12px; color: #1a1a1a; background: white;
  max-width: 680px; margin: 0 auto; padding: 12px 16px;
}
.brand-hero {
  background: #fafafa;
  border: 2px solid var(--brand-primary, #F57572); border-radius: 12px;
  text-align: center; padding: 20px 16px 16px; margin-bottom: 16px;
  page-break-inside: avoid; break-inside: avoid;
}
.brand-logo-img { height: 56px; width: auto; object-fit: contain; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; }
.brand-badge-text {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--brand-primary, #F57572); color: white;
  font-size: 22px; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.brand-name { font-size: 22px; font-weight: 800; color: var(--brand-primary, #F57572); letter-spacing: 0.02em; }
.brand-sub { font-size: 13px; font-weight: 600; color: #374151; margin-top: 4px; }
.brand-tagline {
  font-size: 11px; color: #4b5563; margin-top: 8px;
  background: #f3f4f6; border-radius: 6px;
  padding: 6px 12px; display: inline-block;
}
.section-card {
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 12px 14px; margin-bottom: 12px;
  page-break-inside: avoid; break-inside: avoid;
}
.section-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #6b7280;
  border-bottom: 1px solid #f3f4f6; padding-bottom: 5px; margin-bottom: 8px;
}
.info-grid { display: table; width: 100%; }
.info-row { display: table-row; }
.info-label {
  display: table-cell; color: #6b7280; font-size: 11px;
  padding: 3px 8px 3px 0; white-space: nowrap; width: 72px; vertical-align: top;
}
.info-value {
  display: table-cell; font-weight: 500; font-size: 12px;
  padding: 3px 0; word-break: break-word;
}
.info-value.mono { font-family: "Courier New", monospace; letter-spacing: 0.02em; }
.status-badge {
  display: inline-block; background: #fef3c7; color: #92400e;
  font-size: 10px; font-weight: 600; padding: 2px 7px;
  border-radius: 10px; border: 1px solid #fcd34d;
}
.two-col {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
}
.two-col .section-card { margin-bottom: 0; }
.product-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.product-table thead tr { background: #f9fafb; }
.product-table th {
  padding: 6px 8px; text-align: left; font-weight: 600;
  font-size: 11px; color: #4b5563; border-bottom: 2px solid #e5e7eb;
}
.product-table td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.product-table thead { display: table-header-group; }
.product-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
.th-qty, .td-qty { width: 44px; text-align: center; }
.th-price, .td-price { width: 80px; text-align: right; }
.th-sub, .td-sub { width: 80px; text-align: right; font-weight: 600; }
.product-name { font-weight: 500; word-break: break-word; }
.product-spec { font-size: 11px; color: #6b7280; margin-top: 2px; }
.payment-card { background: #fff9f9; border-color: #fecdd3; }
.summary-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
.sl { color: #555; padding: 4px 8px 4px 0; vertical-align: middle; }
.sr { text-align: right; padding: 4px 0; vertical-align: middle; }
.total-row td { padding-top: 10px; font-weight: 700; font-size: 14px; border-top: 1.5px solid #e5e7eb; }
.total-amount { color: #fb7185; }
.pay-divider { border: none; border-top: 2px dashed #fecdd3; margin: 10px 0; }
.remaining-due {
  background: #fff1f2; border: 2px solid #fb7185; border-radius: 8px;
  text-align: center; padding: 10px 12px; color: #be123c;
  font-size: 12px; font-weight: 600; line-height: 1.4;
}
.remaining-amount {
  font-size: 22px; font-weight: 800; color: #e11d48;
  display: block; margin-top: 3px;
}
.paid-clear {
  background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px;
  text-align: center; padding: 10px 12px; color: #166534;
  font-size: 16px; font-weight: 700;
}
.notice-card { background: #fffbeb; border-color: #fde68a; }
.notice-list { padding-left: 16px; font-size: 11px; color: #92400e; line-height: 1.9; }
.notes-section { background: #f9fafb; }
.receipt-footer {
  text-align: center; font-size: 10px; color: #9ca3af;
  margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb;
  page-break-inside: avoid; break-inside: avoid;
}
@media print {
  @page { size: A4; margin: 8mm 12mm; }
  html, body { height: auto; }
  body { padding: 0; }
  .brand-hero { margin-bottom: 12px; }
  .section-card { margin-bottom: 8px; }
  .two-col { margin-bottom: 8px; }
  .section-card.product-section { page-break-inside: auto; break-inside: auto; }
  .receipt-footer { margin-top: 10px; page-break-after: avoid; break-after: avoid; }
  .brand-hero, .section-card, .two-col, .receipt-footer {
    page-break-inside: avoid; break-inside: avoid;
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function receiptHtmlDoc(title: string, body: string, brandColor = "#F57572"): string {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#F57572";
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>:root{--brand-primary:${safeColor};}${RECEIPT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function printOrderReceipt(
  order: PrintableOrder,
  storeSettings?: { name?: string | null; logoUrl?: string | null; brandPrimaryColor?: string | null },
): void {
  const storeName = storeSettings?.name?.trim() || "畫夢代購";
  const brandColor = storeSettings?.brandPrimaryColor?.trim() || "#F57572";
  const logoUrl = storeSettings?.logoUrl?.trim() || null;

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

  const receiptCat = getReceiptFulfillmentCat(order);
  const fulfillmentLabel = (order.pickupMethod ?? "").trim() ||
    (order.shippingMethod ? (SHIPPING_METHOD_LABELS[order.shippingMethod] ?? order.shippingMethod) : null);

  const discountRow =
    discountAmount > 0
      ? `<tr><td class="sl">折讓</td><td class="sr" style="color:#e11d48">-${formatCurrency(discountAmount)}</td></tr>`
      : "";

  const discountNoteRow =
    (order.discountNote ?? "").trim()
      ? `<tr><td class="sl" style="padding-left:10px;font-size:11px;color:#888">折讓備註</td><td class="sr" style="font-size:11px;color:#888">${esc((order.discountNote ?? "").trim())}</td></tr>`
      : "";

  const remainingBlock =
    remainingAmount <= 0
      ? `<div class="paid-clear">&#x2713; 已付清</div>`
      : `<div class="remaining-due">待收金額<span class="remaining-amount">${formatCurrency(remainingAmount)}</span></div>`;

  const orderNotesHtml =
    (order.notes ?? "").trim()
      ? `<div class="section-card notes-section">
  <div class="section-title">訂單備註</div>
  <div style="font-size:12px;line-height:1.6;word-break:break-word">${esc((order.notes ?? "").trim())}</div>
</div>`
      : "";

  const noPickupInfo = `<div class="info-row"><span class="info-label" style="color:#bbb">－</span><span class="info-value" style="color:#bbb">取貨資訊未設定</span></div>`;
  let pickupRows: string;
  let pickupSectionTitle: string;
  if (receiptCat === "self_pickup") {
    pickupSectionTitle = "取貨資訊";
    pickupRows = `<div class="info-row"><span class="info-label">取貨方式</span><span class="info-value">自取</span></div>`;
  } else if (receiptCat === "cvs_711" || receiptCat === "cvs_family") {
    pickupSectionTitle = "取貨資訊";
    const cvsLabel = receiptCat === "cvs_711" ? "7-11" : "全家";
    const parts = [
      `<div class="info-row"><span class="info-label">超商</span><span class="info-value">${esc(cvsLabel)}</span></div>`,
      order.storeName ? `<div class="info-row"><span class="info-label">門市</span><span class="info-value">${esc(order.storeName)}</span></div>` : "",
    ].filter(Boolean).join("");
    pickupRows = parts;
  } else if (receiptCat === "home_black_cat" || receiptCat === "home_post") {
    pickupSectionTitle = "配送資訊";
    const carrierLabel = order.trackingProvider || (receiptCat === "home_black_cat" ? "黑貓宅急便" : "郵局宅配");
    const parts = [
      `<div class="info-row"><span class="info-label">物流方式</span><span class="info-value">${esc(carrierLabel)}</span></div>`,
      order.recipientAddress ? `<div class="info-row"><span class="info-label">收件地址</span><span class="info-value" style="word-break:break-word">${esc(order.recipientAddress)}</span></div>` : "",
      order.trackingCode ? `<div class="info-row"><span class="info-label">物流追蹤碼</span><span class="info-value mono">${esc(order.trackingCode)}</span></div>` : "",
    ].filter(Boolean).join("");
    pickupRows = parts || noPickupInfo;
  } else {
    pickupSectionTitle = "取貨資訊";
    const parts = [
      order.storeName ? `<div class="info-row"><span class="info-label">門市</span><span class="info-value">${esc(order.storeName)}</span></div>` : "",
      order.recipientAddress ? `<div class="info-row"><span class="info-label">收件地址</span><span class="info-value" style="word-break:break-word">${esc(order.recipientAddress)}</span></div>` : "",
    ].filter(Boolean).join("");
    pickupRows = parts || noPickupInfo;
  }

  const body = `
<div class="brand-hero">
  ${logoUrl
    ? `<img src="${esc(logoUrl)}" class="brand-logo-img" alt="${esc(storeName)}">`
    : `<div class="brand-badge-text">${esc(storeName.charAt(0).toUpperCase())}</div>`}
  <div class="brand-name">${esc(storeName)}</div>
  <div class="brand-sub">銷貨單 &middot; Order Receipt</div>
  <div class="brand-tagline">感謝您的購買，請確認以下訂單、付款與取貨資訊。</div>
</div>

<div class="section-card">
  <div class="section-title">訂單摘要</div>
  <div class="info-grid">
    <div class="info-row">
      <span class="info-label">訂單編號</span>
      <span class="info-value mono">#${order.id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">列印時間</span>
      <span class="info-value">${esc(now)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">訂單狀態</span>
      <span class="info-value"><span class="status-badge">${esc(getOrderReceiptStatusLabel(order.status as OrderStatus))}</span></span>
    </div>
    ${paymentStatusText ? `<div class="info-row"><span class="info-label">付款狀態</span><span class="info-value"><span class="status-badge">${esc(paymentStatusText)}</span></span></div>` : ""}
    ${fulfillmentLabel ? `<div class="info-row"><span class="info-label">取貨方式</span><span class="info-value">${esc(fulfillmentLabel)}</span></div>` : ""}
  </div>
</div>

<div class="two-col">
  <div class="section-card">
    <div class="section-title">客戶資訊</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">姓名</span>
        <span class="info-value">${esc(order.buyerName)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">電話</span>
        <span class="info-value">${esc(order.buyerPhone)}</span>
      </div>
    </div>
  </div>
  <div class="section-card">
    <div class="section-title">${pickupSectionTitle}</div>
    <div class="info-grid">
      ${pickupRows}
    </div>
  </div>
</div>

<div class="section-card product-section">
  <div class="section-title">商品明細</div>
  <table class="product-table">
    <thead>
      <tr>
        <th>商品名稱</th>
        <th class="th-qty">數量</th>
        <th class="th-price">單價</th>
        <th class="th-sub">小計</th>
      </tr>
    </thead>
    <tbody>
      ${normalizeOrderItems(order).map((item) => {
        const sv = item.specValues;
        const itemSpec = sv && Object.keys(sv).length > 0
          ? Object.entries(sv).map(([k, v]) => `${esc(k)}：${esc(String(v))}`).join("、")
          : null;
        const itemSub = item.subtotal ?? (Number(item.unitPrice ?? 0) * item.quantity);
        return `<tr>
        <td>
          <div class="product-name">${esc(item.productName ?? "（商品）")}</div>
          ${itemSpec ? `<div class="product-spec">${itemSpec}</div>` : ""}
        </td>
        <td class="td-qty">&times;&nbsp;${item.quantity}</td>
        <td class="td-price">${item.unitPrice != null ? formatCurrency(Number(item.unitPrice)) : "－"}</td>
        <td class="td-sub">${formatCurrency(itemSub)}</td>
      </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>

<div class="section-card payment-card">
  <div class="section-title">付款摘要</div>
  <table class="summary-table">
    <tr><td class="sl">商品小計</td><td class="sr">${formatCurrency(productSubtotal)}</td></tr>
    <tr><td class="sl">運費</td><td class="sr">${formatCurrency(shippingFee)}</td></tr>
    ${discountRow}
    ${discountNoteRow}
    <tr class="total-row">
      <td class="sl">訂單總額</td>
      <td class="sr total-amount">${formatCurrency(orderTotal)}</td>
    </tr>
    <tr>
      <td class="sl" style="padding-top:6px">已收金額</td>
      <td class="sr" style="padding-top:6px">${formatCurrency(paidAmount)}</td>
    </tr>
  </table>
  <hr class="pay-divider">
  ${remainingBlock}
</div>

${orderNotesHtml}

<div class="section-card notice-card">
  <div class="section-title">注意事項</div>
  <ul class="notice-list">
    <li>請確認商品、金額與取貨資訊是否正確。</li>
    <li>代購商品可能因缺貨、價格異動或賣場狀態調整而另行通知。</li>
    <li>訂單付款與取消規則請依賣家公告為準。</li>
    <li>超商取貨請留意簡訊與取貨期限。</li>
    <li>如有問題請盡快聯繫客服。</li>
  </ul>
</div>

<div class="receipt-footer">
  本銷貨單由畫夢代購系統產生
</div>`;

  openPrint(receiptHtmlDoc(`銷貨單 — ${esc(storeName)}`, body, brandColor));
}
