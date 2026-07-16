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

export function formatExchangeRateReferenceTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\+08:00$/.exec(
    value,
  );
  if (!match) return "掛牌時間待確認";
  return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
}

export function createRateReferenceAuditEntry(
  context: "trip" | "store",
  quote: ExchangeRateReferenceQuote,
) {
  return {
    action: "apply_exchange_rate_reference" as const,
    context,
    sourceId: quote.sourceId,
    side: quote.side,
    rate: quote.rate,
    quotedAt: quote.quotedAt,
    appliedAt: new Date().toISOString(),
  };
}
