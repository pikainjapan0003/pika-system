/** Parse the optional five-digit payment reference used for manual matching. */
export function parsePaymentLast5(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{5}$/.test(value)) {
    throw new RangeError("paymentLast5 must contain exactly five digits");
  }
  return value;
}
