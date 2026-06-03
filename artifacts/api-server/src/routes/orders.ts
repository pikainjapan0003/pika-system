import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, ordersTable, productsTable } from "@workspace/db";
import type { OrderStatus } from "@workspace/db";
import { CreateMerchantOrderBody, UpdateOrderBody, UpdateOrderStatusBody } from "@workspace/api-zod";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";
import { isValidTransition, getTransitionError } from "../lib/orderStatusMachine";

const router = Router();

router.get("/stores/:storeId/orders", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  return res.json(orders.map(formatOrder));
});

router.post("/stores/:storeId/orders", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = CreateMerchantOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const { productId, buyerName, buyerPhone, quantity, pickupMethod, notes, specValues } = parsed.data;

  let retries = 0;
  while (retries <= 3) {
    const publicToken = randomBytes(16).toString("hex");
    try {
      const order = await db.transaction(async (tx) => {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
          .limit(1);

        if (!product) {
          const err = new Error("Product not found") as any;
          err.status = 404;
          throw err;
        }

        const unitPrice = parseFloat(product.price as string);
        const totalPrice = unitPrice * quantity;

        const [newOrder] = await tx
          .insert(ordersTable)
          .values({
            productId: product.id,
            storeId,
            productName: product.name,
            publicToken,
            buyerName,
            buyerPhone,
            pickupMethod,
            notes: notes ?? null,
            specValues: specValues ?? {},
            quantity,
            unitPrice: String(unitPrice),
            totalPrice: String(totalPrice),
            status: "pending",
          })
          .returning();

        if (!newOrder) throw new Error("Insert returned no row");
        return newOrder;
      });

      return res.status(201).json(formatOrder(order));
    } catch (err: any) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.code === "23505" && retries < 3) {
        retries++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to generate unique publicToken after retries");
});

router.patch("/orders/:orderId", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  if (order.status === "completed" || order.status === "cancelled") {
    return res.status(422).json({ error: "Cannot edit a completed or cancelled order" });
  }

  const { buyerName, buyerPhone, quantity, pickupMethod, notes, specValues } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (buyerName !== undefined) updates.buyerName = buyerName;
  if (buyerPhone !== undefined) updates.buyerPhone = buyerPhone;
  if (pickupMethod !== undefined) updates.pickupMethod = pickupMethod;
  if (notes !== undefined) updates.notes = notes;
  if (specValues !== undefined) updates.specValues = specValues;
  if (quantity !== undefined) {
    updates.quantity = quantity;
    const existingUnitPrice = parseFloat(order.unitPrice as string);
    updates.totalPrice = String(existingUnitPrice * quantity);
  }

  if (Object.keys(updates).length === 0) {
    return res.json(formatOrder(order));
  }

  const [updated] = await db
    .update(ordersTable)
    .set(updates)
    .where(eq(ordersTable.id, orderId))
    .returning();

  return res.json(formatOrder(updated));
});

router.get("/stores/:storeId/orders/export", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  const headers = ["訂單編號", "商品名稱", "買家姓名", "買家電話", "取貨方式", "數量", "單價", "總金額", "狀態", "備註", "規格", "下單時間"];

  const statusLabels: Record<string, string> = {
    pending: "待確認",
    awaiting_payment: "待付款",
    preparing: "備貨中",
    shipped: "已出貨",
    completed: "已完成",
    cancelled: "已取消",
  };

  const rows = orders.map((o) => [
    o.id,
    o.productName ?? "",
    o.buyerName,
    o.buyerPhone,
    o.pickupMethod,
    o.quantity,
    parseFloat(o.unitPrice as string).toFixed(2),
    parseFloat(o.totalPrice as string).toFixed(2),
    statusLabels[o.status] ?? o.status,
    o.notes ?? "",
    o.specValues ? JSON.stringify(o.specValues) : "",
    o.createdAt?.toISOString() ?? "",
  ]);

  const csvLines = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const bom = "\uFEFF";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders_${storeId}.csv"`);
  return res.send(bom + csvLines);
});

router.patch("/orders/:orderId/status", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  const currentStatus = order.status as OrderStatus;
  const nextStatus = parsed.data.status as OrderStatus;
  if (!isValidTransition(currentStatus, nextStatus)) {
    return res.status(422).json({ error: getTransitionError(currentStatus, nextStatus) });
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status })
    .where(eq(ordersTable.id, orderId))
    .returning();

  return res.json(formatOrder(updated));
});

function formatOrder(o: any) {
  return {
    ...o,
    unitPrice: parseFloat(o.unitPrice),
    shippingFee: parseFloat(o.shippingFee ?? "0"),
    totalPrice: parseFloat(o.totalPrice),
    storeSelectedAt: o.storeSelectedAt?.toISOString() ?? null,
  };
}

export default router;
