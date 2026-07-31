import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";

export type StoreCreditDirection = "credit" | "debit";
export type StoreCreditTransactionType =
  | "grant"
  | "adjust"
  | "spend"
  | "reversal";

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

export interface PreparedOrderStoreCreditApplication {
  creditSpent: ExactDecimal;
  payableAfterCredit: ExactDecimal;
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

function ensureSpendWithinBalance(
  amount: ExactDecimal,
  availableBalanceInput: Exclude<DecimalInput, null | undefined>,
): void {
  const availableBalance = ExactDecimal.from(availableBalanceInput);
  if (compare(availableBalance, ExactDecimal.zero()) < 0) {
    throw new RangeError("Available store credit balance cannot be negative");
  }
  if (compare(amount, availableBalance) > 0) {
    throw new RangeError("Store credit spend exceeds available balance");
  }
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

/**
 * C5: an owner adjustment stores a positive magnitude and uses direction for
 * its sign. A debit adjustment may reach exactly zero but never cross it.
 */
export function prepareStoreCreditAdjustment(input: {
  amount: Exclude<DecimalInput, null | undefined>;
  availableBalance: Exclude<DecimalInput, null | undefined>;
}): PreparedStoreCreditTransaction {
  const signedAmount = ExactDecimal.from(input.amount);
  if (signedAmount.equals(ExactDecimal.zero())) {
    throw new RangeError("Store credit adjustment must not be zero");
  }
  if (!signedAmount.isNegative()) {
    return {
      direction: "credit",
      type: "adjust",
      amount: signedAmount,
      relatedOrderId: null,
    };
  }

  const magnitude = signedAmount.multiply(ExactDecimal.from("-1"));
  ensureSpendWithinBalance(magnitude, input.availableBalance);
  return {
    direction: "debit",
    type: "adjust",
    amount: magnitude,
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
  const relatedOrderId = requirePositiveOrderId(input.relatedOrderId);

  ensureSpendWithinBalance(amount, input.availableBalance);

  return {
    direction: "debit",
    type: "spend",
    amount,
    relatedOrderId,
  };
}

/**
 * C2/C5/C7: apply an explicitly requested amount to an order's terminal
 * payable value. Missing or zero means no application; a positive request
 * requires a linked customer and may reach, but never cross, exact zero.
 */
export function prepareOrderStoreCreditApplication(input: {
  orderPayable: Exclude<DecimalInput, null | undefined>;
  requestedAmount?: DecimalInput;
  availableBalance: Exclude<DecimalInput, null | undefined>;
  customerId: number | null;
}): PreparedOrderStoreCreditApplication {
  const orderPayable = ExactDecimal.from(input.orderPayable);
  if (compare(orderPayable, ExactDecimal.zero()) < 0) {
    throw new RangeError("Order payable cannot be negative");
  }

  const requested =
    input.requestedAmount == null ||
    (typeof input.requestedAmount === "string" &&
      input.requestedAmount.trim() === "")
      ? ExactDecimal.zero()
      : ExactDecimal.from(input.requestedAmount);
  if (requested.isNegative()) {
    throw new RangeError("Store credit amount cannot be negative");
  }
  if (requested.equals(ExactDecimal.zero())) {
    return {
      creditSpent: ExactDecimal.zero(),
      payableAfterCredit: orderPayable,
    };
  }
  if (input.customerId === null) {
    throw new RangeError("Store credit requires a linked customer");
  }
  if (compare(requested, orderPayable) > 0) {
    throw new RangeError("Store credit cannot exceed order payable");
  }

  ensureSpendWithinBalance(requested, input.availableBalance);
  return {
    creditSpent: requested,
    payableAfterCredit: orderPayable.add(
      requested.multiply(ExactDecimal.from("-1")),
    ),
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
