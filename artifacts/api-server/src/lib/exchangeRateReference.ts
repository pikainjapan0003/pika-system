import { ExactDecimal } from "@workspace/db/transport-cost";

export const BANK_OF_TAIWAN_RATE_URL = "https://rate.bot.com.tw/xrt?Lang=zh-TW";
export const LAND_BANK_RATE_URL = "https://rate.landbank.com.tw/zh-TW/Foreign/";
export const TAIWAN_COOPERATIVE_BANK_RATE_URL =
  "https://www.tcb-bank.com.tw/personal-banking/deposit-exchange/exchange-rate/spot";
export const TAIWAN_COOPERATIVE_BANK_API_URL =
  "https://www.tcb-bank.com.tw/api/client/ForeignExchange/GetSpotForeignExchange";
export const FIRST_BANK_RATE_URL =
  "https://www.firstbank.com.tw/sites/fcb/Personalhome";

/**
 * T-29b found official entry pages for these banks, but did not verify a stable,
 * anonymous source that may be automated. They remain deliberately disconnected.
 */
export const SKIPPED_UNVERIFIED_RATE_SOURCE_NAMES = [
  "華南銀行",
  "彰化銀行",
  "兆豐銀行",
  "臺灣企銀",
  "國泰世華",
  "中國信託",
  "玉山銀行",
  "台北富邦",
  "永豐銀行",
  "元大銀行",
  "台新銀行",
  "上海商銀",
  "凱基銀行",
  "高雄銀行",
  "遠東商銀",
  "瑞興銀行",
  "陽信銀行",
  "安泰銀行",
  "華泰銀行",
  "新光銀行",
  "台中銀行",
  "三信商銀",
  "聯邦銀行",
  "大台北銀行",
  "王道銀行",
  "連線銀行",
  "將來銀行",
  "渣打銀行（台灣）",
  "匯豐銀行（台灣）",
  "星展銀行（台灣）",
  "花旗（台灣）",
] as const;

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
  readonly sourceName: string;
  readonly sourceUrl: string;
  fetchJpyTwdSpotSell(): Promise<ExchangeRateReferenceQuote>;
}

export type ExchangeRateReferenceResult =
  | {
      status: "available";
      quote: ExchangeRateReferenceQuote;
    }
  | {
      status: "unavailable";
      sourceId: string;
      sourceName: string;
      sourceUrl: string;
      reason: string;
    };

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

function normalizeTaipeiQuoteTime(value: string, sourceName: string): string {
  const match =
    /^(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      value.trim(),
    );
  if (!match) {
    throw new ExchangeRateReferenceUnavailableError(
      `${sourceName} quote time was missing or changed format`,
    );
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+08:00`;
}

function normalizeExactRate(value: string, sourceName: string): string {
  const normalized = value.trim();
  let exact: ExactDecimal;
  try {
    exact = ExactDecimal.from(normalized);
  } catch {
    throw new ExchangeRateReferenceUnavailableError(
      `${sourceName} returned an invalid exchange rate`,
    );
  }
  if (exact.numerator <= 0n) {
    throw new ExchangeRateReferenceUnavailableError(
      `${sourceName} returned a non-positive exchange rate`,
    );
  }
  const scale = normalized.includes(".")
    ? normalized.length - normalized.indexOf(".") - 1
    : 0;
  return exact.toDecimalPlaces(scale);
}

function createQuote(
  adapter: Pick<
    ExchangeRateReferenceAdapter,
    "sourceId" | "sourceName" | "sourceUrl"
  >,
  parsed: { rate: string; quotedAt: string },
  fetchedAt: string,
): ExchangeRateReferenceQuote {
  return {
    ...adapter,
    currency: "JPY",
    quoteCurrency: "TWD",
    side: "spot_sell",
    rate: parsed.rate,
    quotedAt: parsed.quotedAt,
    fetchedAt,
  };
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
    rate: normalizeExactRate(spotSellCell.value, "Bank of Taiwan"),
    quotedAt: normalizeTaipeiQuoteTime(timeMatch[1], "Bank of Taiwan"),
  };
}

export function parseLandBankJpySpotSell(html: string): {
  rate: string;
  quotedAt: string;
} {
  const text = htmlToText(html);
  const timeMatch =
    /更新時間\s*[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/.exec(text);
  const jpyRow = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((match) => match[0])
    .find((row) => /(?:日圓|JPY)/i.test(htmlToText(row)));
  const spotSellCell = jpyRow
    ? [...jpyRow.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
        .map((match) => ({ attributes: match[1], value: htmlToText(match[2]) }))
        .find(({ attributes }) =>
          /headers\s*=\s*["'][^"']*\bsight\b[^"']*\b1-2\b/i.test(attributes),
        )
    : undefined;

  if (
    !timeMatch ||
    !spotSellCell ||
    !/^\d+(?:\.\d+)?$/.test(spotSellCell.value)
  ) {
    throw new ExchangeRateReferenceUnavailableError(
      "Land Bank JPY spot selling quote was not found",
    );
  }

  return {
    rate: normalizeExactRate(spotSellCell.value, "Land Bank"),
    quotedAt: normalizeTaipeiQuoteTime(timeMatch[1], "Land Bank"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTaiwanCooperativeBankJpySpotSell(payload: unknown): {
  rate: string;
  quotedAt: string;
} {
  if (!isRecord(payload) || !Array.isArray(payload.result)) {
    throw new ExchangeRateReferenceUnavailableError(
      "Taiwan Cooperative Bank response changed format",
    );
  }
  const row = payload.result.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.Currency === "JPY" &&
      candidate.Type === "賣出" &&
      typeof candidate.PromptExchange === "string",
  );
  const timeValue =
    typeof payload.updateTime === "string"
      ? /(?:資料時間\s*)?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/.exec(
          payload.updateTime,
        )?.[1]
      : undefined;
  if (!row || !timeValue) {
    throw new ExchangeRateReferenceUnavailableError(
      "Taiwan Cooperative Bank JPY spot selling quote was not found",
    );
  }

  return {
    rate: normalizeExactRate(
      row.PromptExchange as string,
      "Taiwan Cooperative Bank",
    ),
    quotedAt: normalizeTaipeiQuoteTime(timeValue, "Taiwan Cooperative Bank"),
  };
}

export function parseFirstBankJpySpotSell(html: string): {
  rate: string;
  quotedAt: string;
} {
  const text = htmlToText(html);
  const timeMatch =
    /資料生效日期\s*[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/.exec(
      text,
    );
  const rowMatch =
    /日圓\s*\(JPY\)\s*即期\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/.exec(text);
  if (!timeMatch || !rowMatch) {
    throw new ExchangeRateReferenceUnavailableError(
      "First Bank JPY spot selling quote was not found",
    );
  }

  return {
    rate: normalizeExactRate(rowMatch[2], "First Bank"),
    quotedAt: normalizeTaipeiQuoteTime(timeMatch[1], "First Bank"),
  };
}

function cookieHeaderFromResponse(response: Response): string {
  const headersWithCookies = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithCookies.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    return setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  }
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function createHtmlAdapter(options: {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  parse: (html: string) => { rate: string; quotedAt: string };
  fetchImpl?: typeof fetch;
  clock?: () => Date;
}): ExchangeRateReferenceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const metadata = {
    sourceId: options.sourceId,
    sourceName: options.sourceName,
    sourceUrl: options.sourceUrl,
  };
  return {
    ...metadata,
    async fetchJpyTwdSpotSell() {
      const response = await fetchImpl(options.sourceUrl, {
        headers: {
          Accept: "text/html",
          "User-Agent": "PIKA-rate-reference/1.0",
        },
      });
      if (!response.ok) {
        throw new ExchangeRateReferenceUnavailableError(
          `${options.sourceName} reference request failed with HTTP ${response.status}`,
        );
      }
      return createQuote(
        metadata,
        options.parse(await response.text()),
        clock().toISOString(),
      );
    },
  };
}

export function createBankOfTaiwanRateAdapter(
  options: {
    fetchImpl?: typeof fetch;
    clock?: () => Date;
  } = {},
): ExchangeRateReferenceAdapter {
  return createHtmlAdapter({
    sourceId: "bank-of-taiwan",
    sourceName: "臺灣銀行",
    sourceUrl: BANK_OF_TAIWAN_RATE_URL,
    parse: parseBankOfTaiwanJpySpotSell,
    ...options,
  });
}

export function createLandBankRateAdapter(
  options: {
    fetchImpl?: typeof fetch;
    clock?: () => Date;
  } = {},
): ExchangeRateReferenceAdapter {
  return createHtmlAdapter({
    sourceId: "land-bank",
    sourceName: "臺灣土地銀行",
    sourceUrl: LAND_BANK_RATE_URL,
    parse: parseLandBankJpySpotSell,
    ...options,
  });
}

export function createFirstBankRateAdapter(
  options: {
    fetchImpl?: typeof fetch;
    clock?: () => Date;
  } = {},
): ExchangeRateReferenceAdapter {
  return createHtmlAdapter({
    sourceId: "first-bank",
    sourceName: "第一銀行",
    sourceUrl: FIRST_BANK_RATE_URL,
    parse: parseFirstBankJpySpotSell,
    ...options,
  });
}

export function createTaiwanCooperativeBankRateAdapter(
  options: {
    fetchImpl?: typeof fetch;
    clock?: () => Date;
  } = {},
): ExchangeRateReferenceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const metadata = {
    sourceId: "taiwan-cooperative-bank",
    sourceName: "合作金庫",
    sourceUrl: TAIWAN_COOPERATIVE_BANK_RATE_URL,
  };
  return {
    ...metadata,
    async fetchJpyTwdSpotSell() {
      const pageResponse = await fetchImpl(TAIWAN_COOPERATIVE_BANK_RATE_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent": "PIKA-rate-reference/1.0",
        },
      });
      if (!pageResponse.ok) {
        throw new ExchangeRateReferenceUnavailableError(
          `Taiwan Cooperative Bank page request failed with HTTP ${pageResponse.status}`,
        );
      }
      const pageHtml = await pageResponse.text();
      const requestToken =
        /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i.exec(
          pageHtml,
        )?.[1];
      if (!requestToken) {
        throw new ExchangeRateReferenceUnavailableError(
          "Taiwan Cooperative Bank request token was not found",
        );
      }

      const response = await fetchImpl(TAIWAN_COOPERATIVE_BANK_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "PIKA-rate-reference/1.0",
          Referer: TAIWAN_COOPERATIVE_BANK_RATE_URL,
          "X-Requested-With": "XMLHttpRequest",
          Cookie: cookieHeaderFromResponse(pageResponse),
        },
        body: new URLSearchParams({ __RequestVerificationToken: requestToken }),
      });
      if (!response.ok) {
        throw new ExchangeRateReferenceUnavailableError(
          `Taiwan Cooperative Bank reference request failed with HTTP ${response.status}`,
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ExchangeRateReferenceUnavailableError(
          "Taiwan Cooperative Bank returned invalid JSON",
        );
      }
      return createQuote(
        metadata,
        parseTaiwanCooperativeBankJpySpotSell(payload),
        clock().toISOString(),
      );
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

export async function fetchAllExchangeRateReferences(
  adapters: readonly ExchangeRateReferenceAdapter[],
): Promise<ExchangeRateReferenceResult[]> {
  return Promise.all(
    adapters.map(async (adapter): Promise<ExchangeRateReferenceResult> => {
      try {
        return {
          status: "available",
          quote: await adapter.fetchJpyTwdSpotSell(),
        };
      } catch (error) {
        return {
          status: "unavailable",
          sourceId: adapter.sourceId,
          sourceName: adapter.sourceName,
          sourceUrl: adapter.sourceUrl,
          reason: error instanceof Error ? error.message : "unknown error",
        };
      }
    }),
  );
}

export const defaultExchangeRateReferenceAdapters = [
  createBankOfTaiwanRateAdapter(),
  createLandBankRateAdapter(),
  createTaiwanCooperativeBankRateAdapter(),
  createFirstBankRateAdapter(),
] as const;
