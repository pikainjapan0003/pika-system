import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { db, storesTable, productsTable, ordersTable, shipmentTrackingsTable } from "@workspace/db";
import { SubmitOrderBody } from "@workspace/api-zod";
import { getShippingFee } from "../lib/shippingFee.ts";
import { getProviderMeta } from "../lib/logistics/providers.ts";

const submitOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

const trackOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

const SHIPPING_STATUS_LABELS: Record<string, string> = {
  not_shipped: "尚未出貨",
  preparing: "備貨中",
  shipped: "已出貨（追蹤碼由店家提供）",
  arrived: "已到達目的地",
  picked_up: "已取貨完成",
  returned: "退貨處理中",
  cancelled: "物流取消，請聯繫店家",
};

// 客人端顯示用：物流商代碼 → 繁中名稱（已是中文名稱者原樣顯示）。
// 來源收斂至 provider registry（Step 7H-B）；維持既有頁面文案：黑貓用全名、其餘用短名。
function publicTrackingProviderLabel(raw: string): string {
  if (raw.trim().toLowerCase() === "other") return "其他物流";
  const meta = getProviderMeta(raw);
  if (!meta) return raw;
  return meta.code === "tcat" ? meta.displayName : meta.shortName;
}

// 客人端顯示用：標準化貨態（shipment_tracking_events.eventStatus）→ 繁中文案
const TRACKING_EVENT_STATUS_LABELS: Record<string, string> = {
  pending: "物流單已建立",
  in_transit: "運送中",
  arrived_store: "已到店，待取貨",
  picked_up: "已取貨",
  delivered: "已送達",
  returned: "已退回，請聯絡店家",
  exception: "物流資料需要店家確認",
  unknown: "物流資料需要店家確認",
};

function maskName(name: string | null): string | null {
  if (!name) return null;
  const chars = [...name];
  if (chars.length <= 1) return name;
  return chars[0] + "○".repeat(chars.length - 1);
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return phone.slice(0, 2) + "***";
  return phone.slice(0, 4) + "***" + phone.slice(-3);
}

// 地址摘要：只保留縣市 + 行政區，不暴露郵遞區號、路名、門牌
function summarizeAddress(address: string | null): string | null {
  if (!address) return null;
  const trimmed = address.trim().replace(/^\d{3,6}\s*/, "");
  if (!trimmed) return null;
  const match = trimmed.match(/^(.{1,3}[市縣])(.{1,3}[區鄉鎮市])?/);
  if (match && match[1]) {
    return match[1] + (match[2] ?? "");
  }
  if (trimmed.length <= 9) return trimmed;
  return trimmed.slice(0, 9) + "…";
}

const router = Router();

router.get("/p/:shareToken", async (req, res) => {
  const { shareToken } = req.params;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.shareToken, shareToken))
    .limit(1);

  if (!product || !product.isActive) {
    return res.status(404).json({ error: "Product not found" });
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, product.storeId))
    .limit(1);

  return res.json({
    id: product.id,
    name: product.name,
    description: product.description,
    price: parseFloat(product.price as string),
    specs: product.specs ?? [],
    inventory: product.inventory,
    imageUrl: product.imageUrl,
    storeName: store?.name ?? "",
    shareToken: product.shareToken,
    orderDeadlineAt: product.orderDeadlineAt?.toISOString() ?? null,
    storageTemp: product.storageTemp,
    shelfLife: product.shelfLife,
    weightKg: product.weightKg != null ? parseFloat(product.weightKg as string) : null,
    brandPrimaryColor: store?.brandPrimaryColor ?? null,
  });
});

router.post("/p/:shareToken/orders", submitOrderLimiter, async (req, res) => {
  const shareToken = req.params.shareToken as string;

  const parsed = SubmitOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  // shippingFee override: allow client to pass, but validate it's a number
  const shippingFeeOverride = typeof req.body?.shippingFee === "number" ? req.body.shippingFee : undefined;

  let retries = 0;
  while (retries <= 3) {
    const publicToken = randomBytes(16).toString("hex");
    try {
      const order = await db.transaction(async (tx) => {
        // Lock the product row to prevent concurrent over-selling
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.shareToken, shareToken))
          .for("update")
          .limit(1);

        if (!product || !product.isActive) {
          const err = new Error("Product not found") as any;
          err.status = 404;
          throw err;
        }

        if (product.orderDeadlineAt && new Date() >= product.orderDeadlineAt) {
          const err = new Error("PRODUCT_ORDER_DEADLINE_PASSED") as any;
          err.status = 422;
          err.displayMessage = "此商品已截止收單，無法送出訂單。";
          throw err;
        }

        if (product.inventory !== null && parsed.data.quantity > product.inventory) {
          const err = new Error("庫存不足") as any;
          err.status = 409;
          throw err;
        }

        const unitPrice = parseFloat(product.price as string);
        const shippingFee = getShippingFee(parsed.data.pickupMethod, shippingFeeOverride);
        // totalPrice = 商品小計（不含運費）。訂單總額由 shippingFee + totalPrice 計算
        // （與 merchant orders 的 formatOrder 語意一致，避免運費被重複計算）。
        const totalPrice = unitPrice * parsed.data.quantity;

        // Decrement inventory only when it is being tracked (not null)
        if (product.inventory !== null) {
          await tx
            .update(productsTable)
            .set({ inventory: product.inventory - parsed.data.quantity })
            .where(eq(productsTable.id, product.id));
        }

        // CVS store data from validated body. storeSelectedBy is always forced to
        // "customer" on this public endpoint — never trust the client's value.
        const hasCvs = !!(parsed.data.cvsStoreId);

        const [newOrder] = await tx
          .insert(ordersTable)
          .values({
            productId: product.id,
            storeId: product.storeId,
            productName: product.name,
            publicToken,
            buyerName: parsed.data.buyerName,
            buyerPhone: parsed.data.buyerPhone,
            pickupMethod: parsed.data.pickupMethod,
            notes: parsed.data.notes ?? null,
            specValues: parsed.data.specValues ?? {},
            quantity: parsed.data.quantity,
            unitPrice: String(unitPrice),
            shippingFee: String(shippingFee),
            totalPrice: String(totalPrice),
            status: "pending",
            cvsStoreId: hasCvs ? (parsed.data.cvsStoreId ?? null) : null,
            cvsStoreName: hasCvs ? (parsed.data.cvsStoreName ?? null) : null,
            cvsStoreAddress: hasCvs ? (parsed.data.cvsStoreAddress ?? null) : null,
            cvsStorePhone: hasCvs ? (parsed.data.cvsStorePhone ?? null) : null,
            storeSelectedBy: hasCvs ? "customer" : null,
            storeSelectedAt: hasCvs ? new Date() : null,
            // 黑貓 / 郵局：買家填的完整收件地址（郵遞區號 縣市行政區 詳細地址）
            recipientAddress: parsed.data.recipientAddress ?? null,
            // Step 7H-4: 收件資訊（買家可指定與本人不同的收件人）
            recipientName: parsed.data.recipientName ?? null,
            recipientPhone: parsed.data.recipientPhone ?? null,
          })
          .returning();

        if (!newOrder) throw new Error("Insert returned no row");
        return newOrder;
      });

      return res.status(201).json({
        ...order,
        unitPrice: parseFloat(order.unitPrice as string),
        shippingFee: parseFloat(order.shippingFee as string),
        totalPrice: parseFloat(order.totalPrice as string),
        storeSelectedAt: order.storeSelectedAt?.toISOString() ?? null,
      });
    } catch (err: any) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 409) return res.status(409).json({ error: err.message });
      if (err.status === 422) return res.status(422).json({ error: err.message, message: err.displayMessage });
      // Retry on publicToken unique collision (Postgres code 23505)
      if (err.code === "23505" && retries < 3) {
        retries++;
        continue;
      }
      throw err;
    }
  }
  // Unreachable: 23505 on all attempts throws before the while condition is re-checked
  throw new Error("Failed to generate unique publicToken after retries");
});

router.get("/orders/track/:publicToken", trackOrderLimiter, async (req, res) => {
  const publicToken = req.params.publicToken as string;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.publicToken, publicToken))
    .limit(1);

  if (!order || !order.publicToken) {
    return res.status(404).json({ error: "Order not found" });
  }

  const [store] = await db
    .select({ name: storesTable.name })
    .from(storesTable)
    .where(eq(storesTable.id, order.storeId))
    .limit(1);

  const [tracking] = await db
    .select({
      trackingCode: shipmentTrackingsTable.trackingCode,
      trackingProvider: shipmentTrackingsTable.trackingProvider,
      trackingStatus: shipmentTrackingsTable.trackingStatus,
      latestEventStatus: shipmentTrackingsTable.latestEventStatus,
      latestEventAt: shipmentTrackingsTable.latestEventAt,
      updatedAt: shipmentTrackingsTable.updatedAt,
    })
    .from(shipmentTrackingsTable)
    .where(and(eq(shipmentTrackingsTable.orderId, order.id), eq(shipmentTrackingsTable.isActive, true)))
    .orderBy(desc(shipmentTrackingsTable.id))
    .limit(1);

  const trackingCode = tracking?.trackingCode ?? order.trackingCode ?? null;
  const trackingProvider = tracking?.trackingProvider ?? order.trackingProvider ?? null;
  // 查詢任務連續失敗（failed）對客人顯示為「需店家確認」，不暴露技術錯誤
  const latestTrackingStatus = tracking
    ? (tracking.trackingStatus === "failed" ? "exception" : tracking.latestEventStatus)
    : null;

  const shippingFee = parseFloat(order.shippingFee as string ?? "0");
  const totalPrice = parseFloat(order.totalPrice as string);
  return res.json({
    publicToken: order.publicToken,
    productName: order.productName,
    quantity: order.quantity,
    unitPrice: parseFloat(order.unitPrice as string),
    shippingFee,
    totalPrice,
    orderTotal: Math.max(totalPrice + shippingFee - (order.discountAmount ?? 0), 0),
    pickupMethod: order.pickupMethod,
    specValues: order.specValues ?? {},
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    shippingStatus: order.shippingStatus ?? "not_shipped",
    shippingStatusLabel: SHIPPING_STATUS_LABELS[order.shippingStatus ?? "not_shipped"] ?? order.shippingStatus,
    trackingCode,
    trackingProvider,
    trackingProviderLabel: trackingProvider
      ? publicTrackingProviderLabel(trackingProvider)
      : null,
    latestTrackingStatus,
    latestTrackingStatusLabel: latestTrackingStatus
      ? (TRACKING_EVENT_STATUS_LABELS[latestTrackingStatus] ?? "物流資料需要店家確認")
      : null,
    latestTrackingTime: tracking?.latestEventAt?.toISOString() ?? null,
    shipmentUpdatedAt: tracking?.updatedAt?.toISOString() ?? null,
    storeName: store?.name ?? null,
    cvsStoreName: order.cvsStoreName ?? null,
    cvsStoreAddress: order.cvsStoreAddress ?? null,
    recipientNameMasked: maskName(order.recipientName ?? order.buyerName ?? null),
    recipientPhoneMasked: maskPhone(order.recipientPhone ?? null),
    recipientAddressMasked: summarizeAddress(order.recipientAddress ?? null),
    createdAt: order.createdAt,
    // STRICTLY EXCLUDED (private / personal info):
    // internalNote, paymentNote, paidAmount, recipientPhone (full), recipientAddress (full),
    // shippingNote, recipientName (full), paymentMethod, paymentStatus, remainingAmount,
    // checkError, eventCode, rawData
  });
});

export default router;
