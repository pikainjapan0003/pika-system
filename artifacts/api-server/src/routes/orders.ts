import { Router } from "express";
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  backfillPendingCartOrderProfitSnapshot,
  backfillPendingOrderProfitSnapshot,
  createInitialOrderProfitSnapshot,
  customerTierEnum,
  customersTable,
  db,
  displayOrderProfitSnapshotAmount,
  multiplyMoneyByQuantity,
  ordersTable,
  productsTable,
  resolveTierPrice,
  shipmentTrackingsTable,
} from "@workspace/db";
import type { CustomerTier, OrderStatus } from "@workspace/db";
import { CreateMerchantOrderBody, UpdateOrderBody, UpdateOrderStatusBody, BulkUpdateOrdersBody, GetPickingListBody, GetShippingListBody } from "@workspace/api-zod";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { getShippingFee } from "../lib/shippingFee.ts";
import { isValidTransition, getTransitionError } from "../lib/orderStatusMachine.ts";
import { TRACKING_IMPORT_ALLOWED_PROVIDERS, normalizeTrackingProvider } from "../lib/logistics/providers.ts";
import { ensureManualProviderTrackingRow } from "../lib/logistics/trackingSeed.ts";
import { loadOrderProfitSnapshotInput } from "../lib/orderProfitSnapshot.ts";
import { summarizeOrderProfits } from "../lib/orderProfitSummary.ts";
import {
  parseTaipeiMonthRange,
  summarizeMonthlyOrderProfits,
} from "../lib/monthlyProfitReport.ts";
import { parsePaymentLast5 } from "../lib/paymentLast5.ts";
import { parseCustomerExportMode } from "../lib/customerExport.ts";
import { formatOrderExportCsv } from "../lib/orderExport.ts";
import { recordAuditLog } from "../lib/auditLog.ts";
import {
  parseOptionalCustomerId,
  resolveCustomerCvsDefaults,
} from "../lib/customerOrderDefaults.ts";

const router = Router();

router.get("/stores/:storeId/orders/profit-summary", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId));
  return res.json(summarizeOrderProfits(orders));
});

router.get("/stores/:storeId/orders/monthly-profit", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const month = typeof req.query.month === "string" ? req.query.month : "";
  let range: ReturnType<typeof parseTaipeiMonthRange>;
  try {
    range = parseTaipeiMonthRange(month);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, storeId),
        gte(ordersTable.createdAt, range.start),
        lt(ordersTable.createdAt, range.end),
      ),
    );
  return res.json(summarizeMonthlyOrderProfits(month, orders));
});

router.get("/stores/:storeId/orders", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  // Active shipment tracking summary per order — single IN query, latest per order.
  const orderIds = orders.map((o) => o.id);
  const trackingByOrderId = new Map<number, ReturnType<typeof formatShipmentTracking>>();
  if (orderIds.length) {
    const trackings = await db
      .select()
      .from(shipmentTrackingsTable)
      .where(and(inArray(shipmentTrackingsTable.orderId, orderIds), eq(shipmentTrackingsTable.isActive, true)));
    for (const t of trackings) {
      const existing = trackingByOrderId.get(t.orderId);
      if (!existing || t.id > existing.id) trackingByOrderId.set(t.orderId, formatShipmentTracking(t));
    }
  }

  return res.json(orders.map((o) => ({ ...formatOrder(o), shipmentTracking: trackingByOrderId.get(o.id) ?? null })));
});

router.post("/stores/:storeId/orders", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const parsed = CreateMerchantOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const {
    productId, buyerName, buyerPhone, quantity, pickupMethod, notes, specValues,
    shippingMethod, recipientName, recipientPhone, recipientAddress,
    storeCode, storeName, cvsStoreAddress, cvsStorePhone, storeSelectedBy,
  } = parsed.data;
  let customerId: number | null;
  try {
    customerId = parseOptionalCustomerId(req.body?.customerId);
  } catch (error) {
    return res.status(422).json({ error: (error as Error).message });
  }
  let paymentLast5: string | null;
  try {
    paymentLast5 = parsePaymentLast5(req.body?.paymentLast5);
  } catch (error) {
    return res.status(422).json({ error: (error as Error).message });
  }

  let retries = 0;
  while (retries <= 3) {
    const publicToken = randomBytes(16).toString("hex");
    try {
      const order = await db.transaction(async (tx) => {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
          .limit(1);

        if (!product) {
          const err = new Error("Product not found") as any;
          err.status = 404;
          throw err;
        }

        const customer = customerId === null
          ? null
          : (await tx
              .select()
              .from(customersTable)
              .where(and(eq(customersTable.id, customerId), eq(customersTable.storeId, storeId)))
              .limit(1))[0] ?? null;
        if (customerId !== null && !customer) {
          const err = new Error("Customer not found") as any;
          err.status = 404;
          throw err;
        }
        const cvsSelection = resolveCustomerCvsDefaults({
          storeCode,
          storeName,
          cvsStoreAddress,
          cvsStorePhone,
        }, customer);
        const hasCvsStore = Boolean(
          cvsSelection.storeCode
          || cvsSelection.storeName
          || cvsSelection.cvsStoreAddress
          || cvsSelection.cvsStorePhone,
        );

        const storedCustomerTier = customer?.tier;
        const customerTier = customerTierEnum.includes(storedCustomerTier as CustomerTier)
          ? (storedCustomerTier as CustomerTier)
          : null;
        const unitPrice = resolveTierPrice({
          generalPrice: product.price,
          vipPrice: product.vipPrice,
          wholesalePrice: product.wholesalePrice,
          partnerPrice: product.partnerPrice,
          customerTier,
        }).priceTwd;
        const totalPrice = multiplyMoneyByQuantity(unitPrice, quantity);
        // Step 7H-3: 與買家端同一套運費規則（黑貓 100 / 郵局 80 / 超商 60 / 自取 0）
        const shippingFee = getShippingFee(pickupMethod);
        // Snapshot sale price is the resolved order-time tier price.
        // If discounts later change the actual unit price, pass that final order unitPrice here instead.
        const profitSnapshotInput = await loadOrderProfitSnapshotInput(
          tx,
          product,
          unitPrice,
        );
        const profitSnapshot = createInitialOrderProfitSnapshot(
          profitSnapshotInput,
          new Date(),
        );

        const [newOrder] = await tx
          .insert(ordersTable)
          .values({
            productId: product.id,
            storeId,
            customerId,
            productName: product.name,
            publicToken,
            buyerName,
            buyerPhone,
            pickupMethod,
            notes: notes ?? null,
            specValues: specValues ?? {},
            quantity,
            unitPrice,
            totalPrice,
            shippingFee: String(shippingFee),
            paymentLast5,
            ...profitSnapshot,
            status: "pending",
            // Step 7H-2: 新增訂單即可帶入物流 / 門市 / 收件資訊（與編輯訂單一致）
            shippingMethod: shippingMethod ?? null,
            recipientName: recipientName ?? null,
            recipientPhone: recipientPhone ?? null,
            recipientAddress: recipientAddress ?? null,
            cvsStoreId: cvsSelection.storeCode,
            cvsStoreName: cvsSelection.storeName,
            cvsStoreAddress: cvsSelection.cvsStoreAddress,
            cvsStorePhone: cvsSelection.cvsStorePhone,
            storeSelectedBy: hasCvsStore
              ? (cvsSelection.usedCustomerDefault ? "customer_default" : (storeSelectedBy ?? "admin"))
              : null,
            storeSelectedAt: hasCvsStore ? new Date() : null,
          })
          .returning();

        if (!newOrder) throw new Error("Insert returned no row");
        return newOrder;
      });

      return res.status(201).json(formatOrder(order));
    } catch (err: any) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.code === "23505" && retries < 3) {
        retries++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to generate unique publicToken after retries");
});

router.post("/orders/picking-list", requireAuth, async (req: any, res) => {
  const parsed = GetPickingListBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const { orderIds } = parsed.data;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(inArray(ordersTable.id, orderIds));

  const foundIds = new Set(orders.map((o) => o.id));
  const notFoundIds = orderIds.filter((id) => !foundIds.has(id));
  if (notFoundIds.length > 0) {
    return res.status(422).json({ error: `Orders not found: ${notFoundIds.join(", ")}` });
  }

  const uniqueStoreIds = [...new Set(orders.map((o) => o.storeId))];
  for (const storeId of uniqueStoreIds) {
    const owned = await verifyStoreOwner(req, res, storeId);
    if (!owned) return;
  }

  const excludedOrderIds = orders.filter((o) => o.status === "cancelled").map((o) => o.id);
  const activeOrders = orders.filter((o) => o.status !== "cancelled");

  // Fetch product details for all products in active orders
  const productIds = [...new Set(activeOrders.map((o) => o.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Group by productId + specValues key
  const groupMap = new Map<string, {
    productId: number;
    skuCode: string | null;
    productName: string;
    specValues: Record<string, unknown>;
    storageTemp: string | null;
    shelfLife: string | null;
    quantityTotal: number;
    orderIds: number[];
    orderNumbers: string[];
    noteSet: Set<string>;
  }>();

  for (const order of activeOrders) {
    const specValues = (order.specValues ?? {}) as Record<string, unknown>;
    const groupKey = `${order.productId}::${JSON.stringify(specValues)}`;
    const product = productMap.get(order.productId);
    const productName = order.productName ?? product?.name ?? `Product #${order.productId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        productId: order.productId,
        skuCode: product?.skuCode ?? null,
        productName,
        specValues,
        storageTemp: product?.storageTemp ?? null,
        shelfLife: product?.shelfLife ?? null,
        quantityTotal: 0,
        orderIds: [],
        orderNumbers: [],
        noteSet: new Set(),
      });
    }

    const group = groupMap.get(groupKey)!;
    group.quantityTotal += order.quantity;
    group.orderIds.push(order.id);
    group.orderNumbers.push(`#${order.id}`);
    if (order.notes) group.noteSet.add(order.notes);
  }

  const items = [...groupMap.values()].map((g) => {
    const specEntries = Object.entries(g.specValues);
    const specLabel = specEntries.length > 0
      ? specEntries.map(([k, v]) => `${k}: ${v}`).join("、")
      : null;

    return {
      productId: g.productId,
      skuCode: g.skuCode,
      productName: g.productName,
      specValues: g.specValues,
      specLabel,
      storageTemp: g.storageTemp,
      shelfLife: g.shelfLife,
      quantityTotal: g.quantityTotal,
      orderIds: g.orderIds,
      orderNumbers: g.orderNumbers,
      notes: [...g.noteSet].join(" / "),
    };
  });

  return res.json({
    generatedAt: new Date().toISOString(),
    orderCount: activeOrders.length,
    excludedOrderIds,
    items,
  });
});

router.post("/orders/picking-list.csv", requireAuth, async (req: any, res) => {
  const parsed = GetPickingListBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const result = await fetchAndValidate(parsed.data.orderIds, req, res);
  if (!result) return;

  const { activeOrders, productMap } = result;

  const groupMap = new Map<string, {
    productId: number;
    skuCode: string | null;
    productName: string;
    specValues: Record<string, unknown>;
    storageTemp: string | null;
    shelfLife: string | null;
    quantityTotal: number;
    orderIds: number[];
    orderNumbers: string[];
    noteSet: Set<string>;
  }>();

  for (const order of activeOrders) {
    const specValues = (order.specValues ?? {}) as Record<string, unknown>;
    const groupKey = `${order.productId}::${JSON.stringify(specValues)}`;
    const product = productMap.get(order.productId);
    const productName = order.productName ?? product?.name ?? `Product #${order.productId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        productId: order.productId,
        skuCode: product?.skuCode ?? null,
        productName,
        specValues,
        storageTemp: product?.storageTemp ?? null,
        shelfLife: product?.shelfLife ?? null,
        quantityTotal: 0,
        orderIds: [],
        orderNumbers: [],
        noteSet: new Set(),
      });
    }

    const group = groupMap.get(groupKey)!;
    group.quantityTotal += order.quantity;
    group.orderIds.push(order.id);
    group.orderNumbers.push(`#${order.id}`);
    if (order.notes) group.noteSet.add(order.notes);
  }

  const headers = ["商品ID", "SKU / 商品編號", "商品名稱", "規格", "溫層", "保存期限", "數量合計", "對應訂單ID", "對應訂單編號", "備註"];
  const rows = [...groupMap.values()].map((g) => {
    const specEntries = Object.entries(g.specValues);
    const specLabel = specEntries.length > 0
      ? specEntries.map(([k, v]) => `${k}: ${v}`).join("、")
      : "";
    return [
      g.productId,
      g.skuCode,
      g.productName,
      specLabel,
      g.storageTemp,
      g.shelfLife,
      g.quantityTotal,
      g.orderIds.join("、"),
      g.orderNumbers.join("、"),
      [...g.noteSet].join(" / "),
    ];
  });

  const now = new Date();
  const csvContent = [headers, ...rows].map(csvRow).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${csvFilename("picking-list", now)}"`);
  return res.send("﻿" + csvContent);
});

router.post("/orders/shipping-list", requireAuth, async (req: any, res) => {
  const parsed = GetShippingListBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const { orderIds } = parsed.data;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(inArray(ordersTable.id, orderIds));

  const foundIds = new Set(orders.map((o) => o.id));
  const notFoundIds = orderIds.filter((id) => !foundIds.has(id));
  if (notFoundIds.length > 0) {
    return res.status(422).json({ error: `Orders not found: ${notFoundIds.join(", ")}` });
  }

  const uniqueStoreIds = [...new Set(orders.map((o) => o.storeId))];
  for (const storeId of uniqueStoreIds) {
    const owned = await verifyStoreOwner(req, res, storeId);
    if (!owned) return;
  }

  const excludedOrderIds = orders.filter((o) => o.status === "cancelled").map((o) => o.id);
  const activeOrders = orders.filter((o) => o.status !== "cancelled");

  // Fetch product details for skuCode
  const productIds = [...new Set(activeOrders.map((o) => o.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const shippingOrders = activeOrders.map((order) => {
    const product = productMap.get(order.productId);
    const specValues = (order.specValues ?? {}) as Record<string, unknown>;
    const specEntries = Object.entries(specValues);
    const specLabel = specEntries.length > 0
      ? specEntries.map(([k, v]) => `${k}: ${v}`).join("、")
      : null;
    const productName = order.productName ?? product?.name ?? null;
    const itemsText = specLabel
      ? `${productName} (${specLabel}) × ${order.quantity}`
      : `${productName} × ${order.quantity}`;

    return {
      orderId: order.id,
      orderNumber: `#${order.id}`,
      status: order.status,
      buyerName: order.buyerName,
      buyerPhone: order.buyerPhone,
      productName,
      skuCode: product?.skuCode ?? null,
      specValues,
      quantity: order.quantity,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod ?? null,
      shippingStatus: order.shippingStatus,
      shippingMethod: order.shippingMethod ?? null,
      trackingCode: order.trackingCode ?? null,
      trackingProvider: order.trackingProvider ?? null,
      storeCode: order.cvsStoreId ?? null,
      storeName: order.cvsStoreName ?? null,
      recipientName: order.recipientName ?? null,
      recipientPhone: order.recipientPhone ?? null,
      recipientAddress: order.recipientAddress ?? null,
      shippingNote: order.shippingNote ?? null,
      itemsText,
      // internalNote intentionally excluded
      // paymentNote intentionally excluded
    };
  });

  return res.json({
    generatedAt: new Date().toISOString(),
    orderCount: activeOrders.length,
    excludedOrderIds,
    orders: shippingOrders,
  });
});

router.post("/orders/shipping-list.csv", requireAuth, async (req: any, res) => {
  const parsed = GetShippingListBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const result = await fetchAndValidate(parsed.data.orderIds, req, res);
  if (!result) return;

  const { activeOrders, productMap } = result;

  const headers = [
    "訂單ID", "訂單編號", "訂單狀態", "買家姓名", "買家電話",
    "商品名稱", "規格", "數量", "付款狀態", "出貨狀態",
    "物流方式", "物流追蹤碼", "物流商", "超商店號", "超商店名",
    "收件人", "收件電話", "收件地址", "物流備註", "商品明細文字",
  ];

  const rows = activeOrders.map((order) => {
    const product = productMap.get(order.productId);
    const specValues = (order.specValues ?? {}) as Record<string, unknown>;
    const specEntries = Object.entries(specValues);
    const specLabel = specEntries.length > 0
      ? specEntries.map(([k, v]) => `${k}: ${v}`).join("、")
      : "";
    const productName = order.productName ?? product?.name ?? "";
    const itemsText = specLabel
      ? `${productName} (${specLabel}) × ${order.quantity}`
      : `${productName} × ${order.quantity}`;

    return [
      order.id,
      `#${order.id}`,
      order.status,
      order.buyerName,
      order.buyerPhone,
      productName,
      specLabel,
      order.quantity,
      order.paymentStatus,
      order.shippingStatus,
      order.shippingMethod ?? "",
      order.trackingCode ?? "",
      order.trackingProvider ?? "",
      order.cvsStoreId ?? "",
      order.cvsStoreName ?? "",
      order.recipientName ?? "",
      order.recipientPhone ?? "",
      order.recipientAddress ?? "",
      order.shippingNote ?? "",
      itemsText,
      // internalNote intentionally excluded
      // paymentNote intentionally excluded
    ];
  });

  const now = new Date();
  const csvContent = [headers, ...rows].map(csvRow).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${csvFilename("shipping-list", now)}"`);
  return res.send("﻿" + csvContent);
});

router.patch("/orders/bulk", requireAuth, async (req: any, res) => {
  const parsed = BulkUpdateOrdersBody.safeParse(req.body);
  if (!parsed.success) {
    const ENUM_UNION_PATHS = new Set(["paymentStatus", "shippingStatus"]);
    const is422 = parsed.error.issues.some(
      (i) =>
        i.code === "invalid_enum_value" ||
        (i.code === "invalid_union" && i.path.length > 0 && ENUM_UNION_PATHS.has(i.path[0] as string))
    );
    return res.status(is422 ? 422 : 400).json({ error: parsed.error.message });
  }

  const { orderIds, paymentStatus, shippingStatus } = parsed.data;

  if (!paymentStatus && !shippingStatus) {
    return res.status(422).json({ error: "At least one of paymentStatus or shippingStatus is required" });
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(inArray(ordersTable.id, orderIds));

  // Verify all requested orders exist and belong to this merchant's stores
  const foundIds = new Set(orders.map((o) => o.id));
  const notFoundIds = orderIds.filter((id) => !foundIds.has(id));
  if (notFoundIds.length > 0) {
    return res.status(422).json({ error: `Orders not found: ${notFoundIds.join(", ")}` });
  }

  const uniqueStoreIds = [...new Set(orders.map((o) => o.storeId))];
  for (const storeId of uniqueStoreIds) {
    const owned = await verifyStoreOwner(req, res, storeId);
    if (!owned) return;
  }

  const updatable = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
  const skipped = orders.filter((o) => o.status === "completed" || o.status === "cancelled");

  if (updatable.length > 0) {
    const updates: Record<string, unknown> = {};
    if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
    if (shippingStatus !== undefined) updates.shippingStatus = shippingStatus;

    await db
      .update(ordersTable)
      .set(updates)
      .where(inArray(ordersTable.id, updatable.map((o) => o.id)));
  }

  return res.json({
    updatedCount: updatable.length,
    skippedCount: skipped.length,
    skippedOrderIds: skipped.map((o) => o.id),
  });
});

// ─── Step 7B: Batch tracking import ────────────────────────────────────────
// trackingProvider: familymart ≠ cvsStores.provider family (different contexts)
// 允許值集中於 provider registry（Step 7H-B），與 openapi TrackingProvider enum 同步
const ALLOWED_TRACKING_PROVIDERS = TRACKING_IMPORT_ALLOWED_PROVIDERS;

router.post("/orders/tracking-import", requireAuth, async (req: any, res) => {
  const body = req.body;

  // Reject entire request if any row contains publicToken key (D10)
  const rows: unknown = body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "rows must be an array" });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: "rows must not be empty" });
  }
  const hasPublicToken = rows.some(
    (row) => row && typeof row === "object" && "publicToken" in row,
  );
  if (hasPublicToken) {
    return res.status(422).json({
      error: "CSV 不應包含 publicToken 欄位，請改用 orderId 或 orderNumber 作為訂單識別",
    });
  }

  type ImportError = { row: number; orderId: string; reason: string };
  const errors: ImportError[] = [];
  let successCount = 0;
  const totalRows = rows.length;

  // Parse and validate each row first
  type ParsedRow = { rowIndex: number; rawOrderId: string; numericOrderId: number; trackingProvider: string; trackingCode: string };
  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    if (!row || typeof row !== "object") {
      errors.push({ row: rowNum, orderId: "", reason: "缺少必要欄位" });
      continue;
    }
    const r = row as Record<string, unknown>;
    const rawOrderId = String(r.orderId ?? "").trim();
    const rawProvider = String(r.trackingProvider ?? "").trim();
    const rawTrackingCode = String(r.trackingCode ?? "").trim();

    // Validate orderId: pure number or #123 format (D1)
    if (!rawOrderId) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: "缺少必要欄位：orderId" });
      continue;
    }
    const normalizedId = rawOrderId.startsWith("#") ? rawOrderId.slice(1) : rawOrderId;
    const numericOrderId = parseInt(normalizedId, 10);
    if (isNaN(numericOrderId) || String(numericOrderId) !== normalizedId) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: "orderId 格式錯誤：需為純數字或 #數字" });
      continue;
    }

    // Validate provider (D2, D6)
    if (!rawProvider) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: "缺少必要欄位：trackingProvider" });
      continue;
    }
    if (!(ALLOWED_TRACKING_PROVIDERS as readonly string[]).includes(rawProvider.toLowerCase())) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: `trackingProvider 不支援：'${rawProvider}'，允許值為 ${ALLOWED_TRACKING_PROVIDERS.join(" / ")}` });
      continue;
    }

    // Validate trackingCode (D5)
    if (!rawTrackingCode) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: "trackingCode 空白" });
      continue;
    }
    if (rawTrackingCode.length > 100) {
      errors.push({ row: rowNum, orderId: rawOrderId, reason: "trackingCode 超過 100 字元上限" });
      continue;
    }

    parsedRows.push({
      rowIndex: rowNum,
      rawOrderId,
      numericOrderId,
      trackingProvider: rawProvider.toLowerCase(),
      trackingCode: rawTrackingCode,
    });
  }

  // Batch fetch all validated orders
  if (parsedRows.length > 0) {
    const orderIds = parsedRows.map((r) => r.numericOrderId);
    const orders = await db
      .select()
      .from(ordersTable)
      .where(inArray(ordersTable.id, orderIds));

    const orderMap = new Map(orders.map((o) => [o.id, o]));

    // Verify store ownership for all found orders
    const uniqueStoreIds = [...new Set(orders.map((o) => o.storeId))];
    for (const storeId of uniqueStoreIds) {
      if (!(await verifyStoreOwner(req, res, storeId))) return;
    }

    // Process each parsed row
    for (const pr of parsedRows) {
      const order = orderMap.get(pr.numericOrderId);
      if (!order) {
        errors.push({ row: pr.rowIndex, orderId: pr.rawOrderId, reason: "找不到訂單" });
        continue;
      }

      // Reject if order does not belong to this store (already verified above, but double-check)
      // verifyStoreOwner already returns early if any store fails, so this is safe

      // D3 / D4: reject if trackingCode already exists
      if (order.trackingCode != null && order.trackingCode.trim() !== "") {
        errors.push({ row: pr.rowIndex, orderId: pr.rawOrderId, reason: "訂單已有物流追蹤碼，如需修改請至後台手動更新" });
        continue;
      }

      // D9: only update trackingCode + trackingProvider, never shippingStatus
      await db
        .update(ordersTable)
        .set({ trackingCode: pr.trackingCode, trackingProvider: pr.trackingProvider })
        .where(eq(ordersTable.id, pr.numericOrderId));

      // Step 7B-FIX-1: seed shipment_trackings so the agent tracking-jobs queue has a row
      const [existingTracking] = await db
        .select()
        .from(shipmentTrackingsTable)
        .where(
          and(
            eq(shipmentTrackingsTable.orderId, pr.numericOrderId),
            eq(shipmentTrackingsTable.isActive, true),
          ),
        )
        .limit(1);

      if (existingTracking && existingTracking.trackingCode === pr.trackingCode) {
        // Same active tracking already registered — nothing to do
      } else {
        if (existingTracking) {
          // trackingCode changed — retire the old row instead of mutating it
          await db
            .update(shipmentTrackingsTable)
            .set({ isActive: false, trackingStatus: "inactive" })
            .where(eq(shipmentTrackingsTable.id, existingTracking.id));
        }
        await db.insert(shipmentTrackingsTable).values({
          orderId: pr.numericOrderId,
          trackingCode: pr.trackingCode,
          trackingProvider: pr.trackingProvider,
        });
      }

      successCount++;
    }
  }

  return res.json({
    totalRows,
    successCount,
    failedCount: totalRows - successCount,
    errors,
  });
});

router.patch("/orders/:orderId", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    const AMOUNT_PATHS = ["paidAmount", "shippingFee", "discountAmount"];
    const ENUM_UNION_PATHS = new Set(["paymentMethod", "shippingMethod"]);
    const is422 = parsed.error.issues.some(
      (i) =>
        i.code === "invalid_enum_value" ||
        (i.code === "invalid_union" && i.path.length > 0 && ENUM_UNION_PATHS.has(i.path[0] as string)) ||
        (i.code === "too_small" && AMOUNT_PATHS.includes(i.path[0] as string))
    );
    return res.status(is422 ? 422 : 400).json({ error: parsed.error.message });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  if (order.status === "completed" || order.status === "cancelled") {
    return res.status(422).json({ error: "Cannot edit a completed or cancelled order" });
  }

  const {
    buyerName, buyerPhone, quantity, pickupMethod, notes, specValues,
    paymentMethod, paymentStatus, paidAmount, paymentNote,
    shippingMethod, shippingStatus, shippingFee,
    recipientName, recipientPhone, recipientAddress,
    storeCode, storeName, cvsStoreAddress, cvsStorePhone, storeSelectedBy,
    trackingCode, trackingProvider, shippingNote, internalNote,
    discountAmount, discountNote,
  } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (buyerName !== undefined) updates.buyerName = buyerName;
  if (buyerPhone !== undefined) updates.buyerPhone = buyerPhone;
  if (pickupMethod !== undefined) updates.pickupMethod = pickupMethod;
  if (notes !== undefined) updates.notes = notes;
  if (specValues !== undefined) updates.specValues = specValues;
  if (quantity !== undefined) {
    updates.quantity = quantity;
    const existingUnitPrice = order.unitPrice as string;
    updates.totalPrice = multiplyMoneyByQuantity(existingUnitPrice, quantity);
  }
  // Payment fields
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
  if (paidAmount !== undefined) updates.paidAmount = paidAmount !== null ? String(paidAmount) : null;
  if (paymentNote !== undefined) updates.paymentNote = paymentNote;
  // Shipping / logistics fields
  if (shippingMethod !== undefined) updates.shippingMethod = shippingMethod;
  if (shippingStatus !== undefined) updates.shippingStatus = shippingStatus;
  if (shippingFee !== undefined) updates.shippingFee = String(shippingFee);
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "paymentLast5")) {
    if (order.status !== "pending" && order.status !== "awaiting_payment") {
      return res.status(422).json({ error: "付款末五碼僅能在待確認或待付款期間修改" });
    }
    try {
      updates.paymentLast5 = parsePaymentLast5(req.body.paymentLast5);
    } catch (error) {
      return res.status(422).json({ error: (error as Error).message });
    }
  }
  if (recipientName !== undefined) updates.recipientName = recipientName;
  if (recipientPhone !== undefined) updates.recipientPhone = recipientPhone;
  if (recipientAddress !== undefined) updates.recipientAddress = recipientAddress;
  // CVS store snapshot fields
  if (storeCode !== undefined) updates.cvsStoreId = storeCode;
  if (storeName !== undefined) updates.cvsStoreName = storeName;
  if (cvsStoreAddress !== undefined) updates.cvsStoreAddress = cvsStoreAddress;
  if (cvsStorePhone !== undefined) updates.cvsStorePhone = cvsStorePhone;
  if (storeSelectedBy !== undefined) updates.storeSelectedBy = storeSelectedBy;
  // Only update storeSelectedAt when a CVS store field actually changes value.
  // Guards against saves that don't change the store (e.g. payment-only edits).
  const cvsChanged =
    (storeCode !== undefined && (storeCode ?? null) !== (order.cvsStoreId ?? null)) ||
    (storeName !== undefined && (storeName ?? null) !== (order.cvsStoreName ?? null)) ||
    (cvsStoreAddress !== undefined && (cvsStoreAddress ?? null) !== (order.cvsStoreAddress ?? null)) ||
    (cvsStorePhone !== undefined && (cvsStorePhone ?? null) !== (order.cvsStorePhone ?? null)) ||
    (storeSelectedBy !== undefined && (storeSelectedBy ?? null) !== (order.storeSelectedBy ?? null));
  if (cvsChanged) updates.storeSelectedAt = new Date();
  if (trackingCode !== undefined) updates.trackingCode = trackingCode;
  // Step 7H-C soft normalize：認得的別名轉 canonical（如 "7-11" → "711"），
  // 認不得的保留原值不拒絕（避免 breaking，髒值由 7H-D 處理）
  if (trackingProvider !== undefined) {
    updates.trackingProvider =
      trackingProvider === null
        ? null
        : (normalizeTrackingProvider(trackingProvider) ?? trackingProvider);
  }
  if (shippingNote !== undefined) updates.shippingNote = shippingNote;
  if (internalNote !== undefined) updates.internalNote = internalNote;
  // Discount fields — validate after shippingFee / totalPrice may be updated
  if (discountAmount !== undefined) {
    if (!Number.isInteger(discountAmount)) {
      return res.status(422).json({ error: "discountAmount must be an integer" });
    }
    const effectiveTotalPrice = updates.totalPrice !== undefined
      ? parseFloat(updates.totalPrice as string)
      : parseFloat(order.totalPrice as string);
    const effectiveShippingFee = updates.shippingFee !== undefined
      ? parseFloat(updates.shippingFee as string)
      : parseFloat(order.shippingFee as string ?? "0");
    if (discountAmount > effectiveTotalPrice + effectiveShippingFee) {
      return res.status(422).json({ error: "discountAmount cannot exceed totalPrice + shippingFee" });
    }
    updates.discountAmount = discountAmount;
  }
  if (discountNote !== undefined) updates.discountNote = discountNote === "" ? null : discountNote;

  if (Object.keys(updates).length === 0) {
    return res.json(formatOrder(order));
  }

  const [updated] = await db
    .update(ordersTable)
    .set(updates)
    .where(eq(ordersTable.id, orderId))
    .returning();

  // Step 7N-I8B：手動填郵局 / 黑貓貨號時 seed shipment_trackings，
  // 讓 EditOrderDialog 的手動查詢按鈕拿得到 tracking row。
  // helper 內部只處理 postoffice / tcat（711 / familymart 一律 skip），idempotent。
  if (trackingCode !== undefined || trackingProvider !== undefined) {
    try {
      await ensureManualProviderTrackingRow({
        orderId: updated.id,
        trackingCode: updated.trackingCode,
        trackingProvider: updated.trackingProvider,
      });
    } catch (err) {
      // seed 失敗不應讓訂單編輯整體失敗；訂單欄位已更新成功
      console.error("[orders] manual tracking seed failed:", err);
    }
  }

  return res.json(formatOrder(updated));
});

router.get("/stores/:storeId/orders/export", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  let mode;
  try {
    mode = parseCustomerExportMode(
      req.query.mode,
      req.get("x-confirm-cleartext-export") === "true",
    );
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  const csv = formatOrderExportCsv(orders, mode);
  await recordAuditLog({
    storeId,
    actor: req.userId,
    action: mode === "cleartext" ? "export_orders_cleartext" : "export_orders_masked",
    target: `orders:${orders.length}`,
  });
  req.log.info(
    { action: "order_export", storeId, mode, count: orders.length },
    "Order CSV exported",
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="orders-${mode}.csv"`,
  );
  return res.send(csv);
});

// Step 7H: 刪除誤建立 / 誤下的訂單。第一版僅允許未出貨、未完成且無物流追蹤的訂單。
router.delete("/stores/:storeId/orders/:orderId", requireAuth, async (req: any, res) => {
  const storeId = parseInt(req.params.storeId);
  const orderId = parseInt(req.params.orderId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1);
  if (!order) return res.status(404).json({ error: "找不到此訂單" });

  const BLOCKED_DELETE_MESSAGE =
    "這筆訂單已有物流或完成紀錄，為避免帳務與物流資料不一致，請保留紀錄或改用取消訂單。";

  if (order.status === "shipped" || order.status === "completed") {
    return res.status(409).json({ error: BLOCKED_DELETE_MESSAGE });
  }

  const [tracking] = await db
    .select({ id: shipmentTrackingsTable.id })
    .from(shipmentTrackingsTable)
    .where(eq(shipmentTrackingsTable.orderId, orderId))
    .limit(1);
  if (tracking) {
    return res.status(409).json({ error: BLOCKED_DELETE_MESSAGE });
  }

  await db.delete(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)));

  return res.json({ ok: true });
});

router.post("/orders/:orderId/profit-snapshot/backfill", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  try {
    const updated = await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!lockedOrder) {
        const err = new Error("Order not found") as Error & { status?: number };
        err.status = 404;
        throw err;
      }

      if (Array.isArray(lockedOrder.items)) {
        if (
          lockedOrder.cartProfitSnapshotStatus !== "pending"
          && lockedOrder.cartProfitSnapshotStatus !== null
        ) {
          const err = new Error("Cart profit snapshot is not pending") as Error & { status?: number };
          err.status = 409;
          throw err;
        }

        const backfilledAt = new Date();
        const snapshotItems = [];
        for (const rawItem of lockedOrder.items as Array<Record<string, unknown>>) {
          const productId = Number(rawItem.productId);
          const quantity = Number(rawItem.quantity);
          const unitPrice = String(rawItem.unitPrice ?? "");
          if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || !unitPrice) {
            const err = new Error("Cart item snapshot data is invalid") as Error & { status?: number };
            err.status = 409;
            throw err;
          }

          const [product] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, productId))
            .limit(1);
          if (!product) {
            const err = new Error("Product not found") as Error & { status?: number };
            err.status = 409;
            throw err;
          }

          const { profitSnapshot: _oldSnapshot, ...item } = rawItem;
          snapshotItems.push({
            item,
            quantity,
            snapshotInput: await loadOrderProfitSnapshotInput(tx, product, unitPrice),
          });
        }

        const cartBackfill = backfillPendingCartOrderProfitSnapshot(
          lockedOrder.cartProfitSnapshotStatus,
          snapshotItems,
          backfilledAt,
        );
        if (cartBackfill.outcome === "still_pending") {
          const err = new Error("Cart profit snapshot data is still pending") as Error & { status?: number };
          err.status = 409;
          throw err;
        }
        if (cartBackfill.outcome === "rejected") {
          const err = new Error("Cart profit snapshot is not pending") as Error & { status?: number };
          err.status = 409;
          throw err;
        }

        const items = cartBackfill.snapshot.items.map(({ item, profitSnapshot }) => ({
          ...item,
          profitSnapshot,
        }));
        const [backfilledOrder] = await tx
          .update(ordersTable)
          .set({
            items,
            cartProfitSnapshotTotalTwd: cartBackfill.snapshot.cartProfitSnapshotTotalTwd,
            cartProfitSnapshotStatus: cartBackfill.snapshot.cartProfitSnapshotStatus,
          })
          .where(and(
            eq(ordersTable.id, orderId),
            or(
              eq(ordersTable.cartProfitSnapshotStatus, "pending"),
              isNull(ordersTable.cartProfitSnapshotStatus),
            ),
          ))
          .returning();
        if (!backfilledOrder) throw new Error("Cart profit snapshot backfill updated no row");
        return backfilledOrder;
      }

      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, lockedOrder.productId))
        .limit(1);
      if (!product) {
        const err = new Error("Product not found") as Error & { status?: number };
        err.status = 409;
        throw err;
      }

      const snapshotInput = await loadOrderProfitSnapshotInput(
        tx,
        product,
        lockedOrder.unitPrice,
      );
      const backfill = backfillPendingOrderProfitSnapshot(
        lockedOrder.profitSnapshotStatus,
        snapshotInput,
        new Date(),
      );
      if (backfill.outcome === "rejected") {
        const err = new Error("成本快照已定格，不能再次補拍") as Error & { status?: number };
        err.status = 409;
        throw err;
      }
      if (backfill.outcome === "still_pending") {
        const missing: string[] = [];
        if (snapshotInput.costJpy == null) missing.push("productCostJpy");
        if (snapshotInput.storePurchaseExchangeRate == null) missing.push("storeExchangeRate");
        if (
          !snapshotInput.isTransportCostExempt &&
          (snapshotInput.transport.product.tripRouteId == null ||
            snapshotInput.transport.route == null ||
            snapshotInput.transport.trip == null)
        ) {
          missing.push("tripRoute");
        }
        const err = new Error("成本資料仍待確認，尚無法補拍") as Error & { status?: number; missing?: string[] };
        err.status = 409;
        err.missing = missing;
        throw err;
      }

      const [backfilledOrder] = await tx
        .update(ordersTable)
        .set({
          ...backfill.values,
          profitSnapshotBackfilledAt: backfill.profitSnapshotBackfilledAt,
        })
        .where(and(
          eq(ordersTable.id, orderId),
          or(
            eq(ordersTable.profitSnapshotStatus, "pending"),
            isNull(ordersTable.profitSnapshotStatus),
          ),
        ))
        .returning();
      if (!backfilledOrder) throw new Error("Profit snapshot backfill updated no row");
      return backfilledOrder;
    });

    return res.json(formatOrder(updated));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 409) {
      const missing = (err as { missing?: string[] }).missing;
      return res.status(status).json({ error: (err as Error).message, ...(missing ? { missing } : {}) });
    }
    throw err;
  }
});

router.patch("/orders/:orderId/status", requireAuth, async (req: any, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (!(await verifyStoreOwner(req, res, order.storeId))) return;

  const currentStatus = order.status as OrderStatus;
  const nextStatus = parsed.data.status as OrderStatus;
  if (!isValidTransition(currentStatus, nextStatus)) {
    return res.status(422).json({ error: getTransitionError(currentStatus, nextStatus) });
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status })
    .where(eq(ordersTable.id, orderId))
    .returning();

  return res.json(formatOrder(updated));
});

function csvRow(cells: unknown[]): string {
  return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

function csvFilename(prefix: string, date: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const ts = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
  return `${prefix}-${ts}.csv`;
}

async function fetchAndValidate(
  orderIds: number[],
  req: any,
  res: any,
): Promise<{ excludedOrderIds: number[]; activeOrders: any[]; productMap: Map<number, any> } | null> {
  const orders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds));

  const foundIds = new Set(orders.map((o) => o.id));
  const notFoundIds = orderIds.filter((id) => !foundIds.has(id));
  if (notFoundIds.length > 0) {
    res.status(422).json({ error: `Orders not found: ${notFoundIds.join(", ")}` });
    return null;
  }

  const uniqueStoreIds = [...new Set(orders.map((o) => o.storeId))];
  for (const storeId of uniqueStoreIds) {
    if (!(await verifyStoreOwner(req, res, storeId))) return null;
  }

  const excludedOrderIds = orders.filter((o) => o.status === "cancelled").map((o) => o.id);
  const activeOrders = orders.filter((o) => o.status !== "cancelled");

  const productIds = [...new Set(activeOrders.map((o) => o.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  return { excludedOrderIds, activeOrders, productMap };
}

// Safe summary of an active shipment tracking — no raw_data, no PII.
function formatShipmentTracking(t: any) {
  return {
    id: t.id as number,
    trackingCode: t.trackingCode as string,
    trackingProvider: t.trackingProvider as string,
    sourceType: t.sourceType as string,
    trackingStatus: t.trackingStatus as string,
    latestEventStatus: t.latestEventStatus ?? null,
    latestEventDescription: t.latestEventDescription ?? null,
    latestEventAt: t.latestEventAt?.toISOString() ?? null,
    lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
    nextCheckAt: t.nextCheckAt?.toISOString() ?? null,
    failureCount: t.failureCount as number,
    checkError: t.checkError ?? null,
    isActive: t.isActive as boolean,
    createdAt: t.createdAt?.toISOString() ?? null,
    updatedAt: t.updatedAt?.toISOString() ?? null,
  };
}

function formatOrder(o: any) {
  const shippingFee = parseFloat(o.shippingFee ?? "0");
  const totalPrice = parseFloat(o.totalPrice);
  const paidAmount = o.paidAmount != null ? parseFloat(o.paidAmount as string) : null;
  const discountAmount = o.discountAmount ?? 0;
  const orderTotal = Math.max(totalPrice + shippingFee - discountAmount, 0);
  const remainingAmount = Math.max(orderTotal - (paidAmount ?? 0), 0);
  const profitSnapshotDisplay = o.profitSnapshotStatus === "captured"
    || o.profitSnapshotStatus === "exempt"
    ? {
      productCostTwd: displayOrderProfitSnapshotAmount(o.profitSnapshotProductCostTwd),
      transportCostTwd: displayOrderProfitSnapshotAmount(o.profitSnapshotTransportCostTwd),
      unitProfitTwd: displayOrderProfitSnapshotAmount(o.profitSnapshotUnitProfitTwd),
      fullUnitProfitTwd: displayOrderProfitSnapshotAmount(o.profitSnapshotFullUnitProfitTwd),
    }
    : null;
  return {
    ...o,
    unitPrice: parseFloat(o.unitPrice),
    shippingFee,
    totalPrice,
    paidAmount,
    discountAmount,
    discountNote: o.discountNote ?? null,
    storeSelectedAt: o.storeSelectedAt?.toISOString() ?? null,
    storeCode: o.cvsStoreId ?? null,
    storeName: o.cvsStoreName ?? null,
    orderTotal,
    remainingAmount,
    profitSnapshotCapturedAt: o.profitSnapshotCapturedAt?.toISOString() ?? null,
    profitSnapshotBackfilledAt: o.profitSnapshotBackfilledAt?.toISOString() ?? null,
    profitSnapshotDisplay,
  };
}

export default router;
