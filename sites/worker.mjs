// The Worker carries no database/client identity authority. Express still verifies Clerk.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      let origin;
      try {
        origin = new URL(env.PIKA_POC_API_ORIGIN);
        if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || !env.PIKA_POC_PROXY_SECRET || env.PIKA_POC_PROXY_SECRET.length < 32) throw new Error();
      } catch { return Response.json({ error: "Private POC API unavailable" }, { status: 503 }); }
      // Concatenate onto a fixed trusted origin; no caller-controlled host, cookies,
      // gateway key, forwarded IP/host, or redirect following reaches the upstream.
      const headers = new Headers({ "x-pika-poc-key": env.PIKA_POC_PROXY_SECRET });
      for (const name of ["authorization", "content-type", "x-client-request-id", "x-confirm-store-credit", "x-confirm-cleartext-export"]) {
        if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      }
      try {
        const isOcrAnalyze = request.method === "POST" && /^\/api\/stores\/\d+\/invoice-ocr\/test-cases\/\d+\/analyze$/.test(url.pathname);
        const upstream = await fetch(origin.origin + url.pathname + url.search, {
          method: request.method, headers, redirect: "manual", signal: AbortSignal.timeout(isOcrAnalyze ? 140000 : 25000),
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
          duplex: "half",
        });
        if (upstream.status >= 300 && upstream.status < 400) return Response.json({ error: "Unexpected API redirect" }, { status: 502 });
        return new Response(upstream.body, { status: upstream.status, headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store", "x-content-type-options": "nosniff",
        } });
      } catch { return Response.json({ error: "Private POC API unavailable" }, { status: 502 }); }
    }
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    if (!request.headers.get("accept")?.includes("text/html")) return asset;
    // SPA deep links (/p, /track, /products) must load the existing Vite app.
    // ASSETS canonicalizes /index.html to a redirect. Fetch / internally so the
    // browser keeps its requested deep link when opening or refreshing a page.
    url.pathname = "/";
    url.search = "";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
