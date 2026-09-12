// Explicit mock-only preview of the original app; never starts the API server.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installClerkStub } from "./clerkStub.mjs";
import { readMock } from "./calculator-mocks.mjs";
const shop = fileURLToPath(new URL("../artifacts/shop-app/", import.meta.url));
const require = createRequire(
  new URL("../artifacts/shop-app/package.json", import.meta.url),
);
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const port = Number(process.env.CALCULATOR_PORT || "4317");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local preview port");
process.env.PORT = String(port);
const basePath = process.env.CALCULATOR_BASE_PATH || "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))
  throw new Error("Invalid local preview base path");
process.env.BASE_PATH = basePath;
process.env.VITE_CLERK_PUBLISHABLE_KEY = "pk_test_ZXhhbXBsZS5jb20k";
process.env.VITE_CLERK_PROXY_URL = `http://127.0.0.1:${port}/api/__clerk`;
let clerkScript;
await installClerkStub({
  addInitScript: async () => {},
  route: async (_pattern, handler) =>
    handler({
      fulfill: async ({ body }) => {
        clerkScript = body;
      },
    }),
});
const server = await createServer({
  root: shop,
  cacheDir:
    basePath === "/"
      ? undefined
      : shop + "node_modules/.vite-calculator-prefix",
  configFile: shop + "vite.config.ts",
  server: { host: "127.0.0.1", port, strictPort: true },
  plugins: [
    {
      name: "calculator-local-mock-only",
      enforce: "pre",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => ({
          // Keep this mock preview offline, including the baseline font links.
          html: html.replace(
            /<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"<>]*"[^>]*>/g,
            "",
          ),
          tags: [
            {
              tag: "script",
              // Preload the existing test stub before React starts. Clerk otherwise
              // normalizes its proxy script URL to HTTPS, which this HTTP preview
              // deliberately does not serve. This plugin is absent from builds.
              children: `window.__codexClerkStubOptions??={signedIn:true};window.__clerk_publishable_key=${JSON.stringify(process.env.VITE_CLERK_PUBLISHABLE_KEY)};${clerkScript}`,
              injectTo: "head-prepend",
            },
            {
              tag: "div",
              attrs: {
                id: "calculator-preview-banner",
                style:
                  "padding:8px 16px;text-align:center;background:#fef3c7;color:#78350f;font:12px sans-serif;",
              },
              children: "本機 MOCK 驗收預覽 · 模擬登入與店鋪 · 不連接正式資料",
              injectTo: "body-prepend",
            },
          ],
        }),
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const path = new URL(request.url, "http://127.0.0.1").pathname;
          if (!path.startsWith("/api/")) return next();
          if (path.includes("clerk.browser.js")) {
            response.setHeader("Content-Type", "application/javascript");
            response.end(clerkScript);
            return;
          }
          response.setHeader("Content-Type", "application/json");
          if (request.method !== "GET") {
            console.error(
              "MOCK blocked business-write intent:",
              request.method,
              path,
            );
            response.statusCode = 405;
            response.end(JSON.stringify({ error: "Preview is read-only" }));
            return;
          }
          response.end(JSON.stringify(readMock(path)));
        });
      },
    },
  ],
});
await server.listen();
console.log(
  `MOCK calculator preview: http://127.0.0.1:${port}${basePath}calculator`,
);
