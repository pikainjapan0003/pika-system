import assert from "node:assert/strict";
import test from "node:test";

import {
  BANK_OF_TAIWAN_RATE_URL,
  ExchangeRateReferenceUnavailableError,
  createBankOfTaiwanRateAdapter,
  fetchFirstAvailableExchangeRateReference,
  parseBankOfTaiwanJpySpotSell,
} from "./exchangeRateReference.ts";

const officialPageFixture = `
  <html><body>
    <p>牌價最新掛牌時間：2026/07/16 20:21</p>
    <table><tbody><tr>
      <td data-table="幣別">日圓 (JPY)</td>
      <td data-table="本行現金買入">0.1897</td>
      <td data-table="本行現金賣出">0.2025</td>
      <td data-table="本行即期買入">0.1965</td>
      <td data-table="本行即期賣出">0.2015</td>
    </tr></tbody></table>
  </body></html>
`;

test("parses the official JPY spot selling cell and Taipei quote time", () => {
  assert.deepEqual(parseBankOfTaiwanJpySpotSell(officialPageFixture), {
    rate: "0.2015",
    quotedAt: "2026-07-16T20:21:00+08:00",
  });
});

test("adapter keeps source, quote time, and fetch time with the reference", async () => {
  const adapter = createBankOfTaiwanRateAdapter({
    fetchImpl: async (url) => {
      assert.equal(url, BANK_OF_TAIWAN_RATE_URL);
      return new Response(officialPageFixture, { status: 200 });
    },
    clock: () => new Date("2026-07-17T01:00:00.000Z"),
  });

  assert.deepEqual(await adapter.fetchJpyTwdSpotSell(), {
    sourceId: "bank-of-taiwan",
    sourceName: "臺灣銀行",
    sourceUrl: BANK_OF_TAIWAN_RATE_URL,
    currency: "JPY",
    quoteCurrency: "TWD",
    side: "spot_sell",
    rate: "0.2015",
    quotedAt: "2026-07-16T20:21:00+08:00",
    fetchedAt: "2026-07-17T01:00:00.000Z",
  });
});

test("challenge pages fail closed instead of returning a guessed rate", () => {
  assert.throws(
    () => parseBankOfTaiwanJpySpotSell("<title>Challenge Validation</title>"),
    ExchangeRateReferenceUnavailableError,
  );
});

test("multi-source orchestration falls through without changing quote semantics", async () => {
  const expected = {
    sourceId: "backup",
    sourceName: "測試備援",
    sourceUrl: "https://example.invalid/rates",
    currency: "JPY",
    quoteCurrency: "TWD",
    side: "spot_sell",
    rate: "0.2015",
    quotedAt: "2026-07-16T20:21:00+08:00",
    fetchedAt: "2026-07-17T01:00:00.000Z",
  };
  const quote = await fetchFirstAvailableExchangeRateReference([
    {
      sourceId: "unavailable",
      async fetchJpyTwdSpotSell() {
        throw new Error("offline");
      },
    },
    {
      sourceId: "backup",
      async fetchJpyTwdSpotSell() {
        return expected;
      },
    },
  ]);
  assert.deepEqual(quote, expected);
});
