import { z } from "zod/v4";

const nullableMerchantNameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0, "店名不可只有空白")
  .nullable();

const nullableDateSchema = z
  .string()
  .refine(isValidIsoDate, "日期必須是有效的 YYYY-MM-DD")
  .nullable();

const nullableAmountSchema = z
  .string()
  .max(100)
  .refine(isPositiveAmountString, "總額必須是正數數字字串")
  .nullable();

const nullableCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "幣別必須是大寫三碼")
  .nullable();

const evidenceValueSchema = z.string().min(1).max(80).nullable();

export const invoiceEvidenceSchema = z
  .object({
    merchant_name: evidenceValueSchema,
    invoice_date: evidenceValueSchema,
    total_amount: evidenceValueSchema,
    currency: evidenceValueSchema,
  })
  .strict();

export const invoiceExtractionSchema = z
  .object({
    merchant_name: nullableMerchantNameSchema,
    invoice_date: nullableDateSchema,
    total_amount: nullableAmountSchema,
    currency: nullableCurrencySchema,
    review_required: z.boolean(),
    review_reasons: z.array(z.string().min(1).max(160)).max(10),
    evidence: invoiceEvidenceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const hasMissingField =
      value.merchant_name === null ||
      value.invoice_date === null ||
      value.total_amount === null ||
      value.currency === null;
    if (hasMissingField && !value.review_required) {
      context.addIssue({
        code: "custom",
        path: ["review_required"],
        message: "任一主要欄位為 null 時必須要求複查",
      });
    }
    if (!value.review_required && value.review_reasons.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["review_reasons"],
        message: "未要求額外複查時，原因陣列必須為空",
      });
    }
  });

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export interface InvoiceGroundTruth {
  merchantName: string;
  invoiceDate: string;
  totalAmount: string;
  currency: string;
}

const groundTruthInputSchema = z
  .object({
    merchantName: z.string().min(1).max(200),
    invoiceDate: z.string().min(1).max(10),
    totalAmount: z.string().min(1).max(100),
    currency: z.string().min(1).max(3),
  })
  .strict();

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= days[month - 1];
}

export function isPositiveAmountString(value: string): boolean {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return false;
  const integerDigits = match[1].replace(/^0+/, "") || "0";
  const fractionDigits = match[2] ?? "";
  if (integerDigits.length > 18 || fractionDigits.length > 12) {
    return false;
  }
  return /[1-9]/.test(`${match[1]}${fractionDigits}`);
}

export function parseGroundTruthInput(input: unknown): InvoiceGroundTruth {
  const parsed = groundTruthInputSchema.parse(input);
  const merchantName = parsed.merchantName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  if (!merchantName) {
    throw new TypeError("店名不可只有空白");
  }
  const invoiceDate = parsed.invoiceDate.trim();
  if (!isValidIsoDate(invoiceDate)) {
    throw new TypeError("日期必須是有效的 YYYY-MM-DD");
  }
  const totalAmount = parsed.totalAmount
    .normalize("NFKC")
    .trim()
    .replace(/,/g, "");
  if (!isPositiveAmountString(totalAmount)) {
    throw new TypeError("總額必須是大於 0 的數字");
  }
  const currency = parsed.currency.normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("幣別必須是三碼英文，例如 TWD、JPY、USD");
  }
  return { merchantName, invoiceDate, totalAmount, currency };
}

export interface CorrectedInvoiceFields {
  merchantName: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  currency: string | null;
}

const nullableCorrectionString = z.string().max(200).nullable();
const correctionInputSchema = z
  .object({
    merchantName: nullableCorrectionString,
    invoiceDate: z.string().max(10).nullable(),
    totalAmount: z.string().max(100).nullable(),
    currency: z.string().max(3).nullable(),
  })
  .strict();

export function parseCorrectedInvoiceFields(
  input: unknown,
): CorrectedInvoiceFields {
  const parsed = correctionInputSchema.parse(input);
  const merchantName =
    parsed.merchantName === null
      ? null
      : parsed.merchantName.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (merchantName === "") throw new TypeError("人工修正店名不可為空白");

  const invoiceDate =
    parsed.invoiceDate === null ? null : parsed.invoiceDate.trim();
  if (invoiceDate !== null && !isValidIsoDate(invoiceDate)) {
    throw new TypeError("人工修正日期必須是有效的 YYYY-MM-DD");
  }

  const totalAmount =
    parsed.totalAmount === null
      ? null
      : parsed.totalAmount.normalize("NFKC").trim().replace(/,/g, "");
  if (totalAmount !== null && !isPositiveAmountString(totalAmount)) {
    throw new TypeError("人工修正總額必須是大於 0 的數字");
  }

  const currency =
    parsed.currency === null
      ? null
      : parsed.currency.normalize("NFKC").trim().toUpperCase();
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("人工修正幣別必須是三碼英文");
  }
  return { merchantName, invoiceDate, totalAmount, currency };
}
