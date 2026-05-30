import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { UpdateOrderStatusBody } from "@workspace/api-zod";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/stores/:storeId/orders", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  const store = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (store.length === 0) return res.status(404).json({ error: "Store not found" });
  if (store[0].merchantId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  return res.json(orders.map(formatOrder));
});

router.get("/stores/:storeId/orders/export", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  const store = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (store.length === 0) return res.status(404).json({ error: "Store not found" });
  if (store[0].merchantId !== req.userId) return res.status(403).json({ error: "Forbidden" });

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

  const store = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
  if (store.length === 0 || store[0].merchantId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
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
    totalPrice: parseFloat(o.totalPrice),
  };
}

export default router;
