import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { useLocation } from "wouter";

import { BottomNav } from "./Dashboard";

interface AuditLogRecord {
  id: number;
  storeId: number;
  actor: string;
  action: string;
  target: string;
  at: string;
}

const ACTION_LABELS: Record<string, string> = {
  reveal_customer_pii: "查看完整客戶資料",
  reveal_order_pii: "查看完整訂單個資",
  export_customers_masked: "匯出遮罩客戶 CSV",
  export_customers_cleartext: "匯出明文客戶 CSV",
  export_orders_masked: "匯出遮罩訂單 CSV",
  export_orders_cleartext: "匯出明文訂單 CSV",
  apply_exchange_rate_reference: "套用參考匯率",
};

export default function AuditLogsPage() {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [rows, setRows] = useState<AuditLogRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/stores/${store.id}/audit-logs`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("無法讀取操作紀錄");
        const payload = (await response.json()) as AuditLogRecord[];
        if (!cancelled) setRows(payload);
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store?.id, getToken]);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <button
          type="button"
          onClick={() => setLocation("/settings")}
          className="text-sm font-medium text-primary"
        >
          ‹ 返回設定
        </button>
        <h1 className="mt-2 text-lg font-bold">操作紀錄</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          只記動作與資料編號，不保存 token 或完整個資。
        </p>
      </header>
      <main className="space-y-3 p-5">
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-border bg-white p-4"
          >
            <p className="font-medium">
              {ACTION_LABELS[row.action] ?? row.action}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              對象：{row.target}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.at).toLocaleString("zh-TW")}
            </p>
          </article>
        ))}
        {!error && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            尚無操作紀錄
          </p>
        )}
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
