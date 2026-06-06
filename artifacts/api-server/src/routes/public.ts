import { Router } from "express";
import { eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { db, storesTable, productsTable, ordersTable } from "@workspace/db";
import { SubmitOrderBody } from "@workspace/api-zod";


const SHIPPING_FEE_MAP: Record<string, number> = {
  "面交": 0,
  "7-11 貨到付款": 60,
  "7-11 取貨（先付款）": 60,
  "全家貨到付款": 60,
  "全家取貨（先付款）": 60,
  "黑貓宅急便": 100,
  "郵局": 80,
  // Deprecated (kept for backward compat with old orders)
  "宅配": 100,
  "OK Mart": 60,
  "萊爾富物流": 60,
};

function getShippingFee(pickupMethod: string, overrideShippingFee?: number): number {
  if (overrideShippingFee !== undefined) return overrideShippingFee;
  return SHIPPING_FEE_MAP[pickupMethod] ?? 0;
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
        const subtotal = unitPrice * parsed.data.quantity;
        const totalPrice = subtotal + shippingFee;

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

  const shippingFee = parseFloat(order.shippingFee as string ?? "0");
  const totalPrice = parseFloat(order.totalPrice as string);
  return res.json({
    publicToken: order.publicToken,
    productName: order.productName,
    quantity: order.quantity,
    unitPrice: parseFloat(order.unitPrice as string),
    shippingFee,
    totalPrice,
    orderTotal: totalPrice + shippingFee,
    pickupMethod: order.pickupMethod,
    specValues: order.specValues ?? {},
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    shippingStatus: order.shippingStatus ?? "not_shipped",
    shippingStatusLabel: SHIPPING_STATUS_LABELS[order.shippingStatus ?? "not_shipped"] ?? order.shippingStatus,
    trackingCode: order.trackingCode ?? null,
    trackingProvider: order.trackingProvider ?? null,
    createdAt: order.createdAt,
    // STRICTLY EXCLUDED (private / personal info):
    // internalNote, paymentNote, paidAmount, recipientPhone, recipientAddress,
    // shippingNote, recipientName, paymentMethod, paymentStatus, remainingAmount
  });
});

export default router;
