import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, storesTable, productsTable } from "@workspace/db";
import { CreateProductBody, UpdateProductBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";

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

const verifyStoreOwner = async (req: any, res: any, storeId: number): Promise<boolean> => {
  const store = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (store.length === 0) {
    res.status(404).json({ error: "Store not found" });
    return false;
  }
  if (store[0].merchantId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
};

router.get("/stores/:storeId/products", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  return res.json(products.map(formatProduct));
});

router.post("/stores/:storeId/products", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const shareToken = randomBytes(12).toString("hex");

  const [product] = await db
    .insert(productsTable)
    .values({
      storeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: String(parsed.data.price),
      specs: parsed.data.specs ?? [],
      inventory: parsed.data.inventory ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      shareToken,
      isActive: true,
    })
    .returning();

  return res.status(201).json(formatProduct(product));
});

router.get("/stores/:storeId/products/:productId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const productId = parseInt(req.params.productId);
  if (isNaN(storeId) || isNaN(productId)) return res.status(400).json({ error: "Invalid id" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
    .limit(1);

  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json(formatProduct(product));
});

router.patch("/stores/:storeId/products/:productId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const productId = parseInt(req.params.productId);
  if (isNaN(storeId) || isNaN(productId)) return res.status(400).json({ error: "Invalid id" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  if (parsed.data.specs !== undefined) updateData.specs = parsed.data.specs;
  if (parsed.data.inventory !== undefined) updateData.inventory = parsed.data.inventory;
  if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(productsTable)
    .set(updateData)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Product not found" });
  return res.json(formatProduct(updated));
});

router.delete("/stores/:storeId/products/:productId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const productId = parseInt(req.params.productId);
  if (isNaN(storeId) || isNaN(productId)) return res.status(400).json({ error: "Invalid id" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)));

  return res.status(204).send();
});

function formatProduct(p: any) {
  return {
    ...p,
    price: parseFloat(p.price),
    specs: p.specs ?? [],
  };
}

export default router;
