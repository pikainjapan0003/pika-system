import { Router } from "express";
import { PreviewPricingV2Body, PreviewPricingV2Params } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { resolvePricing, PricingResolutionError } from "../lib/pricingResolution.ts";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";

export const pricingPreviewBody = PreviewPricingV2Body;
const router = Router();
router.post("/stores/:storeId/pricing/preview", requireAuth, async (req: any, res) => {
  const params = PreviewPricingV2Params.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid storeId" });
  const { storeId } = params.data;
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  const parsed = pricingPreviewBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid preview input", details: parsed.error.issues });
  try {
    return res.json(await resolvePricing(db, storeId, parsed.data));
  } catch (error) {
    if (error instanceof PricingResolutionError) return res.status(error.status).json({ error: error.message });
    if (error instanceof TypeError || error instanceof RangeError) return res.status(400).json({ error: error.message });
    throw error;
  }
});
export default router;
