import {
  validateMaihuobianRow,
  type MaihuobianValidatedRow,
  type MaihuobianValidationError,
} from "@workspace/db/maihuobian";
import { MAIHUOBIAN_IMPORT_HEADERS } from "./maihuobianXlsm.ts";

const MAX_MAIHUOBIAN_EXPORT_ROWS = 500;

export interface MaihuobianExportOrder {
  id: number;
  productId: number;
  productName: string | null;
  buyerName: string;
  buyerPhone: string;
  recipientName: string | null;
  recipientPhone: string | null;
  cvsStoreId: string | null;
  pickupMethod: string;
  status: string;
  shippingStatus: string;
  quantity: number;
  totalPrice: string;
  shippingFee: string;
  createdAt: Date;
  notes: string | null;
  items: unknown;
}

export interface MaihuobianExportProduct {
  id: number;
  name: string;
  storageTempClass: string | null;
}

export interface MaihuobianExportEligibleOrder {
  orderId: number;
  row: MaihuobianValidatedRow;
}

export interface MaihuobianExportIneligibleOrder {
  orderId: number;
  reasons: Array<{
    code: string;
    message: string;
    field?: MaihuobianValidationError["field"];
  }>;
}

export interface MaihuobianExportPreview {
  eligibleCount: number;
  ineligibleCount: number;
  eligible: MaihuobianExportEligibleOrder[];
  ineligible: MaihuobianExportIneligibleOrder[];
}

export interface MaihuobianExportPreviewEligibleOrder {
  orderId: number;
  productSummary: string;
}

/**
 * Owner preview DTO. Cleartext recipient and store fields stay server-side
 * until the owner explicitly confirms the export POST request.
 */
export interface MaihuobianExportPreviewDto {
  eligibleCount: number;
  ineligibleCount: number;
  eligible: MaihuobianExportPreviewEligibleOrder[];
  ineligible: MaihuobianExportIneligibleOrder[];
}

export interface MaihuobianDateRange {
  start?: Date;
  end?: Date;
}

interface CartItem {
  productId: number;
  productName: string;
  quantity: number;
  specValues: Record<string, string>;
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function parseCartItems(value: unknown): CartItem[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: CartItem[] = [];
  for (const rawItem of value) {
    if (
      typeof rawItem !== "object" ||
      rawItem === null ||
      Array.isArray(rawItem)
    )
      return null;
    const item = rawItem as Record<string, unknown>;
    if (
      !Number.isSafeInteger(item.productId) ||
      Number(item.productId) < 1 ||
      typeof item.productName !== "string" ||
      !Number.isSafeInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      !isPlainStringRecord(item.specValues ?? {})
    ) {
      return null;
    }
    parsed.push({
      productId: Number(item.productId),
      productName: item.productName.trim(),
      quantity: Number(item.quantity),
      specValues: item.specValues as Record<string, string>,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

function formatProductPart(item: {
  productName: string;
  quantity: number;
  specValues?: Record<string, string>;
}): string {
  const specifications = Object.values(item.specValues ?? {})
    .map((value) => value.trim())
    .filter(Boolean);
  return `${item.productName}${specifications.length > 0 ? `（${specifications.join("／")}）` : ""} × ${item.quantity}`;
}

function isSevenElevenPickup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("7-11") ||
    normalized.includes("711") ||
    normalized.includes("統一超商")
  );
}

function parseTaipeiBoundary(value: string, nextDay: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new RangeError("日期必須使用 YYYY-MM-DD 格式");
  }
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError("日期不存在");
  }
  const boundary = new Date(`${value}T00:00:00+08:00`);
  if (nextDay) boundary.setUTCDate(boundary.getUTCDate() + 1);
  return boundary;
}

/**
 * Parses an optional inclusive Taipei calendar-date range into a half-open
 * database interval. Supplying only one boundary is rejected rather than
 * silently broadening the export.
 */
export function parseMaihuobianDateRange(
  from: unknown,
  to: unknown,
): MaihuobianDateRange {
  const fromValue = typeof from === "string" ? from.trim() : "";
  const toValue = typeof to === "string" ? to.trim() : "";
  if (!fromValue && !toValue) return {};
  if (!fromValue || !toValue) {
    throw new RangeError("開始日期與結束日期必須一起提供");
  }

  const start = parseTaipeiBoundary(fromValue, false);
  const end = parseTaipeiBoundary(toValue, true);
  if (start >= end) throw new RangeError("開始日期不得晚於結束日期");
  return { start, end };
}

/**
 * Applies the owner-approved M1–M8 eligibility and row rules. No order is
 * mutated and no money is recalculated: persisted order subtotal/shipping
 * strings are passed to the shared ExactDecimal validator unchanged.
 */
export function buildMaihuobianExportPreview(
  orders: readonly MaihuobianExportOrder[],
  products: readonly MaihuobianExportProduct[],
): MaihuobianExportPreview {
  const productById = new Map(products.map((product) => [product.id, product]));
  const eligible: MaihuobianExportEligibleOrder[] = [];
  const ineligible: MaihuobianExportIneligibleOrder[] = [];

  for (const order of orders) {
    const reasons: MaihuobianExportIneligibleOrder["reasons"] = [];
    if (order.status !== "preparing") {
      reasons.push({
        code: "ORDER_STATUS_INELIGIBLE",
        message: "僅備貨中訂單可匯出",
      });
    }
    if (order.shippingStatus !== "not_shipped") {
      reasons.push({
        code: "SHIPPING_STATUS_INELIGIBLE",
        message: "僅尚未出貨訂單可匯出",
      });
    }
    if (!isSevenElevenPickup(order.pickupMethod)) {
      reasons.push({
        code: "PICKUP_METHOD_INELIGIBLE",
        message: "僅 7-11 取貨訂單可匯出",
      });
    }

    if (reasons.length > 0) {
      ineligible.push({ orderId: order.id, reasons });
      continue;
    }

    const cartItems = parseCartItems(order.items);
    const product = productById.get(order.productId);
    const itemStorageTempClasses = cartItems?.map(
      (item) => productById.get(item.productId)?.storageTempClass ?? null,
    );
    const productSummary = cartItems
      ? cartItems.map(formatProductPart).join("；")
      : formatProductPart({
          productName: order.productName ?? product?.name ?? "",
          quantity: order.quantity,
        });
    const validation = validateMaihuobianRow({
      recipientName: order.recipientName,
      buyerName: order.buyerName,
      recipientPhone: order.recipientPhone,
      buyerPhone: order.buyerPhone,
      cvsStoreId: order.cvsStoreId,
      storageTempClass: product?.storageTempClass,
      itemStorageTempClasses,
      productSummary,
      totalPrice: order.totalPrice,
      shippingFee: order.shippingFee,
      createdAt: order.createdAt,
      notes: order.notes,
    });

    if (!validation.ok) {
      ineligible.push({
        orderId: order.id,
        reasons: validation.errors.map((error) => ({
          field: error.field,
          code: error.code,
          message: error.message,
        })),
      });
      continue;
    }
    eligible.push({ orderId: order.id, row: validation.row });
  }

  if (eligible.length > MAX_MAIHUOBIAN_EXPORT_ROWS) {
    throw new RangeError(
      `單次最多匯出 ${MAX_MAIHUOBIAN_EXPORT_ROWS} 筆合格訂單，請縮小日期範圍`,
    );
  }
  return {
    eligibleCount: eligible.length,
    ineligibleCount: ineligible.length,
    eligible,
    ineligible,
  };
}

export function toMaihuobianExportPreviewDto(
  preview: MaihuobianExportPreview,
): MaihuobianExportPreviewDto {
  return {
    eligibleCount: preview.eligibleCount,
    ineligibleCount: preview.ineligibleCount,
    eligible: preview.eligible.map(({ orderId, row }) => ({
      orderId,
      productSummary: row.productSummary,
    })),
    ineligible: preview.ineligible,
  };
}

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

/**
 * Serializes validated rows using the official v1.4 column order. The rows
 * have already passed the shared validator, so this helper only performs
 * quoting and formula-injection neutralization; it does not recalculate any
 * order values.
 */
export function formatMaihuobianCsv(
  rows: readonly MaihuobianValidatedRow[],
): string {
  const records = rows.map((row) => [
    row.recipientName,
    row.recipientPhone,
    row.cvsStoreId,
    row.temperature,
    row.productSummary,
    row.totalPrice,
    row.shippingFee,
    row.orderDate,
    row.notes,
    row.socialAccount,
  ]);
  return [MAIHUOBIAN_IMPORT_HEADERS, ...records]
    .map((record) => record.map(csvCell).join(","))
    .join("\r\n");
}
