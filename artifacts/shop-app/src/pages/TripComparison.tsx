import { useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";

type ComparisonRow = {
  key: string;
  label: string;
  state: string;
  estimatedTwd: string | null;
  actualTwd: string | null;
  variance: { difference: string | null; percent: string | null; direction: string } | null;
};

export default function TripComparisonPage({ tripId }: { tripId: number }) {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/stores/${store.id}/trips/${tripId}/fixed-cost-comparison`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "無法載入比較");
        if (!cancelled) {
          setStatus(payload.status);
          setRows(payload.rows ?? []);
        }
      } catch (caught) {
        if (!cancelled) {
          setStatus("error");
          setError(caught instanceof Error ? caught.message : "無法載入比較");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, store?.id, tripId]);

  const directionLabel = (direction: string) =>
    direction === "favorable" ? "有利" : direction === "unfavorable" ? "不利" : "持平";

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-3">
          <button type="button" className="min-h-11 text-sm text-primary" onClick={() => setLocation("/trips")}>返回</button>
          <h1 className="flex-1 text-center text-lg font-bold">行程成本｜預估／實際</h1>
          <div className="w-12" />
        </div>
      </header>
      <main className="mx-auto max-w-[640px] space-y-4 px-5 py-5">
        {status === "loading" && <p className="text-center text-sm text-muted-foreground">載入中…</p>}
        {status === "pending_confirmation" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">匯率尚未確認，完成兩側匯率後才能比較。</p>}
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {status === "ready" && <section className="overflow-x-auto rounded-2xl border border-border bg-white p-4">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2">項目</th><th className="py-2">預估</th><th className="py-2">實際</th><th className="py-2">差異</th><th className="py-2">方向</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-border/60 last:border-0"><th className="py-3 font-medium">{row.label}</th><td className="py-3">{row.estimatedTwd == null ? "未發生" : `NT$${row.estimatedTwd}`}</td><td className="py-3">{row.actualTwd == null ? "預算外" : `NT$${row.actualTwd}`}</td><td className="py-3">{row.variance?.difference == null ? "—" : `NT$${row.variance.difference}`}</td><td className={`py-3 font-semibold ${row.variance?.direction === "unfavorable" ? "text-red-600" : row.variance?.direction === "favorable" ? "text-green-600" : "text-muted-foreground"}`}>{row.variance ? directionLabel(row.variance.direction) : row.state}</td></tr>)}</tbody>
          </table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">尚無可比較的成本</p>}
        </section>}
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
