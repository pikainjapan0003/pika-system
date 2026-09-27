import { ExactDecimal } from "@workspace/db/transport-cost";
import type {
  InvoiceExtraction,
  InvoiceGroundTruth,
} from "./schema.ts";

export interface InvoiceFieldScores {
  merchantNameCorrect: boolean;
  invoiceDateCorrect: boolean;
  totalAmountCorrect: boolean;
  currencyCorrect: boolean;
  unsafeConfidentError: boolean;
}

export function normalizeMerchantForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("und");
}

export function normalizeCurrencyForComparison(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function amountsAreExactlyEqual(
  left: string,
  right: string,
): boolean {
  try {
    return ExactDecimal.from(left).equals(ExactDecimal.from(right));
  } catch {
    return false;
  }
}

export function scoreInvoicePrediction(
  predicted: InvoiceExtraction,
  groundTruth: InvoiceGroundTruth,
): InvoiceFieldScores {
  const merchantNameCorrect =
    predicted.merchant_name !== null &&
    normalizeMerchantForComparison(predicted.merchant_name) ===
      normalizeMerchantForComparison(groundTruth.merchantName);
  const invoiceDateCorrect =
    predicted.invoice_date !== null &&
    predicted.invoice_date === groundTruth.invoiceDate;
  const totalAmountCorrect =
    predicted.total_amount !== null &&
    amountsAreExactlyEqual(
      predicted.total_amount,
      groundTruth.totalAmount,
    );
  const currencyCorrect =
    predicted.currency !== null &&
    normalizeCurrencyForComparison(predicted.currency) ===
      normalizeCurrencyForComparison(groundTruth.currency);
  const anyIncorrect =
    !merchantNameCorrect ||
    !invoiceDateCorrect ||
    !totalAmountCorrect ||
    !currencyCorrect;
  return {
    merchantNameCorrect,
    invoiceDateCorrect,
    totalAmountCorrect,
    currencyCorrect,
    unsafeConfidentError: anyIncorrect && !predicted.review_required,
  };
}

export function arithmeticMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
