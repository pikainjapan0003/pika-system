import { rateLimit } from "express-rate-limit";

export const OWNER_STORE_MUTATION_RATE_LIMIT = 60;
export const OWNER_STORE_MUTATION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Shared owner-only guard for sensitive mutations and cleartext exports.
 * Routes must authenticate and verify store ownership before this middleware.
 */
export const ownerStoreMutationLimiter = rateLimit({
  windowMs: OWNER_STORE_MUTATION_WINDOW_MS,
  limit: OWNER_STORE_MUTATION_RATE_LIMIT,
  keyGenerator: (req) => String(req.params.storeId),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: "Too many requests, please try again later." });
  },
});
