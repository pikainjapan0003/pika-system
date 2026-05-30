import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, productsTable, ordersTable } from "@workspace/db";
import { SubmitOrderBody } from "@workspace/api-zod";

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
  });
});

router.post("/p/:shareToken/orders", async (req, res) => {
  const { shareToken } = req.params;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.shareToken, shareToken))
    .limit(1);

  if (!product || !product.isActive) {
    return res.status(404).json({ error: "Product not found" });
  }

  const parsed = SubmitOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const unitPrice = parseFloat(product.price as string);
  const totalPrice = unitPrice * parsed.data.quantity;

  const [order] = await db
    .insert(ordersTable)
    .values({
      productId: product.id,
      storeId: product.storeId,
      productName: product.name,
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

  return res.status(201).json({
    ...order,
    unitPrice: parseFloat(order.unitPrice as string),
    totalPrice: parseFloat(order.totalPrice as string),
  });
});

export default router;
