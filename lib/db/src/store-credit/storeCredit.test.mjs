import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateStoreCreditBalance,
  prepareOrderStoreCreditApplication,
  prepareStoreCreditAdjustment,
  prepareStoreCreditGrant,
  prepareStoreCreditReversal,
  prepareStoreCreditSpend,
} from "./index.ts";

test("balance sums decimal credits minus debits without float drift", () => {
  const balance = calculateStoreCreditBalance([
    { direction: "credit", type: "grant", amount: "100.10" },
    { direction: "credit", type: "grant", amount: "0.20" },
    {
      direction: "debit",
      type: "spend",
      amount: "0.30",
      relatedOrderId: 1,
    },
  ]);

  assert.equal(balance.toDecimalPlaces(12), "100.000000000000");
});

test("grant amount must be greater than zero", () => {
  assert.equal(
    prepareStoreCreditGrant("12.34").amount.toDecimalPlaces(12),
    "12.340000000000",
  );
  assert.throws(() => prepareStoreCreditGrant("0"), /greater than zero/);
  assert.throws(() => prepareStoreCreditGrant("-0.01"), /greater than zero/);
});

test("adjustment keeps an exact positive magnitude and derives its direction", () => {
  const credit = prepareStoreCreditAdjustment({
    amount: "0.100000000001",
    availableBalance: "5",
  });
  assert.equal(credit.direction, "credit");
  assert.equal(credit.type, "adjust");
  assert.equal(credit.amount.toDecimalPlaces(12), "0.100000000001");

  const debit = prepareStoreCreditAdjustment({
    amount: "-5",
    availableBalance: "5.000000000000",
  });
  assert.equal(debit.direction, "debit");
  assert.equal(debit.type, "adjust");
  assert.equal(debit.amount.toDecimalPlaces(12), "5.000000000000");
});

test("adjustment rejects zero and a debit that would make balance negative", () => {
  assert.throws(
    () =>
      prepareStoreCreditAdjustment({
        amount: "0",
        availableBalance: "5",
      }),
    /must not be zero/,
  );
  assert.throws(
    () =>
      prepareStoreCreditAdjustment({
        amount: "-5.000000000001",
        availableBalance: "5",
      }),
    /exceeds available balance/,
  );
});

test("spend may reduce balance to exactly zero", () => {
  const spend = prepareStoreCreditSpend({
    amount: "100",
    availableBalance: "100.000000000000",
    relatedOrderId: 42,
  });

  assert.equal(spend.direction, "debit");
  assert.equal(spend.type, "spend");
  assert.equal(spend.amount.toDecimalPlaces(12), "100.000000000000");
  assert.equal(spend.relatedOrderId, 42);
});

test("spend rejects an amount that would make balance negative", () => {
  assert.throws(
    () =>
      prepareStoreCreditSpend({
        amount: "100.000000000001",
        availableBalance: "100",
        relatedOrderId: 42,
      }),
    /exceeds available balance/,
  );
});

test("reversal copies the exact original spend for the same order", () => {
  const entries = [
    {
      direction: "debit",
      type: "spend",
      amount: "12.345678901234",
      relatedOrderId: 9,
    },
    {
      direction: "debit",
      type: "spend",
      amount: "99",
      relatedOrderId: 10,
    },
  ];

  const reversal = prepareStoreCreditReversal({
    entries,
    relatedOrderId: 9,
  });

  assert.equal(reversal.direction, "credit");
  assert.equal(reversal.type, "reversal");
  assert.equal(reversal.amount.toDecimalPlaces(12), "12.345678901234");
  assert.equal(reversal.relatedOrderId, 9);
});

test("reversal rejects a missing original spend and a second reversal", () => {
  assert.throws(
    () =>
      prepareStoreCreditReversal({
        entries: [],
        relatedOrderId: 9,
      }),
    /exactly one original order spend/,
  );

  assert.throws(
    () =>
      prepareStoreCreditReversal({
        entries: [
          {
            direction: "debit",
            type: "spend",
            amount: "12.34",
            relatedOrderId: 9,
          },
          {
            direction: "credit",
            type: "reversal",
            amount: "12.34",
            relatedOrderId: 9,
          },
        ],
        relatedOrderId: 9,
      }),
    /already been reversed/,
  );
});

test("order credit may reduce payable to exact zero without floating-point drift", () => {
  const result = prepareOrderStoreCreditApplication({
    orderPayable: "0.3",
    requestedAmount: "0.3",
    availableBalance: "0.3",
    customerId: 1,
  });
  assert.equal(result.creditSpent.toDecimalPlaces(12), "0.300000000000");
  assert.equal(result.payableAfterCredit.toDecimalPlaces(12), "0.000000000000");
});

test("order credit rejects missing customer, over-balance, and over-payable requests", () => {
  assert.throws(
    () =>
      prepareOrderStoreCreditApplication({
        orderPayable: "100",
        requestedAmount: "1",
        availableBalance: "100",
        customerId: null,
      }),
    /requires a linked customer/,
  );
  assert.throws(
    () =>
      prepareOrderStoreCreditApplication({
        orderPayable: "100",
        requestedAmount: "51",
        availableBalance: "50",
        customerId: 1,
      }),
    /exceeds available balance/,
  );
  assert.throws(
    () =>
      prepareOrderStoreCreditApplication({
        orderPayable: "100",
        requestedAmount: "101",
        availableBalance: "200",
        customerId: 1,
      }),
    /cannot exceed order payable/,
  );
});
