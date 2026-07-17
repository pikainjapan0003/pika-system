import { Router } from "express";

import { requireAuth } from "../middlewares/auth.ts";
import {
  defaultExchangeRateReferenceAdapters,
  fetchAllExchangeRateReferences,
  fetchFirstAvailableExchangeRateReference,
} from "../lib/exchangeRateReference.ts";

const router = Router();

router.get("/exchange-rate-reference/jpy", requireAuth, async (req, res) => {
  try {
    const quote = await fetchFirstAvailableExchangeRateReference(
      defaultExchangeRateReferenceAdapters,
    );
    return res.json(quote);
  } catch (error) {
    req.log.warn({ error }, "Exchange-rate reference is unavailable");
    return res.status(503).json({
      error: "REFERENCE_UNAVAILABLE",
      message: "參考匯率暫時無法取得，請自行填寫。",
    });
  }
});

router.get(
  "/exchange-rate-reference/jpy/compare",
  requireAuth,
  async (_req, res) => {
    const sources = await fetchAllExchangeRateReferences(
      defaultExchangeRateReferenceAdapters,
    );
    return res.json({
      currency: "JPY",
      quoteCurrency: "TWD",
      side: "spot_sell",
      sources,
    });
  },
);

export default router;
