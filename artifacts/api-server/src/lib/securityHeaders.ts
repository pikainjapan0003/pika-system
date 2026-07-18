import type { Express } from "express";

export const PUBLIC_RESPONSE_SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Apply conservative headers before logging, auth, and route middleware. */
export function configureSecurityHeaders(app: Express): void {
  app.use((_req, response, next) => {
    for (const [name, value] of Object.entries(
      PUBLIC_RESPONSE_SECURITY_HEADERS,
    )) {
      response.setHeader(name, value);
    }
    next();
  });
}
