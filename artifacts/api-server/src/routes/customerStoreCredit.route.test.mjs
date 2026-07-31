/**
 * Owner store-credit API integration against CI's disposable PostgreSQL only.
 * Every merchant/customer value below is synthetic.
 */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";

if (!process.env.DATABASE_URL) {
  test(
    "customer store-credit route requires a disposable DATABASE_URL",
    { skip: "DATABASE_URL not set" },
    () => {},
  );
} else {
  const MERCHANT_A = "batch18_credit_fake_owner_a";
  const MERCHANT_B = "batch18_credit_fake_owner_b";

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
  const {
    auditLogsTable,
    customersTable,
    db,
    pool,
    storeCreditTransactionsTable,
    storesTable,
  } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const { default: customersRouter } = await import("./customers.ts");

  const app = express();
  app.use(express.json());
  app.use("/api", customersRouter);

  let server;
  let baseUrl;
  let storeAId;
  let customerAId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}/api`;

    const [storeA, storeB] = await db
      .insert(storesTable)
      .values([
        {
          merchantId: MERCHANT_A,
          name: "Batch 18 Fake Store A",
          slug: `batch18-credit-a-${Date.now()}`,
        },
        {
          merchantId: MERCHANT_B,
          name: "Batch 18 Fake Store B",
          slug: `batch18-credit-b-${Date.now()}`,
        },
      ])
      .returning();
    storeAId = storeA.id;
    const [customer] = await db
      .insert(customersTable)
      .values({
        storeId: storeA.id,
        code: `B18-${Date.now()}`,
        name: "Fake Credit Customer",
      })
      .returning();
    customerAId = customer.id;
    assert.ok(storeB.id > 0);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function request(
    method,
    path,
    { body, userId = MERCHANT_A, confirmed = false } = {},
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
        ...(confirmed ? { "x-confirm-store-credit": "true" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }

  const creditPath = () =>
    `/stores/${storeAId}/customers/${customerAId}/store-credit`;

  test("store-credit endpoints reject unauthenticated requests", async () => {
    const read = await request("GET", creditPath(), { userId: null });
    const write = await request("POST", creditPath(), {
      userId: null,
      confirmed: true,
      body: {
        type: "grant",
        amount: "1",
        reasonCode: "test",
        idempotencyKey: "unauthenticated",
      },
    });
    assert.equal(read.status, 401);
    assert.equal(write.status, 401);
  });

  test("store-credit endpoints reject a merchant from another store", async () => {
    const response = await request("GET", creditPath(), {
      userId: MERCHANT_B,
    });
    assert.equal(response.status, 403);
  });

  test("store-credit mutation requires the explicit confirmation header", async () => {
    const response = await request("POST", creditPath(), {
      body: {
        type: "grant",
        amount: "100",
        reasonCode: "manual_grant",
        idempotencyKey: "grant-without-confirmation",
      },
    });
    assert.equal(response.status, 428);
    assert.match(response.data.error, /explicit confirmation/);
  });

  test("grant is exact and an idempotent retry does not duplicate the ledger", async () => {
    const body = {
      type: "grant",
      amount: "100.100000000001",
      reasonCode: "manual_grant",
      note: "synthetic grant",
      idempotencyKey: "grant-1",
    };
    const created = await request("POST", creditPath(), {
      body,
      confirmed: true,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.balance, "100.100000000001");
    assert.equal(created.data.idempotent, false);

    const repeated = await request("POST", creditPath(), {
      body,
      confirmed: true,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.balance, "100.100000000001");
    assert.equal(repeated.data.idempotent, true);

    const rows = await db
      .select()
      .from(storeCreditTransactionsTable)
      .where(
        and(
          eq(storeCreditTransactionsTable.storeId, storeAId),
          eq(storeCreditTransactionsTable.idempotencyKey, "grant-1"),
        ),
      );
    assert.equal(rows.length, 1);
  });

  test("negative adjustment cannot make the balance negative", async () => {
    const response = await request("POST", creditPath(), {
      confirmed: true,
      body: {
        type: "adjust",
        amount: "-100.100000000002",
        reasonCode: "manual_correction",
        idempotencyKey: "adjust-overdraw",
      },
    });
    assert.equal(response.status, 422);
    assert.match(response.data.error, /exceeds available balance/);
  });

  test("ledger is paginated newest first and returns the exact balance", async () => {
    const debit = await request("POST", creditPath(), {
      confirmed: true,
      body: {
        type: "adjust",
        amount: "-20.000000000001",
        reasonCode: "manual_correction",
        idempotencyKey: "adjust-1",
      },
    });
    assert.equal(debit.status, 201);
    assert.equal(debit.data.balance, "80.100000000000");

    const grant = await request("POST", creditPath(), {
      confirmed: true,
      body: {
        type: "grant",
        amount: "5",
        reasonCode: "service_recovery",
        idempotencyKey: "grant-2",
      },
    });
    assert.equal(grant.status, 201);

    const response = await request("GET", `${creditPath()}?page=1&limit=2`);
    assert.equal(response.status, 200);
    assert.equal(response.data.balance, "85.100000000000");
    assert.equal(response.data.total, 3);
    assert.equal(response.data.transactions.length, 2);
    assert.equal(response.data.transactions[0].idempotencyKey, "grant-2");
    assert.equal(response.data.transactions[1].idempotencyKey, "adjust-1");
  });

  test("owner credit mutations create anonymous audit records exactly once", async () => {
    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.storeId, storeAId));
    const creditRows = rows.filter((row) =>
      row.action.startsWith("store_credit_"),
    );

    assert.deepEqual(creditRows.map((row) => row.action).sort(), [
      "store_credit_adjust",
      "store_credit_grant",
      "store_credit_grant",
    ]);
    for (const row of creditRows) {
      assert.equal(row.actor, MERCHANT_A);
      assert.match(
        row.target,
        new RegExp(
          `^customer-${customerAId}:ledger-\\d+:amount-\\d+\\.\\d{12}$`,
        ),
      );
      assert.doesNotMatch(row.target, /Fake Credit Customer|synthetic grant/);
      assert.doesNotMatch(row.target, /grant-1|adjust-1|grant-2/);
    }
  });
}
