import { ExactDecimal } from "../transport-cost/index.ts";

export type MaihuobianTemperatureClass = "normal" | "frozen";

export interface MaihuobianOrderInput {
  recipientName?: unknown;
  buyerName?: unknown;
  recipientPhone?: unknown;
  buyerPhone?: unknown;
  cvsStoreId?: unknown;
  storageTempClass?: unknown;
  itemStorageTempClasses?: readonly unknown[] | null;
  productSummary?: unknown;
  totalPrice?: unknown;
  shippingFee?: unknown;
  createdAt?: unknown;
  notes?: unknown;
}

export type MaihuobianValidationField =
  | "recipientName"
  | "recipientPhone"
  | "cvsStoreId"
  | "storageTempClass"
  | "productSummary"
  | "totalPrice"
  | "shippingFee"
  | "createdAt"
  | "notes";

export interface MaihuobianValidationError {
  field: MaihuobianValidationField;
  code: string;
  message: string;
}

export interface MaihuobianValidatedRow {
  recipientName: string;
  recipientPhone: string;
  cvsStoreId: string;
  temperature: "常溫" | "冷凍";
  productSummary: string;
  totalPrice: string;
  shippingFee: string;
  orderDate: string;
  notes: string;
  socialAccount: "";
}

export type MaihuobianValidationResult =
  | { ok: true; row: MaihuobianValidatedRow }
  | { ok: false; errors: MaihuobianValidationError[] };

const FORBIDDEN_RECIPIENT_NAME_CHARACTERS =
  /[0-9`~!@#$%^&*()/\\|,.<>'?"();:_+\-=[\]{}]/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MOBILE_PATTERN = /^09\d{8}$/u;
const CVS_STORE_PATTERN = /^\d{6}$/u;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recipientNameUnits(value: string): number {
  return Array.from(value).reduce(
    (total, character) =>
      total + (/^[\u0000-\u00ff]$/u.test(character) ? 1 : 2),
    0,
  );
}

function decimalInRange(
  value: unknown,
  minimum: string,
  maximum: string,
): ExactDecimal | null {
  if (typeof value !== "string" && typeof value !== "bigint") return null;

  try {
    const parsed = ExactDecimal.from(value);
    const min = ExactDecimal.from(minimum);
    const max = ExactDecimal.from(maximum);
    const belowMinimum =
      parsed.numerator * min.denominator < min.numerator * parsed.denominator;
    const aboveMaximum =
      parsed.numerator * max.denominator > max.numerator * parsed.denominator;
    return belowMinimum || aboveMaximum ? null : parsed;
  } catch {
    return null;
  }
}

function formatTaipeiDate(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day
    ? `${year}/${Number(month)}/${Number(day)}`
    : null;
}

function resolveTemperature(
  order: MaihuobianOrderInput,
): "常溫" | "冷凍" | null {
  const rawValues =
    order.itemStorageTempClasses && order.itemStorageTempClasses.length > 0
      ? order.itemStorageTempClasses
      : [order.storageTempClass];
  const values = rawValues.map((value) => text(value));

  if (
    values.some((value) => value !== "normal" && value !== "frozen") ||
    new Set(values).size !== 1
  ) {
    return null;
  }
  return values[0] === "normal" ? "常溫" : "冷凍";
}

/**
 * Validates and shapes one official Maihuobian v1.4 import row.
 * This function is pure: no database or HTTP access, no fallback to live data.
 */
export function validateMaihuobianRow(
  order: MaihuobianOrderInput,
): MaihuobianValidationResult {
  const errors: MaihuobianValidationError[] = [];
  const recipientName = text(order.recipientName) || text(order.buyerName);
  const recipientPhone = text(order.recipientPhone) || text(order.buyerPhone);
  const cvsStoreId = text(order.cvsStoreId);
  const temperature = resolveTemperature(order);
  const productSummary = text(order.productSummary);
  const totalPrice = decimalInRange(order.totalPrice, "0", "20000");
  const shippingFee = decimalInRange(order.shippingFee, "0", "100");
  const orderDate = formatTaipeiDate(order.createdAt);
  const notes = text(order.notes);

  if (
    !recipientName ||
    recipientNameUnits(recipientName) > 10 ||
    FORBIDDEN_RECIPIENT_NAME_CHARACTERS.test(recipientName) ||
    CONTROL_CHARACTERS.test(recipientName)
  ) {
    errors.push({
      field: "recipientName",
      code: "RECIPIENT_NAME_INVALID",
      message: "取件人姓名必填、上限 10 字元（5 個中文字），且不可含禁用字元",
    });
  }
  if (!MOBILE_PATTERN.test(recipientPhone)) {
    errors.push({
      field: "recipientPhone",
      code: "RECIPIENT_PHONE_INVALID",
      message: "取件人手機必須是 09 開頭的 10 碼數字",
    });
  }
  if (!CVS_STORE_PATTERN.test(cvsStoreId)) {
    errors.push({
      field: "cvsStoreId",
      code: "CVS_STORE_ID_INVALID",
      message: "取件門市必須是 6 碼數字店號",
    });
  }
  if (!temperature) {
    errors.push({
      field: "storageTempClass",
      code: "STORAGE_TEMPERATURE_INVALID",
      message: "商品必須設定相同的賣貨便溫層（常溫或冷凍）",
    });
  }
  if (
    !productSummary ||
    Array.from(productSummary).length > 200 ||
    CONTROL_CHARACTERS.test(productSummary)
  ) {
    errors.push({
      field: "productSummary",
      code: "PRODUCT_SUMMARY_INVALID",
      message: "商品欄必填、不得含控制字元，且上限 200 字",
    });
  }
  if (!totalPrice) {
    errors.push({
      field: "totalPrice",
      code: "TOTAL_PRICE_OUT_OF_RANGE",
      message: "訂單金額必須介於 0 到 20,000",
    });
  }
  if (!shippingFee) {
    errors.push({
      field: "shippingFee",
      code: "SHIPPING_FEE_OUT_OF_RANGE",
      message: "運費金額必須介於 0 到 100",
    });
  }
  if (!orderDate) {
    errors.push({
      field: "createdAt",
      code: "ORDER_DATE_INVALID",
      message: "買家下訂日期無效",
    });
  }
  if (
    Array.from(notes).length > 200 ||
    (notes.length > 0 && CONTROL_CHARACTERS.test(notes))
  ) {
    errors.push({
      field: "notes",
      code: "NOTES_INVALID",
      message: "商品備註不得含控制字元，且上限 200 字",
    });
  }

  if (
    errors.length > 0 ||
    !temperature ||
    !totalPrice ||
    !shippingFee ||
    !orderDate
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      recipientName,
      recipientPhone,
      cvsStoreId,
      temperature,
      productSummary,
      totalPrice: totalPrice.toDecimalPlaces(2),
      shippingFee: shippingFee.toDecimalPlaces(2),
      orderDate,
      notes,
      socialAccount: "",
    },
  };
}
