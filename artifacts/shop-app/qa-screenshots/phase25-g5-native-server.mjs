import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import vm from "node:vm";

const [distArgument, portArgument = "4175"] = process.argv.slice(2);

if (!distArgument) {
  throw new Error(
    "Usage: node phase25-g5-native-server.mjs <dist-directory> [port]",
  );
}

const distDirectory = resolve(distArgument);
const port = Number(portArgument);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${portArgument}`);
}

const captureSource = await readFile(
  new URL("./phase25-g5-motion.capture.mjs", import.meta.url),
  "utf8",
);
const fixtureStart = captureSource.indexOf("const ESTIMATE_SUMMARY");
const fixtureEnd = captureSource.indexOf("\nasync function installMocks");

if (fixtureStart < 0 || fixtureEnd < fixtureStart) {
  throw new Error("Could not load the G5 API fixtures from the capture script");
}

const fixtureContext = { URL };
vm.runInNewContext(
  `${captureSource.slice(fixtureStart, fixtureEnd)}\nthis.apiResponse = apiResponse;`,
  fixtureContext,
);

const apiResponse = fixtureContext.apiResponse;

const clerkStub = String.raw`
<script>
window.__codexClerkStubOptions = {
  signedIn: true,
  userId: "user_e2e_merchant",
};
class ClerkStub {
  constructor(key) {
    const options = window.__codexClerkStubOptions;
    this.user = options.signedIn
      ? { id: options.userId, organizationMemberships: [] }
      : null;
    this.session = this.user
      ? {
          id: "session_e2e_merchant",
          status: "active",
          user: this.user,
          lastActiveToken: { jwt: { claims: {} } },
          factorVerificationAge: null,
          getToken: async () => "e2e-owner-token",
        }
      : null;
    this.publishableKey = key;
    this.loaded = true;
    this.status = "ready";
    this.client = { signIn: {}, signUp: {} };
    this.organization = null;
    this.listeners = new Map();
    this.isSignedIn = this.session !== null;
    this.__internal_lastEmittedResources = this.resources();
  }

  resources() {
    return {
      user: this.user,
      session: this.session,
      client: this.client,
      organization: this.organization,
    };
  }

  async load() {
    this.loaded = true;
    for (const listener of this.listeners.get("status") ?? []) {
      listener("ready");
    }
  }

  addListener(callback) {
    callback(this.resources());
    return () => {};
  }

  on(event, callback, options) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback);
    this.listeners.set(event, listeners);
    if (event === "status" && options?.notify === true) {
      callback("ready");
    }
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    listeners?.delete(callback);
    if (listeners?.size === 0) {
      this.listeners.delete(event);
    }
  }
}
window.Clerk = new ClerkStub(window.__clerk_publishable_key);
</script>`;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function resolveStaticPath(url) {
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = resolve(distDirectory, `.${decodedPath}`);
  const withinDist =
    requestedPath === distDirectory ||
    requestedPath.startsWith(`${distDirectory}${sep}`);

  if (!withinDist) return null;

  try {
    if ((await stat(requestedPath)).isFile()) return requestedPath;
  } catch {
    // SPA routes intentionally fall through to index.html.
  }

  return resolve(distDirectory, "index.html");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (url.pathname.startsWith("/api/__clerk/")) {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const value = apiResponse(url);
      if (value === undefined) {
        sendJson(response, 500, {
          error: `G5 native mock missing: ${url.pathname}`,
        });
        return;
      }
      sendJson(response, 200, value);
      return;
    }

    const filePath = await resolveStaticPath(url);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const extension = extname(filePath);
    response.setHeader("cache-control", "no-store");
    response.setHeader(
      "content-type",
      contentTypes.get(extension) ?? "application/octet-stream",
    );

    if (extension === ".html") {
      const html = await readFile(filePath, "utf8");
      response.end(html.replace("</head>", `${clerkStub}\n</head>`));
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`G5 native evidence server: http://127.0.0.1:${port}`);
  console.log(`Static build: ${distDirectory}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
