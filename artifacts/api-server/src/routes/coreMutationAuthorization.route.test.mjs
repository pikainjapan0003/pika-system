/**
 * BATCH-19 authorization regression coverage for core owner mutations that
 * previously had no explicit negative route test. All rows are synthetic and
 * the suite skips unless CI supplies its disposable DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "core mutation authorization requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_A = "batch19_auth_merchant_a";
  const MERCHANT_B = "batch19_auth_merchant_b";

  mock.module("@clerk/express", {
    namedExports: {
      getAuth: (req) => {
        const userId = req.headers?.["x-test-user-id"] ?? null;
        return { userId, sessionClaims: userId ? { userId } : undefined };
      },
      clerkMiddleware: () => (_req, _res, next) => next(),
    },
  });

  const { default: express } = await import("express");
  const { db, pool, storesTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { default: categoriesRouter } = await import("./categories.ts");
  const { default: productsRouter } = await import("./products.ts");
  const { default: storesRouter } = await import("./stores.ts");
  const { default: uploadRouter } = await import("./upload.ts");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use("/api", storesRouter);
  app.use("/api", productsRouter);
  app.use("/api", categoriesRouter);
  app.use("/api", uploadRouter);

  let server;
  let baseUrl;
  let storeAId;
  let storeBId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [storeA, storeB] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: MERCHANT_A,
          name: "BATCH-19 fake store A",
          slug: `batch19-auth-a-${suffix}`,
        },
        {
          merchantId: MERCHANT_B,
          name: "BATCH-19 fake store B",
          slug: `batch19-auth-b-${suffix}`,
        },
      ])
      .returning();
    storeAId = storeA.id;
    storeBId = storeB.id;
  });

  after(async () => {
    if (storeAId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeAId));
    }
    if (storeBId) {
      await db.delete(storesTable).where(eq(storesTable.id, storeBId));
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(method, path, { body, userId = MERCHANT_A } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const contentType = response.headers.get("content-type") ?? "";
    return {
      status: response.status,
      data: contentType.includes("json")
        ? await response.json()
        : await response.text(),
    };
  }

  test("store creation rejects an unauthenticated request", async () => {
    const response = await request("POST", "/stores", {
      userId: null,
      body: { name: "Unauthorized fake store", slug: "never-created" },
    });
    assert.equal(response.status, 401);
  });

  test("store updates reject a merchant from another store", async () => {
    const response = await request("PATCH", `/stores/${storeBId}`, {
      body: { name: "Cross-store update must fail" },
    });
    assert.equal(response.status, 403);
  });

  test("product mutations enforce authentication and store ownership", async () => {
    const unauthenticated = await request(
      "POST",
      `/stores/${storeAId}/products`,
      { userId: null, body: {} },
    );
    assert.equal(unauthenticated.status, 401);

    const create = await request("POST", `/stores/${storeBId}/products`, {
      body: {},
    });
    assert.equal(create.status, 403);

    const update = await request(
      "PATCH",
      `/stores/${storeBId}/products/999999999`,
      { body: {} },
    );
    assert.equal(update.status, 403);

    const remove = await request(
      "DELETE",
      `/stores/${storeBId}/products/999999999`,
    );
    assert.equal(remove.status, 403);
  });

  test("category mutations reject a merchant from another store", async () => {
    const create = await request("POST", `/stores/${storeBId}/categories`, {
      body: {},
    });
    assert.equal(create.status, 403);

    const update = await request(
      "PATCH",
      `/stores/${storeBId}/categories/999999999`,
      { body: {} },
    );
    assert.equal(update.status, 403);

    const remove = await request(
      "DELETE",
      `/stores/${storeBId}/categories/999999999`,
    );
    assert.equal(remove.status, 403);
  });

  test("image upload rejects cross-store access before storage work", async () => {
    const response = await request(
      "POST",
      `/stores/${storeBId}/products/image`,
      { body: {} },
    );
    assert.equal(response.status, 403);
  });
}
