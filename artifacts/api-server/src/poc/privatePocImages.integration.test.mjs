import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_image_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-image-test-gateway-32-characters";
// Only the test process replaces Clerk and R2; ownership uses real test PG.
mock.module("@clerk/express", { namedExports: {
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const objects = new Map();
const commands = [];
const publicUrl = "https://synthetic.example.test/api/poc/images";
mock.module("../lib/r2.ts", { namedExports: { getR2Config: () => ({
  bucket: "synthetic-poc-images", publicUrl,
  client: { send: async command => {
    commands.push(command.input);
    assert.equal(command.input.Bucket, "synthetic-poc-images");
    if (command.constructor.name === "PutObjectCommand") {
      objects.set(command.input.Key, Buffer.from(command.input.Body));
      return {};
    }
    assert.equal(command.constructor.name, "GetObjectCommand");
    const body = objects.get(command.input.Key);
    if (!body) throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
    return { ContentLength: body.length, Body: { transformToByteArray: async () => body } };
  } },
}) } });

const { db, pool, storesTable, productsTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: express } = await import("express");
const { default: uploadRouter } = await import("../routes/upload.ts");
const { privatePocBoundary } = await import("../lib/privatePoc.ts");
const app = express();
app.use(privatePocBoundary);
app.use("/api", uploadRouter);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let server, origin, store, imageUrl;
async function start() {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
}
function headers({ owner = true, gateway = true } = {}) {
  return {
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(owner ? { "x-test-clerk-user": owner === true ? process.env.PIKA_OWNER_CLERK_USER_ID : owner } : {}),
  };
}
async function upload({ owner = true, gateway = true, storeId = store.id, type = "image/png", bytes = png } = {}) {
  const body = new FormData();
  body.append("image", new Blob([bytes], { type }), "synthetic.png");
  return fetch(`${origin}/api/stores/${storeId}/products/image`, { method: "POST", headers: headers({ owner, gateway }), body });
}
const read = (path, gateway = true) => fetch(origin + path, { headers: headers({ owner: false, gateway }) });
before(async () => {
  [store] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
    name: "合成圖片測試", slug: `poc-images-${randomUUID()}` }).returning();
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  await start();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (store) {
    await db.delete(productsTable).where(eq(productsTable.storeId, store.id));
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
  await pool.end();
});

test("gateway, explicit owner and correct store are required before any upload", async () => {
  assert.equal((await upload({ gateway: false })).status, 403);
  assert.equal((await upload({ owner: false })).status, 401);
  assert.equal((await upload({ owner: "user_other" })).status, 403);
  assert.equal((await upload({ storeId: store.id + 1 })).status, 403);
  assert.equal(commands.length, 0);
});

test("existing upload format and 5 MiB limits reject invalid inputs before R2", async () => {
  assert.equal((await upload({ type: "image/svg+xml" })).status, 400);
  assert.equal((await upload({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) })).status, 400);
  assert.equal(commands.length, 0);
});

test("owner uploads and PG preserves a stable URL; the private image route returns exact bytes", async () => {
  const response = await upload();
  assert.equal(response.status, 201);
  imageUrl = (await response.json()).imageUrl;
  assert.match(imageUrl, new RegExp(`^${publicUrl}/products/${store.id}/[0-9]{13}-[a-f0-9]{16}\\.png$`));
  assert.equal(new URL(imageUrl).search, "", "do not persist an expiring signed URL");
  const [product] = await db.insert(productsTable).values({ storeId: store.id, name: "合成圖片商品",
    price: "100.00", inventory: 1, shareToken: randomUUID(), imageUrl }).returning();
  assert.equal((await db.select().from(productsTable).where(eq(productsTable.id, product.id)))[0].imageUrl, imageUrl);
  const result = await read(new URL(imageUrl).pathname);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "image/png");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
});

test("read rejects missing gateway, other stores, arbitrary keys and missing objects", async () => {
  const path = new URL(imageUrl).pathname;
  assert.equal((await read(path, false)).status, 403);
  const before = commands.length;
  assert.equal((await read(path.replace(`/products/${store.id}/`, `/products/${store.id + 1}/`))).status, 404);
  assert.equal((await read(`/api/poc/images/products/${store.id}/secret.env`)).status, 404);
  assert.equal(commands.length, before);
  assert.equal((await read(`/api/poc/images/products/${store.id}/1234567890123-0000000000000000.png`)).status, 404);
  const result = await read(path + "?bucket=unrelated&url=https%3A%2F%2Fexample.test");
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), png, "query input cannot select another bucket or URL");
});

test("restarting the HTTP server preserves resolution and non-POC deployments do not expose this route", async () => {
  await new Promise(resolve => server.close(resolve));
  await start();
  assert.deepEqual(Buffer.from(await (await read(new URL(imageUrl).pathname)).arrayBuffer()), png);
  process.env.PIKA_PRIVATE_POC = "false";
  try { assert.equal((await read(new URL(imageUrl).pathname, false)).status, 404); }
  finally { process.env.PIKA_PRIVATE_POC = "true"; }
});
