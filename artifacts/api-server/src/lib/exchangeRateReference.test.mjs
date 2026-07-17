import assert from "node:assert/strict";
import test from "node:test";

import {
  BANK_OF_TAIWAN_RATE_URL,
  FIRST_BANK_RATE_URL,
  LAND_BANK_RATE_URL,
  SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES,
  TAIWAN_COOPERATIVE_BANK_API_URL,
  TAIWAN_COOPERATIVE_BANK_RATE_URL,
  ExchangeRateReferenceUnavailableError,
  createBankOfTaiwanRateAdapter,
  createTaiwanCooperativeBankRateAdapter,
  fetchAllExchangeRateReferences,
  fetchFirstAvailableExchangeRateReference,
  parseBankOfTaiwanJpySpotSell,
  parseFirstBankJpySpotSell,
  parseLandBankJpySpotSell,
  parseTaiwanCooperativeBankJpySpotSell,
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

const landBankPageFixture = `
  <p>更新時間：2026/07/17 23:00:00</p>
  <table><tbody><tr>
    <td headers="type">日圓 (JPY)</td>
    <td headers="type jpy sight 1-1">0.1965</td>
    <td headers="type jpy sight 1-2">0.2016</td>
    <td headers="type jpy cash 2-1">0.1916</td>
    <td headers="type jpy cash 2-2">0.2033</td>
  </tr></tbody></table>
`;

const firstBankPageFixture = `
  <p>資料生效日期 ： 2026/07/17 16:06:05</p>
  <table><tr><td>日圓(JPY)</td><td>即期</td><td>0.19700</td><td>0.20100</td></tr></table>
`;

const cooperativeBankPayload = {
  updateTime: "資料時間 2026-07-17 23:00:00",
  time: "查詢時間 2026-07-18 02:14:51",
  result: [
    { Currency: "JPY", Type: "買入", PromptExchange: "0.1961" },
    { Currency: "JPY", Type: "賣出", PromptExchange: "0.2021" },
  ],
};

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

test("parses Land Bank official HTML by the labelled spot-selling cell", () => {
  assert.deepEqual(parseLandBankJpySpotSell(landBankPageFixture), {
    rate: "0.2016",
    quotedAt: "2026-07-17T23:00:00+08:00",
  });
});

test("parses Taiwan Cooperative Bank official JSON by currency and side", () => {
  assert.deepEqual(
    parseTaiwanCooperativeBankJpySpotSell(cooperativeBankPayload),
    {
      rate: "0.2021",
      quotedAt: "2026-07-17T23:00:00+08:00",
    },
  );
});

test("parses First Bank official table without confusing cash or buy rates", () => {
  assert.deepEqual(parseFirstBankJpySpotSell(firstBankPageFixture), {
    rate: "0.20100",
    quotedAt: "2026-07-17T16:06:05+08:00",
  });
});

test("all bank parsers fail closed on a zero reference rate", () => {
  assert.throws(
    () =>
      parseLandBankJpySpotSell(landBankPageFixture.replace(">0.2016<", ">0<")),
    /non-positive exchange rate/,
  );
  assert.throws(
    () =>
      parseTaiwanCooperativeBankJpySpotSell({
        ...cooperativeBankPayload,
        result: [{ Currency: "JPY", Type: "賣出", PromptExchange: "0" }],
      }),
    /non-positive exchange rate/,
  );
  assert.throws(
    () =>
      parseFirstBankJpySpotSell(firstBankPageFixture.replace("0.20100", "0")),
    /non-positive exchange rate/,
  );
});

test("Taiwan Cooperative Bank adapter preserves its CSRF session and quote metadata", async () => {
  const calls = [];
  const adapter = createTaiwanCooperativeBankRateAdapter({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === TAIWAN_COOPERATIVE_BANK_RATE_URL) {
        return new Response(
          '<input name="__RequestVerificationToken" type="hidden" value="test-token">',
          {
            status: 200,
            headers: { "Set-Cookie": "csrf=session-value; Path=/" },
          },
        );
      }
      assert.equal(url, TAIWAN_COOPERATIVE_BANK_API_URL);
      return Response.json(cooperativeBankPayload);
    },
    clock: () => new Date("2026-07-17T18:15:00.000Z"),
  });

  assert.deepEqual(await adapter.fetchJpyTwdSpotSell(), {
    sourceId: "taiwan-cooperative-bank",
    sourceName: "合作金庫",
    sourceUrl: TAIWAN_COOPERATIVE_BANK_RATE_URL,
    currency: "JPY",
    quoteCurrency: "TWD",
    side: "spot_sell",
    rate: "0.2021",
    quotedAt: "2026-07-17T23:00:00+08:00",
    fetchedAt: "2026-07-17T18:15:00.000Z",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, "POST");
  assert.match(calls[1].init.headers.Cookie, /csrf=session-value/);
  assert.match(
    String(calls[1].init.body),
    /__RequestVerificationToken=test-token/,
  );
});

test("comparison keeps unavailable banks visible without inventing zero", async () => {
  const results = await fetchAllExchangeRateReferences([
    {
      sourceId: "available",
      sourceName: "可用銀行",
      sourceUrl: LAND_BANK_RATE_URL,
      async fetchJpyTwdSpotSell() {
        return {
          sourceId: "available",
          sourceName: "可用銀行",
          sourceUrl: LAND_BANK_RATE_URL,
          currency: "JPY",
          quoteCurrency: "TWD",
          side: "spot_sell",
          rate: "0.2016",
          quotedAt: "2026-07-17T23:00:00+08:00",
          fetchedAt: "2026-07-17T18:15:00.000Z",
        };
      },
    },
    {
      sourceId: "unavailable",
      sourceName: "不可用銀行",
      sourceUrl: FIRST_BANK_RATE_URL,
      async fetchJpyTwdSpotSell() {
        throw new Error("WAF blocked the request");
      },
    },
  ]);

  assert.equal(results[0].status, "available");
  assert.equal(results[1].status, "unavailable");
  assert.equal(results[1].sourceName, "不可用銀行");
  assert.equal("rate" in results[1], false);
  assert.equal(JSON.stringify(results).includes('"rate":"0"'), false);
});

test("unverified T-29b candidates remain explicitly disconnected", () => {
  assert.equal(SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES.length, 31);
  assert.ok(SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES.includes("華南銀行"));
  assert.ok(SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES.includes("花旗（台灣）"));
  assert.ok(!SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES.includes("臺灣土地銀行"));
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
      sourceName: "不可用銀行",
      sourceUrl: "https://example.invalid/unavailable",
      async fetchJpyTwdSpotSell() {
        throw new Error("offline");
      },
    },
    {
      sourceId: "backup",
      sourceName: "測試備援",
      sourceUrl: "https://example.invalid/rates",
      async fetchJpyTwdSpotSell() {
        return expected;
      },
    },
  ]);
  assert.deepEqual(quote, expected);
});
