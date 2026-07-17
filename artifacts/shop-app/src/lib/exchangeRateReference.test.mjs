import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateReferenceAuditEntry,
  formatExchangeRateReferenceTime,
  getExchangeRateReferenceSource,
} from "./exchangeRateReference.ts";

const quote = {
  sourceId: "bank-of-taiwan",
  sourceName: "臺灣銀行",
  sourceUrl: "https://rate.bot.com.tw/xrt?Lang=zh-TW",
  currency: "JPY",
  quoteCurrency: "TWD",
  side: "spot_sell",
  rate: "0.2015",
  quotedAt: "2026-07-16T20:21:00+08:00",
  fetchedAt: "2026-07-17T01:00:00.000Z",
};

test("formats the preserved Taipei quote time without changing the rate", () => {
  assert.equal(
    formatExchangeRateReferenceTime(quote.quotedAt),
    "2026/07/16 20:21",
  );
  assert.equal(quote.rate, "0.2015");
});

test("audit entry records an apply action but never implies persistence", () => {
  const audit = createRateReferenceAuditEntry("trip", quote);
  assert.equal(audit.action, "apply_exchange_rate_reference");
  assert.equal(audit.context, "trip");
  assert.equal(audit.rate, "0.2015");
  assert.ok(!("saved" in audit));
});

test("comparison rows retain official source metadata when unavailable", () => {
  assert.deepEqual(
    getExchangeRateReferenceSource({
      status: "unavailable",
      sourceId: "first-bank",
      sourceName: "第一銀行",
      sourceUrl: "https://www.firstbank.com.tw/sites/fcb/Personalhome",
      reason: "official page unavailable",
    }),
    {
      sourceId: "first-bank",
      sourceName: "第一銀行",
      sourceUrl: "https://www.firstbank.com.tw/sites/fcb/Personalhome",
    },
  );
});

test("comparison rows use the same source metadata as an available quote", () => {
  assert.deepEqual(
    getExchangeRateReferenceSource({ status: "available", quote }),
    {
      sourceId: quote.sourceId,
      sourceName: quote.sourceName,
      sourceUrl: quote.sourceUrl,
    },
  );
});
