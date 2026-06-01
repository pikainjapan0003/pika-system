import { Router } from "express";
import { eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { db, storesTable, productsTable, ordersTable } from "@workspace/db";
import { SubmitOrderBody } from "@workspace/api-zod";

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
  });
});

router.post("/p/:shareToken/orders", submitOrderLimiter, async (req, res) => {
  const shareToken = req.params.shareToken as string;

  const parsed = SubmitOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

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
        const totalPrice = unitPrice * parsed.data.quantity;

        // Decrement inventory only when it is being tracked (not null)
        if (product.inventory !== null) {
          await tx
            .update(productsTable)
            .set({ inventory: product.inventory - parsed.data.quantity })
            .where(eq(productsTable.id, product.id));
        }

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
            totalPrice: String(totalPrice),
            status: "pending",
          })
          .returning();

        if (!newOrder) throw new Error("Insert returned no row");
        return newOrder;
      });

      return res.status(201).json({
        ...order,
        unitPrice: parseFloat(order.unitPrice as string),
        totalPrice: parseFloat(order.totalPrice as string),
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

  return res.json({
    publicToken: order.publicToken,
    productName: order.productName,
    quantity: order.quantity,
    unitPrice: parseFloat(order.unitPrice as string),
    totalPrice: parseFloat(order.totalPrice as string),
    pickupMethod: order.pickupMethod,
    specValues: order.specValues ?? {},
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    createdAt: order.createdAt,
  });
});

export default router;
