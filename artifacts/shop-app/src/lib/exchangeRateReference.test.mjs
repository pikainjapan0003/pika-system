import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateReferenceAuditEntry,
  formatExchangeRateReferenceTime,
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
