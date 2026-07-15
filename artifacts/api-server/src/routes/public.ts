import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import {
  createInitialOrderProfitSnapshot,
  db,
  storesTable,
  productsTable,
  ordersTable,
  shipmentTrackingsTable,
} from "@workspace/db";
import { SubmitOrderBody } from "@workspace/api-zod";
import { getShippingFee } from "../lib/shippingFee.ts";
import { getProviderMeta } from "../lib/logistics/providers.ts";
import { loadOrderProfitSnapshotInput } from "../lib/orderProfitSnapshot.ts";

const INTERNAL_PROFIT_SNAPSHOT_FIELDS = [
  "profitSnapshotCostJpy",
  "profitSnapshotExchangeRate",
  "profitSnapshotProductCostTwd",
  "profitSnapshotTransportCostTwd",
  "profitSnapshotUnitProfitTwd",
  "profitSnapshotFullUnitProfitTwd",
  "profitSnapshotStatus",
  "profitSnapshotCapturedAt",
  "profitSnapshotBackfilledAt",
] as const;

function omitInternalProfitSnapshot(order: Record<string, unknown>): Record<string, unknown> {
  const publicOrder = { ...order };
  for (const field of INTERNAL_PROFIT_SNAPSHOT_FIELDS) delete publicOrder[field];
  return publicOrder;
}

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
        const profitSnapshotInput = await loadOrderProfitSnapshotInput(
          tx,
          product,
          product.price,
        );
        const profitSnapshot = createInitialOrderProfitSnapshot(
          profitSnapshotInput,
          new Date(),
        );

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
            ...profitSnapshot,
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
        ...omitInternalProfitSnapshot(order),
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

// Cart checkout: one order with multiple items. Profit-snapshot capture intentionally does not
// apply here (it's keyed to a single product/price) — these orders keep profit_snapshot_status
// NULL, which satisfies the orders_profit_snapshot_shape_valid check's all-NULL branch.
router.post("/cart/orders", submitOrderLimiter, async (req, res) => {
  const body = req.body;

  // Manual validation (no zod dep needed for inline schema)
  if (!body.buyerName?.trim() || !body.buyerPhone?.trim() || !body.pickupMethod?.trim()) {
    return res.status(400).json({ error: "buyerName, buyerPhone, and pickupMethod are required" });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  for (const item of body.items) {
    if (!item.shareToken?.trim()) return res.status(400).json({ error: "each item requires shareToken" });
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return res.status(400).json({ error: "each item quantity must be a positive integer" });
    }
  }

  const shippingFeeOverride = typeof body.shippingFee === "number" ? body.shippingFee : undefined;
  const shippingFee = getShippingFee(body.pickupMethod, shippingFeeOverride);
  const hasCvs = !!(body.cvsStoreId);

  let retries = 0;
  while (retries <= 3) {
    const publicToken = randomBytes(16).toString("hex");
    try {
      const result = await db.transaction(async (tx) => {
        const resolvedItems: Array<{
          productId: number;
          shareToken: string;
          productName: string;
          productImageUrl: string | null;
          specValues: Record<string, string>;
          quantity: number;
          unitPrice: number;
          subtotal: number;
        }> = [];

        for (const item of body.items) {
          const [product] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.shareToken, item.shareToken))
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
            err.displayMessage = `商品「${product.name}」已截止收單，無法送出訂單。`;
            throw err;
          }
          const qty: number = item.quantity;
          if (product.inventory !== null && qty > product.inventory) {
            const err = new Error("庫存不足") as any;
            err.status = 409;
            throw err;
          }
          if (product.inventory !== null) {
            await tx
              .update(productsTable)
              .set({ inventory: product.inventory - qty })
              .where(eq(productsTable.id, product.id));
          }
          const unitPrice = parseFloat(product.price as string);
          resolvedItems.push({
            productId: product.id,
            shareToken: item.shareToken,
            productName: product.name,
            productImageUrl: product.imageUrl ?? null,
            specValues: (item.specValues ?? {}) as Record<string, string>,
            quantity: qty,
            unitPrice,
            subtotal: unitPrice * qty,
          });
        }

        const first = resolvedItems[0];
        const itemsSubtotal = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);

        const [newOrder] = await tx
          .insert(ordersTable)
          .values({
            productId: first.productId,
            storeId: (await tx.select({ storeId: productsTable.storeId }).from(productsTable).where(eq(productsTable.id, first.productId)).limit(1))[0].storeId,
            productName: first.productName,
            publicToken,
            buyerName: body.buyerName.trim(),
            buyerPhone: body.buyerPhone.trim(),
            pickupMethod: body.pickupMethod,
            notes: body.notes?.trim() || null,
            specValues: first.specValues,
            quantity: first.quantity,
            unitPrice: String(first.unitPrice),
            shippingFee: String(shippingFee),
            totalPrice: String(itemsSubtotal),
            status: "pending",
            cvsStoreId: hasCvs ? (body.cvsStoreId ?? null) : null,
            cvsStoreName: hasCvs ? (body.cvsStoreName ?? null) : null,
            cvsStoreAddress: hasCvs ? (body.cvsStoreAddress ?? null) : null,
            cvsStorePhone: hasCvs ? (body.cvsStorePhone ?? null) : null,
            storeSelectedBy: hasCvs ? "customer" : null,
            storeSelectedAt: hasCvs ? new Date() : null,
            recipientAddress: body.recipientAddress ?? null,
            recipientName: body.recipientName ?? null,
            recipientPhone: body.recipientPhone ?? null,
            items: resolvedItems as any,
          })
          .returning();

        if (!newOrder) throw new Error("Insert returned no row");
        return { order: newOrder, items: resolvedItems };
      });

      return res.status(201).json({
        publicToken: result.order.publicToken,
        pickupMethod: result.order.pickupMethod,
        createdAt: result.order.createdAt,
        shippingFee: parseFloat(result.order.shippingFee as string),
        totalPrice: parseFloat(result.order.totalPrice as string),
        items: result.items,
      });
    } catch (err: any) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 409) return res.status(409).json({ error: err.message });
      if (err.status === 422) return res.status(422).json({ error: err.message, message: err.displayMessage });
      if (err.code === "23505" && retries < 3) { retries++; continue; }
      throw err;
    }
  }
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
    recipientNameMasked: maskName(order.recipientName ?? order.buyerName ?? null),
    recipientPhoneMasked: maskPhone(order.recipientPhone ?? null),
    recipientAddressMasked: summarizeAddress(order.recipientAddress ?? null),
    items: (order.items as any[] | null) ?? null,
    createdAt: order.createdAt,
    // STRICTLY EXCLUDED (private / personal info):
    // internalNote, paymentNote, paidAmount, recipientPhone (full), recipientAddress (full),
    // shippingNote, recipientName (full), paymentMethod, paymentStatus, remainingAmount,
    // checkError, eventCode, rawData, cvsStoreId, cvsStoreName, cvsStoreAddress, cvsStorePhone,
    // storeSelectedBy, storeSelectedAt
  });
});

export default router;
