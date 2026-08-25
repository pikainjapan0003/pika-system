import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";

import { BottomNavigation } from "@/components/BottomNavigation";
import { ProfitKpiBoard } from "@/components/ProfitKpiBoard";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import { useTripProfitBoard } from "@/lib/tripProfitBoard";

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
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const board = useTripProfitBoard(store?.id, getToken);
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

  const openedFromKpiNavigation =
    new URLSearchParams(window.location.search).get("view") === "kpi";

  const monthlyTrendContent = (
    <section aria-labelledby="monthly-profit-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="monthly-profit-title" className="text-base font-semibold">
            每月毛利快照
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            只讀取訂單定格快照；缺少的資料維持待確認。
          </p>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          帳務月份（台灣時間）
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      {loading ? (
        <SemanticStatePanel
          state={{
            kind: "loading",
            label: "讀取每月毛利",
            fallbackMessage: "正在讀取所選月份的定格毛利，請稍候。",
          }}
        />
      ) : null}
      {error ? (
        <SemanticStatePanel
          state={{
            kind: "inlineError",
            title: "無法讀取每月毛利",
            message: error,
          }}
        />
      ) : null}
      {!loading && !error && report ? (
        <div className="rounded-[16px] border border-border bg-background p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">
            已定格毛利
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums lining-nums text-foreground sm:text-[28px]">
            NT$ {formatInteger(report.capturedProfitSubtotalDisplayTwd)}
          </p>
          <dl className="mt-4 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <MonthlyMetric label="訂單數" value={String(report.orderCount)} />
            <MonthlyMetric
              label="待確認"
              value={String(report.pendingOrderCount)}
              alert={report.pendingOrderCount > 0}
            />
            <MonthlyMetric
              label="尚無快照"
              value={String(report.missingSnapshotOrderCount)}
              alert={report.missingSnapshotOrderCount > 0}
            />
          </dl>
        </div>
      ) : null}
      {!loading && !error && !report ? (
        <SemanticStatePanel
          state={{
            kind: "empty",
            title: "尚無月報資料",
            reason: "所選月份目前沒有可顯示的訂單定格快照。",
          }}
        />
      ) : null}
    </section>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-[calc(112px+env(safe-area-inset-bottom))]">
      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <ProfitKpiBoard
          presentation="full"
          initialCategory={openedFromKpiNavigation ? "overview" : "trend"}
          monthlyTrendContent={monthlyTrendContent}
          trips={board.trips}
          selectedTripId={board.selectedTripId}
          onSelectTrip={board.setSelectedTripId}
          estimate={board.estimate}
          actual={board.actual}
          comparisonRows={board.comparisonRows}
          loading={board.loading}
          error={board.error}
        />
      </main>

      <BottomNavigation active="kpi" />
    </div>
  );
}

function MonthlyMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="px-3 py-3 first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums lining-nums ${alert ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}
