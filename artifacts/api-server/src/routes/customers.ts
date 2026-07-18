import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { customersTable, db, ordersTable, validateCustomerInput } from "@workspace/db";
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

// Register the literal export path before :customerId so Express does not parse "export" as an ID.
router.get("/stores/:storeId/customers/export", requireAuth, async (req: any, res) => {
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
    action: mode === "cleartext" ? "export_customers_cleartext" : "export_customers_masked",
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
});

router.get("/stores/:storeId/customers/:customerId", requireAuth, async (req: any, res) => {
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
    .where(and(eq(customersTable.id, customerId), eq(customersTable.storeId, storeId)))
    .limit(1);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, customerId), eq(ordersTable.storeId, storeId)))
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
});

router.post("/stores/:storeId/customers", requireAuth, async (req: any, res) => {
  let storeId: number;
  try {
    storeId = parseId(req.params.storeId, "storeId");
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  try {
    const values = validateCustomerInput(req.body ?? {});
    const [customer] = await db.insert(customersTable).values({ storeId, ...values }).returning();
    return res.status(201).json(customer);
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "Customer code already exists in this store" });
    if (error instanceof TypeError) return res.status(422).json({ error: error.message });
    throw error;
  }
});

router.patch("/stores/:storeId/customers/:customerId", requireAuth, async (req: any, res) => {
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
      .where(and(eq(customersTable.id, customerId), eq(customersTable.storeId, storeId)))
      .returning();
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    return res.json(customer);
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "Customer code already exists in this store" });
    if (error instanceof TypeError) return res.status(422).json({ error: error.message });
    throw error;
  }
});

export default router;
