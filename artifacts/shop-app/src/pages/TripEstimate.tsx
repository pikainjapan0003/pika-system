import { useAuth } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground";

type Category = { id: number; code: string; name: string };
type Summary = {
  mode: "ESTIMATE";
  status: string;
  exchangeRate: string | null;
  entries: Array<{ id: number; categoryId: number | null; originalAmount: string; currency: string }>;
  categories: Category[];
  totals?: { fixedCostTotalTwd?: string | null };
  estimateLocked: boolean;
  estimateModifiedAfterLock: boolean;
};

export default function TripEstimatePage({ tripId }: { tripId: number }) {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [currency, setCurrency] = useState<"JPY" | "TWD">("TWD");
  const [exchangeRate, setExchangeRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, init?: RequestInit) {
    const token = await getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "無法完成操作");
    return payload;
  }

  async function load() {
    if (!store?.id) return;
    setLoading(true);
    setError("");
    try {
      const payload = (await request(
        `/api/stores/${store.id}/trips/${tripId}/operating-summary?mode=ESTIMATE`,
      )) as Summary;
      setSummary(payload);
      setExchangeRate(payload.exchangeRate ?? "");
      setValues(
        Object.fromEntries(
          payload.entries
            .filter((entry) => entry.categoryId != null && entry.originalAmount != null)
            .map((entry) => [entry.categoryId as number, String(entry.originalAmount)]),
        ),
      );
      const firstCurrency = payload.entries.find((entry) => entry.currency)?.currency;
      if (firstCurrency === "JPY" || firstCurrency === "TWD") setCurrency(firstCurrency);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法載入估算");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [store?.id, tripId]);

  const categories = useMemo(() => summary?.categories ?? [], [summary]);

  async function save() {
    if (!store?.id || !summary) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(`/api/stores/${store.id}/trips/${tripId}/operating-inputs`, {
        method: "PATCH",
        body: JSON.stringify({ exchangeRate: exchangeRate.trim() || null }),
      });
      const existingByCategory = new Map(
        summary.entries
          .filter((entry) => entry.categoryId != null)
          .map((entry) => [entry.categoryId as number, entry]),
      );
      for (const category of categories) {
        const originalAmount = (values[category.id] ?? "0").trim() || "0";
        const existing = existingByCategory.get(category.id);
        if (existing) {
          await request(
            `/api/stores/${store.id}/trips/${tripId}/cost-entries/${existing.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({ originalAmount, currency }),
            },
          );
        } else {
          await request(`/api/stores/${store.id}/trips/${tripId}/cost-entries`, {
            method: "POST",
            body: JSON.stringify({ mode: "ESTIMATE", categoryId: category.id, originalAmount, currency }),
          });
        }
      }
      await load();
      setMessage("估算已儲存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function lockEstimate() {
    if (!store?.id) return;
    try {
      await request(`/api/stores/${store.id}/trips/${tripId}/close`, { method: "POST" });
      await load();
      setMessage("行程已關帳，估算已鎖定");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "關帳失敗");
    }
  }

  async function unlockEstimate() {
    if (!store?.id) return;
    try {
      await request(`/api/stores/${store.id}/trips/${tripId}/unlock-estimate`, { method: "POST" });
      await load();
      setMessage("已解鎖；後續修改會永久標記為人工修改");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解鎖失敗");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-3">
          <button type="button" className="min-h-11 text-sm text-primary" onClick={() => setLocation("/trips")}>返回</button>
          <h1 className="flex-1 text-center text-lg font-bold">行程成本｜預估</h1>
          <div className="w-12" />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] space-y-4 px-5 py-5">
        {loading && <p className="text-center text-sm text-muted-foreground">載入中…</p>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        {summary && (
          <>
            <section className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="flex-1 text-sm font-semibold">估算匯率（JPY → TWD）
                  <input aria-label="估算匯率" className={`${inputClass} mt-2`} value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} inputMode="decimal" />
                </label>
                <label className="w-28 text-sm font-semibold">幣別
                  <select aria-label="估算幣別" className={`${inputClass} mt-2`} value={currency} onChange={(event) => setCurrency(event.target.value as "JPY" | "TWD")}>
                    <option value="TWD">TWD</option><option value="JPY">JPY</option>
                  </select>
                </label>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">目前預估合計 NT${summary.totals?.fixedCostTotalTwd ?? "0"}</p>
              {summary.estimateModifiedAfterLock && <p className="mt-2 text-xs text-amber-700">此估算曾在鎖定後被人工解鎖修改</p>}
            </section>
            <section className="space-y-2 rounded-2xl border border-border bg-white p-4">
              <h2 className="font-bold">11 項固定成本</h2>
              {categories.map((category) => (
                <label key={category.id} className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">{category.name}</span>
                  <input aria-label={category.name} className={inputClass} value={values[category.id] ?? "0"} onChange={(event) => setValues((current) => ({ ...current, [category.id]: event.target.value }))} inputMode="decimal" />
                </label>
              ))}
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">自訂項目</span><input aria-label="自訂項目" className={inputClass} placeholder="請在實際頁新增自訂項目" disabled /></label>
            </section>
            <div className="flex gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-xl bg-primary font-semibold text-white disabled:opacity-50" disabled={saving || summary.estimateLocked} onClick={() => void save()}>儲存估算</button>
              {summary.estimateLocked ? <button type="button" className="min-h-11 flex-1 rounded-xl border border-primary text-primary" onClick={() => void unlockEstimate()}>解鎖估算</button> : <button type="button" className="min-h-11 flex-1 rounded-xl border border-border bg-white" onClick={() => void lockEstimate()}>關帳並鎖定</button>}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
