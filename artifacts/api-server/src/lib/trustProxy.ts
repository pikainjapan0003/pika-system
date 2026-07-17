import type { Express } from "express";

/**
 * Replit terminates public traffic at one reverse proxy before forwarding it
 * to this Express process. Trust exactly that hop so req.ip and rate limiting
 * use the forwarded client address without accepting an arbitrary left-most
 * X-Forwarded-For value (which `trust proxy = true` would allow).
 */
export const TRUSTED_REVERSE_PROXY_HOPS = 1;

export function configureTrustProxy(app: Express): void {
  app.set("trust proxy", TRUSTED_REVERSE_PROXY_HOPS);
}
