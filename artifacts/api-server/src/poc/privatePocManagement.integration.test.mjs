import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
assert.equal(new URL(process.env.DATABASE_URL).hostname, "db");
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.PIKA_PRIVATE_POC = "true";
process.env.PIKA_OWNER_CLERK_USER_ID = "user_poc_management_owner";
process.env.PIKA_POC_PROXY_SECRET = "synthetic-management-gateway-key-32-characters";
mock.module("@clerk/express", { namedExports: {
  clerkMiddleware: () => (_req, _res, next) => next(),
  getAuth: req => ({ userId: req.headers["x-test-clerk-user"] ?? null }),
} });
const { db, pool, storesTable, customersTable, tripsTable, tripRoutesTable, storeSkillStatesTable, auditLogsTable } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: app } = await import("../app.ts");
let server, origin, store, decoy, customer, otherCustomer, trip, route;
const storeIds = [], tripIds = [], protectedTrips = [], protectedRoutes = [];
const customerInput = { code: "POC-MANAGE", name: "合成客戶", phone: "0900000000", tier: "general" };
const routeInput = { areaTitle: "合成區域", startPlace: "合成起點", endPlace: "合成終點", estQty: 10,
  trainJpy: 100, fuelJpy: 0, parkingJpy: 0, etcJpy: 100, cardboardJpy: 0, shippingJpy: 0, parcelCount: 0 };
const start = async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api`;
};
async function request(method, path, body, { user = process.env.PIKA_OWNER_CLERK_USER_ID, gateway = true } = {}) {
  const response = await fetch(origin + path, { method, headers: {
    "content-type": "application/json",
    ...(gateway ? { "x-pika-poc-key": process.env.PIKA_POC_PROXY_SECRET } : {}),
    ...(user ? { "x-test-clerk-user": user } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  // First row is deliberately not the designated store, even with the same owner.
  for (const name of ["decoy", "designated"]) {
    const [created] = await db.insert(storesTable).values({ merchantId: process.env.PIKA_OWNER_CLERK_USER_ID,
      name: `合成管理 ${name}`, slug: `poc-management-${name}-${randomUUID()}` }).returning();
    storeIds.push(created.id);
    if (name === "decoy") decoy = created; else store = created;
  }
  process.env.PIKA_OWNER_STORE_ID = String(store.id);
  [otherCustomer] = await db.insert(customersTable).values({ storeId: decoy.id, ...customerInput }).returning();
  for (const ownerId of [decoy.id, null]) {
    const [created] = await db.insert(tripsTable).values({ storeId: ownerId, name: "不可認領的合成行程" }).returning();
    tripIds.push(created.id); protectedTrips.push(created);
    const [child] = await db.insert(tripRoutesTable).values({ storeId: ownerId, tripId: created.id,
      areaTitle: "不可認領的合成路線", startPlace: "假起點", endPlace: "假終點", estQty: 1 }).returning();
    protectedRoutes.push(child);
  }
  // An inconsistent legacy child must not authorize changes to a foreign parent.
  const [misowned] = await db.insert(tripRoutesTable).values({ storeId: store.id, tripId: protectedTrips[0].id,
    areaTitle: "歸屬不一致的合成路線", startPlace: "假起點", endPlace: "假終點", estQty: 1 }).returning();
  protectedRoutes.push(misowned);
  await start();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (tripIds.length) {
    await db.delete(tripRoutesTable).where(inArray(tripRoutesTable.tripId, tripIds));
    await db.delete(tripsTable).where(inArray(tripsTable.id, tripIds));
  }
  if (storeIds.length) {
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.storeId, storeIds));
    await db.delete(storeSkillStatesTable).where(inArray(storeSkillStatesTable.storeId, storeIds));
    await db.delete(customersTable).where(inArray(customersTable.storeId, storeIds));
    await db.delete(storesTable).where(inArray(storesTable.id, storeIds));
  }
  await pool.end();
});

test("management requires the gateway and designated owner; unrelated operations remain unavailable", async () => {
  for (const path of ["/trips", `/stores/${store.id}/customers`]) {
    assert.equal((await request("GET", path, undefined, { gateway: false })).status, 403);
    assert.equal((await request("GET", path, undefined, { user: null })).status, 401);
    assert.equal((await request("GET", path, undefined, { user: "user_other" })).status, 403);
  }
  assert.equal((await request("POST", "/trips", { name: "拒絕" }, { user: null })).status, 401);
  assert.equal((await request("POST", `/stores/${store.id}/customers`, customerInput, { user: null })).status, 401);
  assert.equal((await request("POST", `/stores/${store.id}/customers/1/store-credit`, {}, { user: null })).status, 401);
  assert.equal((await request("DELETE", "/trips/1")).status, 403);
});

test("owner creates and edits a synthetic customer and reads its detail and empty ledger", async () => {
  const created = await request("POST", `/stores/${store.id}/customers`, customerInput);
  assert.equal(created.status, 201, JSON.stringify(created.body)); customer = created.body;
  const edited = await request("PATCH", `/stores/${store.id}/customers/${customer.id}`, { ...customerInput, name: "合成客戶已更新" });
  assert.equal(edited.status, 200);
  assert.equal((await request("GET", `/stores/${store.id}/customers/${customer.id}`)).body.customer.name, "合成客戶已更新");
  const ledger = await request("GET", `/stores/${store.id}/customers/${customer.id}/store-credit`);
  assert.equal(ledger.status, 200); assert.equal(ledger.body.balance, "0.000000000000");
  assert.deepEqual(ledger.body.transactions, []);
  assert.deepEqual((await request("GET", `/stores/${store.id}/customers`)).body.map(c => c.id), [customer.id]);
});

test("customer page uses the existing owner-only feature toggle without enabling other skills", async () => {
  const current = await request("GET", `/stores/${store.id}/skills`);
  assert.equal(current.status, 200);
  assert.equal(current.body.skills.find(s => s.skillKey === "S-19").enabled, false);
  const path = `/stores/${store.id}/skills/S-19`;
  const preview = await request("POST", `${path}/preview`, { enabled: true });
  assert.equal(preview.status, 200); assert.equal(preview.body.prerequisite.ready, true);
  const body = { enabled: true, catalogVersion: current.body.catalogVersion, confirmImpact: true, confirmRisk: true };
  assert.equal((await request("POST", `${path}/enable`, { enabled: true, catalogVersion: current.body.catalogVersion })).status, 409);
  assert.equal((await request("POST", `${path}/enable`, body, { user: null })).status, 401);
  assert.equal((await request("POST", `/stores/${decoy.id}/skills/S-19/enable`, body)).status, 403);
  assert.equal((await request("POST", `/stores/${store.id}/skills/S-21/enable`, body)).status, 403);
  assert.equal((await request("POST", `${path}/enable`, body)).status, 200);
  const saved = (await request("GET", `/stores/${store.id}/skills`)).body.skills;
  assert.deepEqual(saved.filter(s => s.enabled).map(s => s.skillKey), ["S-19"]);
  const [row] = await db.select().from(storeSkillStatesTable).where(eq(storeSkillStatesTable.storeId, store.id));
  assert.equal(row.skillKey, "S-19"); assert.equal(row.enabledBy, process.env.PIKA_OWNER_CLERK_USER_ID);
});

test("duplicate and wrong-store customer operations do not overwrite existing rows", async () => {
  assert.equal((await request("POST", `/stores/${store.id}/customers`, customerInput)).status, 409);
  const sibling = await request("POST", `/stores/${store.id}/customers`, { ...customerInput, code: "POC-MANAGE-2", name: "合成次客戶" });
  assert.equal(sibling.status, 201);
  assert.equal((await request("PATCH", `/stores/${store.id}/customers/${sibling.body.id}`, customerInput)).status, 409);
  assert.equal((await request("GET", `/stores/${store.id}/customers/${sibling.body.id}`)).body.customer.name, "合成次客戶");
  assert.equal((await request("GET", `/stores/${store.id}/customers/${customer.id}`)).body.customer.name, "合成客戶已更新");
  assert.equal((await request("GET", `/stores/${decoy.id}/customers`)).status, 403);
  assert.equal((await request("PATCH", `/stores/${store.id}/customers/${otherCustomer.id}`, customerInput)).status, 404);
  assert.equal((await request("GET", `/stores/${store.id}/customers/${otherCustomer.id}/store-credit`)).status, 404);
  const [unchanged] = await db.select().from(customersTable).where(eq(customersTable.id, otherCustomer.id));
  assert.deepEqual(unchanged, otherCustomer);
});

test("trips use the designated store and do not claim NULL rows; missing rate stays null", async () => {
  assert.deepEqual((await request("GET", "/trips")).body, []);
  const created = await request("POST", "/trips", { name: "合成行程" });
  assert.equal(created.status, 201); trip = created.body; tripIds.push(trip.id);
  assert.equal(trip.exchangeRate, null);
  const [saved] = await db.select().from(tripsTable).where(eq(tripsTable.id, trip.id));
  assert.equal(saved.storeId, store.id);
  assert.equal((await request("PATCH", `/trips/${trip.id}`, { name: "合成行程已更新", exchangeRate: 0.21 })).status, 200);
  const listed = await request("GET", "/trips");
  assert.deepEqual(listed.body.map(t => t.id), [trip.id]);
  assert.equal(listed.body[0].exchangeRate, 0.21);
});

test("manual route inputs save and update without invoking a fare or logistics service", async () => {
  const created = await request("POST", `/trips/${trip.id}/routes`, routeInput);
  assert.equal(created.status, 201, JSON.stringify(created.body)); route = created.body;
  assert.equal((await request("PATCH", `/trips/${trip.id}/routes/${route.id}`, { etcJpy: 200 })).status, 200);
  const listed = await request("GET", "/trips");
  assert.equal(listed.body[0].routes[0].trainJpy, 100);
  assert.equal(listed.body[0].routes[0].etcJpy, 200);
  const [saved] = await db.select().from(tripRoutesTable).where(eq(tripRoutesTable.id, route.id));
  assert.equal(saved.storeId, store.id); assert.equal(saved.etcJpy, "200");
});

test("foreign, NULL and inconsistent trip relations cannot be adopted or edited", async () => {
  for (const protectedTrip of protectedTrips) {
    assert.equal((await request("PATCH", `/trips/${protectedTrip.id}`, { name: "不可改" })).status, 403);
    assert.equal((await request("POST", `/trips/${protectedTrip.id}/routes`, routeInput)).status, 403);
  }
  for (const protectedRoute of protectedRoutes) {
    assert.equal((await request("PATCH", `/trips/${protectedRoute.tripId}/routes/${protectedRoute.id}`, { etcJpy: 1 })).status, 403);
    const [saved] = await db.select().from(tripRoutesTable).where(eq(tripRoutesTable.id, protectedRoute.id));
    assert.deepEqual(saved, protectedRoute);
  }
  for (const protectedTrip of protectedTrips) {
    const [saved] = await db.select().from(tripsTable).where(eq(tripsTable.id, protectedTrip.id));
    assert.deepEqual(saved, protectedTrip);
  }
});

test("customer and trip data persist across an API restart", async () => {
  const beforeCustomer = await request("GET", `/stores/${store.id}/customers/${customer.id}`);
  const beforeTrips = await request("GET", "/trips");
  const beforeSkills = await request("GET", `/stores/${store.id}/skills`);
  await new Promise(resolve => server.close(resolve)); await start();
  assert.deepEqual(await request("GET", `/stores/${store.id}/customers/${customer.id}`), beforeCustomer);
  assert.deepEqual(await request("GET", "/trips"), beforeTrips);
  assert.deepEqual(await request("GET", `/stores/${store.id}/skills`), beforeSkills);
});
