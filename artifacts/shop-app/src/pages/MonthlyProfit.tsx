import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { useLocation } from "wouter";

import { BottomNav } from "./Dashboard";

interface MonthlyProfitReport {
  month: string;
  timeZone: "Asia/Taipei";
  orderCount: number;
  capturedProfitSubtotalDisplayTwd: string;
  pendingOrderCount: number;
  missingSnapshotOrderCount: number;
}

function currentTaipeiMonth(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function formatInteger(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export default function MonthlyProfitPage() {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [month, setMonth] = useState(currentTaipeiMonth);
  const [report, setReport] = useState<MonthlyProfitReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!store?.id || !month) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(
          `/api/stores/${store.id}/orders/monthly-profit?month=${encodeURIComponent(month)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "月報讀取失敗");
        if (!cancelled) setReport(body as MonthlyProfitReport);
      } catch (cause) {
        if (!cancelled) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : "月報讀取失敗");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, month, store?.id]);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-xs text-muted-foreground mb-2"
        >
          ‹ 返回首頁
        </button>
        <h1 className="text-lg font-bold text-foreground">每月毛利報表</h1>
        <p className="text-xs text-muted-foreground mt-1">
          只讀取訂單定格快照；待確認資料不會默認為 0。
        </p>
      </header>

      <main className="px-5 py-5 space-y-4">
        <label className="block bg-white border border-border rounded-2xl p-4">
          <span className="block text-xs font-medium text-muted-foreground mb-2">
            帳務月份（台灣時間）
          </span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>

        {loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            讀取中…
          </p>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && report && (
          <section className="grid grid-cols-2 gap-3">
            <ReportCard
              label="已定格毛利"
              value={`NT$ ${formatInteger(report.capturedProfitSubtotalDisplayTwd)}`}
              wide
            />
            <ReportCard label="訂單數" value={String(report.orderCount)} />
            <ReportCard
              label="待確認"
              value={String(report.pendingOrderCount)}
              alert={report.pendingOrderCount > 0}
            />
            <ReportCard
              label="尚無快照"
              value={String(report.missingSnapshotOrderCount)}
              alert={report.missingSnapshotOrderCount > 0}
            />
          </section>
        )}
      </main>

      <BottomNav active="dashboard" />
    </div>
  );
}

function ReportCard({
  label,
  value,
  wide,
  alert,
}: {
  label: string;
  value: string;
  wide?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-white p-4 ${wide ? "col-span-2" : ""}`}
    >
      <div
        className={`text-xl font-bold ${alert ? "text-amber-600" : "text-primary"}`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
