import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, productCategoriesTable } from "@workspace/db";
import { CreateProductCategoryBody } from "@workspace/api-zod";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth";

const router = Router();

router.get("/stores/:storeId/categories", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const categories = await db
    .select()
    .from(productCategoriesTable)
    .where(eq(productCategoriesTable.storeId, storeId))
    .orderBy(asc(productCategoriesTable.name));

  return res.json(categories);
});

router.post("/stores/:storeId/categories", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = CreateProductCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const name = parsed.data.name.trim();
  if (!name) {
    return res.status(400).json({ error: "Name cannot be empty" });
  }

  try {
    const [category] = await db
      .insert(productCategoriesTable)
      .values({ storeId, name })
      .returning();

    return res.status(201).json(category);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "此分類名稱已存在" });
    }
    throw err;
  }
});

router.delete("/stores/:storeId/categories/:categoryId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const categoryId = parseInt(req.params.categoryId);
  if (isNaN(storeId) || isNaN(categoryId)) return res.status(400).json({ error: "Invalid id" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const [deleted] = await db
    .delete(productCategoriesTable)
    .where(and(eq(productCategoriesTable.id, categoryId), eq(productCategoriesTable.storeId, storeId)))
    .returning({ id: productCategoriesTable.id });

  if (!deleted) return res.status(404).json({ error: "Category not found" });
  return res.status(204).send();
});

export default router;
