import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyStoreQueryKey,
  useGetMyStore,
  useUpdateStore,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";

import { ExchangeRateReferenceHint } from "@/components/ExchangeRateReferenceHint";
import { formatActionableError } from "@/lib/actionableError";
import { BottomNav } from "./Dashboard";

const RATE_PATTERN = /^(?:\d+|\d*\.\d+)$/;

export default function ExchangeRateReferencePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: store, isLoading } = useGetMyStore();
  const updateStore = useUpdateStore();
  const [rate, setRate] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!store) return;
    setRate(
      store.purchaseExchangeRate == null
        ? ""
        : String(store.purchaseExchangeRate),
    );
  }, [store?.id, store?.purchaseExchangeRate]);

  const save = async () => {
    setSaved(false);
    setError("");
    if (!store) return;

    const trimmed = rate.trim();
    if (trimmed && !RATE_PATTERN.test(trimmed)) {
      setError(
        formatActionableError({
          happened: "店鋪進貨匯率沒有儲存。",
          reason: "匯率必須是 0 以上的數字，或留空表示待確認。",
          action: "請修正匯率，或清空欄位後再儲存。",
          support: "不確定匯率時可先留空，不要填入猜測值。",
        }),
      );
      return;
    }

    const numericRate = trimmed ? Number(trimmed) : null;
    if (
      numericRate !== null &&
      (!Number.isFinite(numericRate) || numericRate < 0)
    ) {
      setError(
        formatActionableError({
          happened: "店鋪進貨匯率沒有儲存。",
          reason: "匯率必須是有限且不小於 0 的數字。",
          action: "請修正匯率，或清空欄位後再儲存。",
          support: "不確定匯率時可先留空，不要填入猜測值。",
        }),
      );
      return;
    }

    try {
      await updateStore.mutateAsync({
        storeId: store.id,
        data: { purchaseExchangeRate: numericRate },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetMyStoreQueryKey(),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (caught) {
      setError(
        formatActionableError({
          happened: "店鋪進貨匯率沒有儲存。",
          reason:
            (caught as { data?: { error?: string } })?.data?.error ??
            "網路或系統暫時沒有回應。",
          action: "請保留欄位內容並稍後再按一次儲存。",
          support: "若仍失敗，請截圖交給系統管理者。",
        }),
      );
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <button
          type="button"
          onClick={() => setLocation("/settings")}
          className="text-sm font-medium text-primary"
        >
          ‹ 返回設定
        </button>
        <h1 className="mt-2 text-lg font-bold text-foreground">銀行匯率參考</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          比較日圓即期賣出參考價；系統不會自動改匯率，仍由您套用並儲存。
        </p>
      </header>

      <main className="space-y-4 px-5 py-5">
        <section className="rounded-2xl border border-border bg-white p-4">
          <label className="block text-sm font-semibold text-foreground">
            店鋪進貨匯率（日圓 → 台幣）
          </label>
          <input
            type="number"
            min="0"
            step="0.0001"
            inputMode="decimal"
            value={rate}
            disabled={isLoading || updateStore.isPending}
            onChange={(event) => {
              setRate(event.target.value);
              setSaved(false);
              setError("");
            }}
            placeholder="留空表示待確認，例如 0.199"
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          />

          <ExchangeRateReferenceHint
            context="store"
            onApply={(value) => {
              setRate(value);
              setSaved(false);
              setError("");
            }}
          />

          {error && (
            <p className="mt-3 whitespace-pre-line rounded-xl bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
              已儲存店鋪進貨匯率。
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={isLoading || !store || updateStore.isPending}
            className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {updateStore.isPending ? "儲存中…" : "儲存店鋪匯率"}
          </button>
        </section>

        <p className="rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
          「套用」只會把參考值填入上方欄位；按下「儲存店鋪匯率」後才會正式生效。
        </p>
      </main>

      <BottomNav active="settings" />
    </div>
  );
}
