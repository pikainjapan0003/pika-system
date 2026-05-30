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

  const parsed = SubmitOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

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
    throw err;
  }
});

export default router;
