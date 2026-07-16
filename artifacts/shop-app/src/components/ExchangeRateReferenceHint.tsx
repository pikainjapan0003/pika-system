import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

import {
  createRateReferenceAuditEntry,
  formatExchangeRateReferenceTime,
  type ExchangeRateReferenceQuote,
} from "@/lib/exchangeRateReference";

export function ExchangeRateReferenceHint({
  context,
  onApply,
}: {
  context: "trip" | "store";
  onApply: (rate: string) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["exchange-rate-reference", "JPY", "spot-sell"],
    queryFn: () =>
      customFetch<ExchangeRateReferenceQuote>(
        "/api/exchange-rate-reference/jpy",
      ),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        正在取得臺銀參考匯率…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p className="mt-1.5 text-xs text-amber-700">
        參考匯率暫時無法取得，請自行填寫。
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {data.sourceName} 即期賣出 {data.rate} ·{" "}
        {formatExchangeRateReferenceTime(data.quotedAt)}
      </span>
      <button
        type="button"
        className="rounded-md border border-primary/30 bg-white px-2.5 py-1 font-semibold text-primary"
        onClick={() => {
          onApply(data.rate);
          console.info(
            "[exchange-rate-audit]",
            createRateReferenceAuditEntry(context, data),
          );
        }}
      >
        套用
      </button>
      <span className="basis-full text-[11px] text-muted-foreground">
        僅填入欄位，仍需按「儲存」才會生效。
      </span>
    </div>
  );
}
