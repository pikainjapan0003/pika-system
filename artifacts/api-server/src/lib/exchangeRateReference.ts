import { ExactDecimal } from "@workspace/db/transport-cost";

export const BANK_OF_TAIWAN_RATE_URL = "https://rate.bot.com.tw/xrt?Lang=zh-TW";

export interface ExchangeRateReferenceQuote {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  currency: "JPY";
  quoteCurrency: "TWD";
  side: "spot_sell";
  rate: string;
  quotedAt: string;
  fetchedAt: string;
}

export interface ExchangeRateReferenceAdapter {
  readonly sourceId: string;
  fetchJpyTwdSpotSell(): Promise<ExchangeRateReferenceQuote>;
}

export class ExchangeRateReferenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeRateReferenceUnavailableError";
  }
}

function htmlToText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTaipeiQuoteTime(value: string): string {
  const match =
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      value.trim(),
    );
  if (!match) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan quote time was missing or changed format",
    );
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+08:00`;
}

function normalizeExactRate(value: string): string {
  const normalized = value.trim();
  const exact = ExactDecimal.from(normalized);
  if (exact.isNegative()) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan returned a negative exchange rate",
    );
  }
  const scale = normalized.includes(".")
    ? normalized.length - normalized.indexOf(".") - 1
    : 0;
  return exact.toDecimalPlaces(scale);
}

export function parseBankOfTaiwanJpySpotSell(html: string): {
  rate: string;
  quotedAt: string;
} {
  if (/Challenge Validation/i.test(html)) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan challenged the automated reference request",
    );
  }

  const text = htmlToText(html);
  const timeMatch =
    /牌價最新掛牌時間\s*[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/.exec(
      text,
    );
  if (!timeMatch) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan quote time was not found",
    );
  }

  const jpyRow = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((match) => match[0])
    .find((row) => /(?:日圓|JPY)/i.test(htmlToText(row)));
  if (!jpyRow) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan JPY row was not found",
    );
  }

  const spotSellCell = [...jpyRow.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    .map((match) => ({ attributes: match[1], value: htmlToText(match[2]) }))
    .find(({ attributes }) => {
      const dataTable =
        /data-table\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? "";
      return /即期/.test(dataTable) && /賣出/.test(dataTable);
    });
  if (!spotSellCell || !/^\d+(?:\.\d+)?$/.test(spotSellCell.value)) {
    throw new ExchangeRateReferenceUnavailableError(
      "Bank of Taiwan JPY spot selling rate was not found",
    );
  }

  return {
    rate: normalizeExactRate(spotSellCell.value),
    quotedAt: normalizeTaipeiQuoteTime(timeMatch[1]),
  };
}

export function createBankOfTaiwanRateAdapter(
  options: {
    fetchImpl?: typeof fetch;
    clock?: () => Date;
  } = {},
): ExchangeRateReferenceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? (() => new Date());

  return {
    sourceId: "bank-of-taiwan",
    async fetchJpyTwdSpotSell() {
      const response = await fetchImpl(BANK_OF_TAIWAN_RATE_URL, {
        headers: { Accept: "text/html" },
      });
      if (!response.ok) {
        throw new ExchangeRateReferenceUnavailableError(
          `Bank of Taiwan reference request failed with HTTP ${response.status}`,
        );
      }
      const parsed = parseBankOfTaiwanJpySpotSell(await response.text());
      return {
        sourceId: "bank-of-taiwan",
        sourceName: "臺灣銀行",
        sourceUrl: BANK_OF_TAIWAN_RATE_URL,
        currency: "JPY",
        quoteCurrency: "TWD",
        side: "spot_sell",
        rate: parsed.rate,
        quotedAt: parsed.quotedAt,
        fetchedAt: clock().toISOString(),
      };
    },
  };
}

export async function fetchFirstAvailableExchangeRateReference(
  adapters: readonly ExchangeRateReferenceAdapter[],
): Promise<ExchangeRateReferenceQuote> {
  const failures: string[] = [];
  for (const adapter of adapters) {
    try {
      return await adapter.fetchJpyTwdSpotSell();
    } catch (error) {
      failures.push(
        `${adapter.sourceId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  throw new ExchangeRateReferenceUnavailableError(
    `No exchange-rate reference source was available (${failures.join("; ")})`,
  );
}

export const defaultExchangeRateReferenceAdapters = [
  createBankOfTaiwanRateAdapter(),
] as const;
