import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { calculateProductUnitProfit, db, productsTable, productCategoriesTable } from "@workspace/db";
import { CreateProductBody, UpdateProductBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { loadOrderProfitSnapshotInput } from "../lib/orderProfitSnapshot.ts";
import { formatProductEstimatedProfit } from "../lib/productEstimatedProfit.ts";

const router = Router();

async function assertCategoryBelongsToStore(storeId: number, categoryId: number): Promise<boolean> {
  const [cat] = await db
    .select({ id: productCategoriesTable.id })
    .from(productCategoriesTable)
    .where(and(eq(productCategoriesTable.id, categoryId), eq(productCategoriesTable.storeId, storeId)))
    .limit(1);
  return !!cat;
}

router.get("/stores/:storeId/products", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const productsWithEstimatedProfit = await Promise.all(
    products.map(async (product) => {
      const input = await loadOrderProfitSnapshotInput(db, product, product.price);
      return {
        ...formatProduct(product),
        estimatedProfit: formatProductEstimatedProfit(calculateProductUnitProfit(input)),
      };
    }),
  );
  return res.json(productsWithEstimatedProfit);
});

router.post("/stores/:storeId/products", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  if (parsed.data.categoryId != null) {
    if (!(await assertCategoryBelongsToStore(storeId, parsed.data.categoryId))) {
      return res.status(400).json({ error: "Invalid categoryId" });
    }
  }

  const shareToken = randomBytes(12).toString("hex");

  try {
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
        orderDeadlineAt: parsed.data.orderDeadlineAt ?? null,
        internalNote: parsed.data.internalNote ?? null,
        skuCode: parsed.data.skuCode ?? null,
        storageTemp: parsed.data.storageTemp ?? null,
        shelfLife: parsed.data.shelfLife ?? null,
        weightKg: parsed.data.weightKg != null ? String(parsed.data.weightKg) : null,
        categoryId: parsed.data.categoryId ?? null,
        costJpy: parsed.data.costJpy != null ? String(parsed.data.costJpy) : null,
        isTransportCostExempt: parsed.data.isTransportCostExempt ?? false,
        tripRouteId: parsed.data.tripRouteId ?? null,
      })
      .returning();

    return res.status(201).json(formatProduct(product));
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(400).json({ error: "Invalid tripRouteId" });
    }
    throw err;
  }
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

  if (parsed.data.categoryId != null) {
    if (!(await assertCategoryBelongsToStore(storeId, parsed.data.categoryId))) {
      return res.status(400).json({ error: "Invalid categoryId" });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  if (parsed.data.specs !== undefined) updateData.specs = parsed.data.specs;
  if (parsed.data.inventory !== undefined) updateData.inventory = parsed.data.inventory;
  if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.orderDeadlineAt !== undefined) updateData.orderDeadlineAt = parsed.data.orderDeadlineAt;
  if (parsed.data.internalNote !== undefined) updateData.internalNote = parsed.data.internalNote;
  if (parsed.data.skuCode !== undefined) updateData.skuCode = parsed.data.skuCode;
  if (parsed.data.storageTemp !== undefined) updateData.storageTemp = parsed.data.storageTemp;
  if (parsed.data.shelfLife !== undefined) updateData.shelfLife = parsed.data.shelfLife;
  if (parsed.data.weightKg !== undefined) updateData.weightKg = parsed.data.weightKg != null ? String(parsed.data.weightKg) : null;
  if (parsed.data.categoryId !== undefined) updateData.categoryId = parsed.data.categoryId;
  if (parsed.data.costJpy !== undefined) updateData.costJpy = parsed.data.costJpy != null ? String(parsed.data.costJpy) : null;
  if (parsed.data.isTransportCostExempt !== undefined) updateData.isTransportCostExempt = parsed.data.isTransportCostExempt;
  if (parsed.data.tripRouteId !== undefined) updateData.tripRouteId = parsed.data.tripRouteId;

  try {
    const [updated] = await db
      .update(productsTable)
      .set(updateData)
      .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Product not found" });
    return res.json(formatProduct(updated));
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(400).json({ error: "Invalid tripRouteId" });
    }
    throw err;
  }
});

router.delete("/stores/:storeId/products/:productId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const productId = parseInt(req.params.productId);
  if (isNaN(storeId) || isNaN(productId)) return res.status(400).json({ error: "Invalid id" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  try {
    await db
      .delete(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)));

    return res.status(204).send();
  } catch (err: any) {
    // Postgres FK violation: orders still reference this product
    if (err?.code === "23503") {
      return res.status(409).json({
        error: "此商品有歷史訂單，無法刪除。請改為將商品設為下架。",
      });
    }
    throw err;
  }
});

function formatProduct(p: any) {
  return {
    ...p,
    price: parseFloat(p.price),
    weightKg: p.weightKg != null ? parseFloat(p.weightKg) : null,
    costJpy: p.costJpy != null ? parseFloat(p.costJpy) : null,
    specs: p.specs ?? [],
  };
}

export default router;
