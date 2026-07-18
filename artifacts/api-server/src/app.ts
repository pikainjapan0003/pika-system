import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.ts";
import router from "./routes/index.ts";
import { logger } from "./lib/logger.ts";
import { configureTrustProxy } from "./lib/trustProxy.ts";
import { configureSecurityHeaders } from "./lib/securityHeaders.ts";

const app: Express = express();
configureTrustProxy(app);
configureSecurityHeaders(app);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Silently deny: browser sees missing Allow-Origin and blocks the request
        callback(null, false);
      }
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// JSON 404 for unmatched routes — must be before the error handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — must be defined after all routes
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = err.status ?? err.statusCode ?? 500;
  const message = status < 500 ? (err.message ?? "Bad request") : "Internal server error";
  res.status(status).json({ error: message });
});

export default app;
