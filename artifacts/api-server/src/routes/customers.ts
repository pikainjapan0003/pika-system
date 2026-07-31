import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  customersTable,
  db,
  ordersTable,
  storeCreditTransactionsTable,
  validateCustomerInput,
} from "@workspace/db";
import {
  calculateStoreCreditBalance,
  prepareStoreCreditAdjustment,
  prepareStoreCreditGrant,
  type StoreCreditDirection,
  type StoreCreditTransactionType,
} from "@workspace/db/store-credit";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import {
  formatCustomerExportCsv,
  parseCustomerExportMode,
} from "../lib/customerExport.ts";
import { formatCustomerOrderProfit } from "../lib/customerDetail.ts";
import { recordAuditLog } from "../lib/auditLog.ts";

const router = Router();

function parseId(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return parsed;
}

function parsePage(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError("page must be a positive integer");
  }
  return parsed;
}

function parsePageSize(value: unknown): number {
  if (value === undefined) return 50;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new TypeError("limit must be an integer between 1 and 100");
  }
  return parsed;
}

function toStoreCreditLedgerEntry(row: {
  direction: string;
  type: string;
  amount: string;
  relatedOrderId: number | null;
}) {
  return {
    direction: row.direction as StoreCreditDirection,
    type: row.type as StoreCreditTransactionType,
    amount: row.amount,
    relatedOrderId: row.relatedOrderId,
  };
}

interface StoreCreditMutationInput {
  type: "grant" | "adjust";
  amount: string;
  reasonCode: string;
  note: string | null;
  idempotencyKey: string;
}

function requireBoundedText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new TypeError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function parseStoreCreditMutationInput(
  value: unknown,
): StoreCreditMutationInput {
  const body = value as Record<string, unknown> | null;
  if (!body || (body.type !== "grant" && body.type !== "adjust")) {
    throw new TypeError("type must be grant or adjust");
  }
  const amount = requireBoundedText(body.amount, "amount", 100);
  const reasonCode = requireBoundedText(body.reasonCode, "reasonCode", 100);
  const idempotencyKey = requireBoundedText(
    body.idempotencyKey,
    "idempotencyKey",
    200,
  );
  let note: string | null = null;
  if (body.note != null && body.note !== "") {
    note = requireBoundedText(body.note, "note", 500);
  }
  return {
    type: body.type,
    amount,
    reasonCode,
    note,
    idempotencyKey,
  };
}

class StoreCreditIdempotencyConflictError extends Error {}

router.get("/stores/:storeId/customers", requireAuth, async (req: any, res) => {
  let storeId: number;
  try {
    storeId = parseId(req.params.storeId, "storeId");
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.storeId, storeId))
    .orderBy(customersTable.code);
  return res.json(customers);
});

router.get(
  "/stores/:storeId/customers/:customerId/store-credit",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    let customerId: number;
    let page: number;
    let limit: number;
    try {
      storeId = parseId(req.params.storeId, "storeId");
      customerId = parseId(req.params.customerId, "customerId");
      page = parsePage(req.query.page, 1);
      limit = parsePageSize(req.query.limit);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const [customer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const balanceRows = await db
      .select({
        direction: storeCreditTransactionsTable.direction,
        type: storeCreditTransactionsTable.type,
        amount: storeCreditTransactionsTable.amount,
        relatedOrderId: storeCreditTransactionsTable.relatedOrderId,
      })
      .from(storeCreditTransactionsTable)
      .where(
        and(
          eq(storeCreditTransactionsTable.storeId, storeId),
          eq(storeCreditTransactionsTable.customerId, customerId),
        ),
      );
    const transactions = await db
      .select()
      .from(storeCreditTransactionsTable)
      .where(
        and(
          eq(storeCreditTransactionsTable.storeId, storeId),
          eq(storeCreditTransactionsTable.customerId, customerId),
        ),
      )
      .orderBy(
        desc(storeCreditTransactionsTable.createdAt),
        desc(storeCreditTransactionsTable.id),
      )
      .limit(limit)
      .offset((page - 1) * limit);

    return res.json({
      balance: calculateStoreCreditBalance(
        balanceRows.map(toStoreCreditLedgerEntry),
      ).toDecimalPlaces(12),
      transactions,
      page,
      limit,
      total: balanceRows.length,
    });
  },
);

router.post(
  "/stores/:storeId/customers/:customerId/store-credit",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    let customerId: number;
    let input: StoreCreditMutationInput;
    try {
      storeId = parseId(req.params.storeId, "storeId");
      customerId = parseId(req.params.customerId, "customerId");
      input = parseStoreCreditMutationInput(req.body);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    if (req.get("x-confirm-store-credit") !== "true") {
      return res.status(428).json({
        error: "Store credit mutation requires explicit confirmation",
      });
    }

    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${storeId}, ${customerId})`,
        );

        const [customer] = await tx
          .select({ id: customersTable.id })
          .from(customersTable)
          .where(
            and(
              eq(customersTable.id, customerId),
              eq(customersTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!customer) {
          const error = new Error("Customer not found") as Error & {
            status?: number;
          };
          error.status = 404;
          throw error;
        }

        const ledgerRows = await tx
          .select({
            direction: storeCreditTransactionsTable.direction,
            type: storeCreditTransactionsTable.type,
            amount: storeCreditTransactionsTable.amount,
            relatedOrderId: storeCreditTransactionsTable.relatedOrderId,
          })
          .from(storeCreditTransactionsTable)
          .where(
            and(
              eq(storeCreditTransactionsTable.storeId, storeId),
              eq(storeCreditTransactionsTable.customerId, customerId),
            ),
          );
        const balance = calculateStoreCreditBalance(
          ledgerRows.map(toStoreCreditLedgerEntry),
        );
        const prepared =
          input.type === "grant"
            ? prepareStoreCreditGrant(input.amount)
            : prepareStoreCreditAdjustment({
                amount: input.amount,
                availableBalance: balance.toDecimalPlaces(12),
              });
        const normalizedAmount = prepared.amount.toDecimalPlaces(12);

        const [existing] = await tx
          .select()
          .from(storeCreditTransactionsTable)
          .where(
            and(
              eq(storeCreditTransactionsTable.storeId, storeId),
              eq(
                storeCreditTransactionsTable.idempotencyKey,
                input.idempotencyKey,
              ),
            ),
          )
          .limit(1);
        if (existing) {
          const isSameMutation =
            existing.customerId === customerId &&
            existing.type === prepared.type &&
            existing.direction === prepared.direction &&
            existing.amount === normalizedAmount &&
            existing.reasonCode === input.reasonCode &&
            existing.note === input.note;
          if (!isSameMutation) {
            throw new StoreCreditIdempotencyConflictError(
              "idempotencyKey was already used for a different mutation",
            );
          }
          return {
            transaction: existing,
            balance: balance.toDecimalPlaces(12),
            idempotent: true,
          };
        }

        const [inserted] = await tx
          .insert(storeCreditTransactionsTable)
          .values({
            storeId,
            customerId,
            direction: prepared.direction,
            type: prepared.type,
            amount: normalizedAmount,
            relatedOrderId: null,
            reasonCode: input.reasonCode,
            idempotencyKey: input.idempotencyKey,
            note: input.note,
            createdBy: req.userId,
          })
          .returning();
        if (!inserted) throw new Error("Insert returned no row");

        const updatedBalance = calculateStoreCreditBalance([
          ...ledgerRows.map(toStoreCreditLedgerEntry),
          toStoreCreditLedgerEntry(inserted),
        ]);
        return {
          transaction: inserted,
          balance: updatedBalance.toDecimalPlaces(12),
          idempotent: false,
        };
      });

      return res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof StoreCreditIdempotencyConflictError) {
        return res.status(409).json({ error: error.message });
      }
      if ((error as Error & { status?: number }).status === 404) {
        return res.status(404).json({ error: (error as Error).message });
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        return res.status(422).json({ error: error.message });
      }
      throw error;
    }
  },
);

// Register the literal export path before :customerId so Express does not parse "export" as an ID.
router.get(
  "/stores/:storeId/customers/export",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseId(req.params.storeId, "storeId");
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    let mode;
    try {
      mode = parseCustomerExportMode(
        req.query.mode,
        req.get("x-confirm-cleartext-export") === "true",
      );
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }

    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.storeId, storeId))
      .orderBy(customersTable.code);
    const csv = formatCustomerExportCsv(customers, mode);
    await recordAuditLog({
      storeId,
      actor: req.userId,
      action:
        mode === "cleartext"
          ? "export_customers_cleartext"
          : "export_customers_masked",
      target: `customers:${customers.length}`,
    });
    req.log.info(
      { action: "customer_export", storeId, mode, count: customers.length },
      "Customer CSV exported",
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customers-${mode}.csv"`,
    );
    return res.send(csv);
  },
);

router.get(
  "/stores/:storeId/customers/:customerId",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    let customerId: number;
    try {
      storeId = parseId(req.params.storeId, "storeId");
      customerId = parseId(req.params.customerId, "customerId");
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;

    const [customer] = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const orders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.customerId, customerId),
          eq(ordersTable.storeId, storeId),
        ),
      )
      .orderBy(ordersTable.createdAt);

    return res.json({
      customer,
      orders: orders.map((order) => ({
        id: order.id,
        productName: order.productName,
        quantity: order.quantity,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        profit: formatCustomerOrderProfit(order),
      })),
    });
  },
);

router.post(
  "/stores/:storeId/customers",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseId(req.params.storeId, "storeId");
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    try {
      const values = validateCustomerInput(req.body ?? {});
      const [customer] = await db
        .insert(customersTable)
        .values({ storeId, ...values })
        .returning();
      return res.status(201).json(customer);
    } catch (error: any) {
      if (error?.code === "23505")
        return res
          .status(409)
          .json({ error: "Customer code already exists in this store" });
      if (error instanceof TypeError)
        return res.status(422).json({ error: error.message });
      throw error;
    }
  },
);

router.patch(
  "/stores/:storeId/customers/:customerId",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    let customerId: number;
    try {
      storeId = parseId(req.params.storeId, "storeId");
      customerId = parseId(req.params.customerId, "customerId");
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    try {
      const values = validateCustomerInput(req.body ?? {});
      const [customer] = await db
        .update(customersTable)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(customersTable.id, customerId),
            eq(customersTable.storeId, storeId),
          ),
        )
        .returning();
      if (!customer)
        return res.status(404).json({ error: "Customer not found" });
      return res.json(customer);
    } catch (error: any) {
      if (error?.code === "23505")
        return res
          .status(409)
          .json({ error: "Customer code already exists in this store" });
      if (error instanceof TypeError)
        return res.status(422).json({ error: error.message });
      throw error;
    }
  },
);

export default router;
