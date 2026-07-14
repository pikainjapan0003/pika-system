import { pgTable, text, serial, timestamp, integer, numeric, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { productsTable } from "./products.ts";

export const orderStatusEnum = ["pending", "awaiting_payment", "preparing", "shipped", "completed", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const paymentMethodEnum = ["cash", "bank_transfer", "line_pay", "other"] as const;
export type PaymentMethod = typeof paymentMethodEnum[number];

export const paymentStatusEnum = ["unpaid", "pending", "partially_paid", "paid", "refunded", "failed"] as const;
export type PaymentStatus = typeof paymentStatusEnum[number];

export const shippingMethodEnum = ["self_pickup", "convenience_store", "home_delivery", "other"] as const;
export type ShippingMethod = typeof shippingMethodEnum[number];

export const shippingStatusEnum = ["not_shipped", "preparing", "shipped", "arrived", "picked_up", "returned", "cancelled"] as const;
export type ShippingStatus = typeof shippingStatusEnum[number];

export const profitSnapshotStatusEnum = ["captured", "pending", "exempt"] as const;
export type ProfitSnapshotStatus = typeof profitSnapshotStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  productName: text("product_name"),
  publicToken: text("public_token").notNull().unique(),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone").notNull(),
  pickupMethod: text("pickup_method").notNull(),
  notes: text("notes"),
  specValues: jsonb("spec_values").default({}),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  // Payment fields (store-side manual tracking, not automated payment gateway)
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }),
  paymentNote: text("payment_note"),
  // Shipping / logistics fields (store-side manual tracking, not real-time logistics API)
  shippingMethod: text("shipping_method"),
  shippingStatus: text("shipping_status").notNull().default("not_shipped"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  recipientAddress: text("recipient_address"),
  trackingCode: text("tracking_code"),
  trackingProvider: text("tracking_provider"),
  shippingNote: text("shipping_note"),
  internalNote: text("internal_note"),
  discountAmount: integer("discount_amount").notNull().default(0),
  discountNote: text("discount_note"),
  // Order-time unit cost/profit snapshot (Q63/Q67/Q68/Q69).
  // numeric(30,12) is the approved terminal half-up capture scale; these
  // values must never feed the live product cost calculation back upstream.
  profitSnapshotCostJpy: numeric("profit_snapshot_cost_jpy", { precision: 30, scale: 12 }),
  profitSnapshotExchangeRate: numeric("profit_snapshot_exchange_rate", { precision: 30, scale: 12 }),
  profitSnapshotProductCostTwd: numeric("profit_snapshot_product_cost_twd", { precision: 30, scale: 12 }),
  profitSnapshotTransportCostTwd: numeric("profit_snapshot_transport_cost_twd", { precision: 30, scale: 12 }),
  profitSnapshotUnitProfitTwd: numeric("profit_snapshot_unit_profit_twd", { precision: 30, scale: 12 }),
  profitSnapshotFullUnitProfitTwd: numeric("profit_snapshot_full_unit_profit_twd", { precision: 30, scale: 12 }),
  profitSnapshotStatus: text("profit_snapshot_status"),
  profitSnapshotCapturedAt: timestamp("profit_snapshot_captured_at", { withTimezone: true }),
  profitSnapshotBackfilledAt: timestamp("profit_snapshot_backfilled_at", { withTimezone: true }),
  // CVS store fields (7-11, FamilyMart, etc.) — DB cols cvsStoreId/cvsStoreName map to API storeCode/storeName
  cvsStoreId: text("cvs_store_id"),
  cvsStoreName: text("cvs_store_name"),
  cvsStoreAddress: text("cvs_store_address"),
  cvsStorePhone: text("cvs_store_phone"),
  storeSelectedBy: text("store_selected_by"), // 'customer' | 'admin' | 'system'
  storeSelectedAt: timestamp("store_selected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("orders_store_id_idx").on(t.storeId),
  index("orders_product_id_idx").on(t.productId),
  check("orders_status_valid", sql`${t.status} IN ('pending', 'awaiting_payment', 'preparing', 'shipped', 'completed', 'cancelled')`),
  check(
    "orders_profit_snapshot_status_valid",
    sql`${t.profitSnapshotStatus} IS NULL OR ${t.profitSnapshotStatus} IN ('captured', 'pending', 'exempt')`,
  ),
  check(
    "orders_profit_snapshot_costs_non_negative",
    sql`(${t.profitSnapshotCostJpy} IS NULL OR ${t.profitSnapshotCostJpy} >= 0)
      AND (${t.profitSnapshotExchangeRate} IS NULL OR ${t.profitSnapshotExchangeRate} >= 0)
      AND (${t.profitSnapshotProductCostTwd} IS NULL OR ${t.profitSnapshotProductCostTwd} >= 0)
      AND (${t.profitSnapshotTransportCostTwd} IS NULL OR ${t.profitSnapshotTransportCostTwd} >= 0)`,
  ),
  check(
    "orders_profit_snapshot_shape_valid",
    sql`(
        ${t.profitSnapshotStatus} IS NULL
        AND ${t.profitSnapshotCostJpy} IS NULL
        AND ${t.profitSnapshotExchangeRate} IS NULL
        AND ${t.profitSnapshotProductCostTwd} IS NULL
        AND ${t.profitSnapshotTransportCostTwd} IS NULL
        AND ${t.profitSnapshotUnitProfitTwd} IS NULL
        AND ${t.profitSnapshotFullUnitProfitTwd} IS NULL
        AND ${t.profitSnapshotCapturedAt} IS NULL
        AND ${t.profitSnapshotBackfilledAt} IS NULL
      ) OR (
        ${t.profitSnapshotStatus} = 'pending'
        AND ${t.profitSnapshotProductCostTwd} IS NULL
        AND ${t.profitSnapshotTransportCostTwd} IS NULL
        AND ${t.profitSnapshotUnitProfitTwd} IS NULL
        AND ${t.profitSnapshotFullUnitProfitTwd} IS NULL
        AND ${t.profitSnapshotCapturedAt} IS NOT NULL
        AND ${t.profitSnapshotBackfilledAt} IS NULL
      ) OR (
        ${t.profitSnapshotStatus} IN ('captured', 'exempt')
        AND ${t.profitSnapshotCostJpy} IS NOT NULL
        AND ${t.profitSnapshotExchangeRate} IS NOT NULL
        AND ${t.profitSnapshotProductCostTwd} IS NOT NULL
        AND ${t.profitSnapshotTransportCostTwd} IS NOT NULL
        AND ${t.profitSnapshotUnitProfitTwd} IS NOT NULL
        AND ${t.profitSnapshotFullUnitProfitTwd} IS NOT NULL
        AND ${t.profitSnapshotCapturedAt} IS NOT NULL
      )`,
  ),
  check(
    "orders_profit_snapshot_exempt_transport_zero",
    sql`${t.profitSnapshotStatus} <> 'exempt' OR ${t.profitSnapshotTransportCostTwd} = 0`,
  ),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
