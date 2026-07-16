import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMyStore } from "@workspace/api-client-react";

import {
  createRateReferenceAuditEntry,
  formatExchangeRateReferenceTime,
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
  const [applying, setApplying] = useState(false);
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
        disabled={applying || !store?.id}
        className="rounded-md border border-primary/30 bg-white px-2.5 py-1 font-semibold text-primary"
        onClick={() => {
          if (!store?.id) return;
          setApplying(true);
          setAuditError("");
          void recordServerAuditEvent({
            storeId: store.id,
            action: "apply_exchange_rate_reference",
            target: context,
            getToken,
          }).then(() => {
            onApply(data.rate);
            console.info(
              "[exchange-rate-audit]",
              createRateReferenceAuditEntry(context, data),
            );
          }).catch((caught) => {
            setAuditError((caught as Error).message);
          }).finally(() => setApplying(false));
        }}
      >
        {applying ? "記錄中…" : "套用"}
      </button>
      <span className="basis-full text-[11px] text-muted-foreground">
        僅填入欄位，仍需按「儲存」才會生效。
      </span>
      {auditError && <span className="basis-full text-[11px] text-red-700">{auditError}</span>}
    </div>
  );
}
