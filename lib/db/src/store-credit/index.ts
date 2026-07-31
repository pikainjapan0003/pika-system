import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";

export type StoreCreditDirection = "credit" | "debit";
export type StoreCreditTransactionType = "grant" | "spend" | "reversal";

export interface StoreCreditLedgerEntry {
  direction: StoreCreditDirection;
  type: StoreCreditTransactionType;
  amount: Exclude<DecimalInput, null | undefined>;
  relatedOrderId?: number | null;
}

export interface PreparedStoreCreditTransaction {
  direction: StoreCreditDirection;
  type: StoreCreditTransactionType;
  amount: ExactDecimal;
  relatedOrderId: number | null;
}

function compare(left: ExactDecimal, right: ExactDecimal): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function requirePositiveAmount(
  value: Exclude<DecimalInput, null | undefined>,
): ExactDecimal {
  const amount = ExactDecimal.from(value);
  if (compare(amount, ExactDecimal.zero()) <= 0) {
    throw new RangeError("Store credit amount must be greater than zero");
  }
  return amount;
}

function requirePositiveOrderId(orderId: number): number {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new RangeError("Related order id must be a positive safe integer");
  }
  return orderId;
}

/** C1-C8: ledger balance is the exact sum of credits minus debits. */
export function calculateStoreCreditBalance(
  entries: readonly StoreCreditLedgerEntry[],
): ExactDecimal {
  return entries.reduce((balance, entry) => {
    const amount = requirePositiveAmount(entry.amount);
    return entry.direction === "credit"
      ? balance.add(amount)
      : balance.add(amount.multiply(ExactDecimal.from("-1")));
  }, ExactDecimal.zero());
}

/** C1: only an explicitly positive owner grant can create credit. */
export function prepareStoreCreditGrant(
  amount: Exclude<DecimalInput, null | undefined>,
): PreparedStoreCreditTransaction {
  return {
    direction: "credit",
    type: "grant",
    amount: requirePositiveAmount(amount),
    relatedOrderId: null,
  };
}

/** C2/C5: spending may reach exactly zero but must never make balance negative. */
export function prepareStoreCreditSpend(input: {
  amount: Exclude<DecimalInput, null | undefined>;
  availableBalance: Exclude<DecimalInput, null | undefined>;
  relatedOrderId: number;
}): PreparedStoreCreditTransaction {
  const amount = requirePositiveAmount(input.amount);
  const availableBalance = ExactDecimal.from(input.availableBalance);
  const relatedOrderId = requirePositiveOrderId(input.relatedOrderId);

  if (compare(availableBalance, ExactDecimal.zero()) < 0) {
    throw new RangeError("Available store credit balance cannot be negative");
  }
  if (compare(amount, availableBalance) > 0) {
    throw new RangeError("Store credit spend exceeds available balance");
  }

  return {
    direction: "debit",
    type: "spend",
    amount,
    relatedOrderId,
  };
}

/**
 * C3: a cancellation reversal must copy the one original spend for that exact
 * order, and an existing reversal makes the operation permanently ineligible.
 */
export function prepareStoreCreditReversal(input: {
  entries: readonly StoreCreditLedgerEntry[];
  relatedOrderId: number;
}): PreparedStoreCreditTransaction {
  const relatedOrderId = requirePositiveOrderId(input.relatedOrderId);
  const relatedEntries = input.entries.filter(
    (entry) => entry.relatedOrderId === relatedOrderId,
  );
  const originalSpends = relatedEntries.filter(
    (entry) => entry.type === "spend" && entry.direction === "debit",
  );

  if (originalSpends.length !== 1) {
    throw new RangeError(
      "Store credit reversal requires exactly one original order spend",
    );
  }
  if (
    relatedEntries.some(
      (entry) => entry.type === "reversal" && entry.direction === "credit",
    )
  ) {
    throw new RangeError("Store credit spend has already been reversed");
  }

  return {
    direction: "credit",
    type: "reversal",
    amount: requirePositiveAmount(originalSpends[0].amount),
    relatedOrderId,
  };
}
