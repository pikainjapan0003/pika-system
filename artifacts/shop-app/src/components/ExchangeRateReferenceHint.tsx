import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMyStore } from "@workspace/api-client-react";

import {
  createRateReferenceAuditEntry,
  formatExchangeRateReferenceTime,
  getExchangeRateReferenceSource,
  type ExchangeRateReferenceComparisonResponse,
  type ExchangeRateReferenceQuote,
} from "@/lib/exchangeRateReference";
import { recordServerAuditEvent } from "@/lib/serverAudit";

export function ExchangeRateReferenceHint({
  context,
  onApply,
}: {
  context: "trip" | "store";
  onApply: (rate: string) => void;
}) {
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [auditError, setAuditError] = useState("");
  const [applyingSourceId, setApplyingSourceId] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["exchange-rate-reference", "JPY", "spot-sell", "comparison"],
    queryFn: () =>
      customFetch<ExchangeRateReferenceComparisonResponse>(
        "/api/exchange-rate-reference/jpy/compare",
      ),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const applyQuote = (quote: ExchangeRateReferenceQuote) => {
    if (!store?.id) return;
    setApplyingSourceId(quote.sourceId);
    setAuditError("");
    void recordServerAuditEvent({
      storeId: store.id,
      action: "apply_exchange_rate_reference",
      target: `${context}:${quote.sourceId}`,
      getToken,
    })
      .then(() => {
        onApply(quote.rate);
        console.info(
          "[exchange-rate-audit]",
          createRateReferenceAuditEntry(context, quote),
        );
      })
      .catch((caught) => {
        setAuditError((caught as Error).message);
      })
      .finally(() => setApplyingSourceId(null));
  };

  return (
    <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">
          各銀行日圓即期賣出參考價
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="重新取得銀行匯率參考"
          className="min-h-11 shrink-0 rounded-md border border-primary/30 bg-white px-3 font-semibold text-primary disabled:cursor-wait disabled:opacity-50"
        >
          {isFetching ? "重整中…" : "重整"}
        </button>
      </div>
      {isLoading && (
        <p className="rounded-md bg-white px-2.5 py-3 text-muted-foreground">
          正在取得多家銀行參考匯率…
        </p>
      )}
      {(isError || (!isLoading && !data)) && (
        <p className="rounded-md bg-amber-50 px-2.5 py-3 text-amber-700">
          參考匯率暫時無法取得；可按「重整」再試一次，或自行填寫。
        </p>
      )}
      {data && (
        <div className="space-y-2">
          {data.sources.map((result) => {
            const source = getExchangeRateReferenceSource(result);
            const isApplying = applyingSourceId === source.sourceId;
            return (
              <div
                key={source.sourceId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-white px-2.5 py-2"
              >
                <div className="min-w-0">
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {source.sourceName}
                  </a>
                  {result.status === "available" ? (
                    <p className="mt-0.5 text-muted-foreground">
                      即期賣出 {result.quote.rate} ·{" "}
                      {formatExchangeRateReferenceTime(result.quote.quotedAt)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-amber-700">暫時不可用</p>
                  )}
                </div>
                {result.status === "available" && (
                  <button
                    type="button"
                    disabled={applyingSourceId !== null || !store?.id}
                    className="min-h-11 rounded-md border border-primary/30 bg-white px-3 font-semibold text-primary disabled:opacity-50"
                    onClick={() => applyQuote(result.quote)}
                  >
                    {isApplying ? "記錄中…" : "套用"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        牌告僅供參考；套用只會填入欄位，仍需按「儲存」才會生效。
      </p>
      {auditError && (
        <p className="mt-1 text-[11px] text-red-700">{auditError}</p>
      )}
    </div>
  );
}
