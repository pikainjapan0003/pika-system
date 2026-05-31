import { useState } from "react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, VALID_NEXT_STATUSES } from "../lib/orderStatus";

export default function OrdersPage() {
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, isLoading } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });
  const updateOrderStatus = useUpdateOrderStatus();
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const filtered = filter === "all"
    ? (orders ?? [])
    : (orders ?? []).filter((o) => o.status === filter);

  const sortedFiltered = [...filtered].reverse();

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      await updateOrderStatus.mutateAsync({
        orderId,
        data: { status: status as any },
      });
      setStatusErrors((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId!) });
    } catch (err: any) {
      const msg = err?.data?.error ?? "狀態更新失敗，請確認狀態流程是否正確";
      setStatusErrors((prev) => ({ ...prev, [orderId]: msg }));
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {});
  };

  const handleExport = async () => {
    if (!storeId) return;
    const url = `/api/stores/${storeId}/orders/export`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${storeId}.csv`;
    a.click();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">訂單管理</h1>
          <button
            onClick={handleExport}
            className="h-9 px-3 text-xs font-medium text-primary bg-primary/10 rounded-xl"
          >
            匯出 CSV
          </button>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <FilterTab label="全部" value="all" active={filter === "all"} count={orders?.length} onClick={() => setFilter("all")} />
          {ALL_STATUSES.map((s) => (
            <FilterTab
              key={s}
              label={STATUS_LABELS[s]}
              value={s}
              active={filter === s}
              count={(orders ?? []).filter((o) => o.status === s).length}
              onClick={() => setFilter(s)}
            />
          ))}
        </div>
      </header>

      <div className="px-5 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedFiltered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 border border-border text-center">
            <p className="text-muted-foreground text-sm">沒有符合的訂單</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedFiltered.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{o.buyerName}</span>
                        <span className="text-xs text-muted-foreground">{o.buyerPhone}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5 truncate">{o.productName} x{o.quantity}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                      <span className="text-sm font-bold text-foreground">${Number(o.totalPrice).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">{expandedId === o.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandedId === o.id && (
                  <div className="border-t border-border px-4 py-3 space-y-3 bg-secondary/30">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <InfoRow label="取貨方式" value={o.pickupMethod} />
                      <InfoRow label="訂單編號" value={`#${o.id}`} />
                      {o.notes && <InfoRow label="備註" value={o.notes} full />}
                      {o.specValues && Object.keys(o.specValues as object).length > 0 && (
                        <InfoRow
                          label="規格"
                          value={Object.entries(o.specValues as object).map(([k, v]) => `${k}: ${v}`).join("、")}
                          full
                        />
                      )}
                    </div>

                    {/* Quick copy actions */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(o.buyerPhone, `${o.id}-phone`)}
                        className="flex-1 h-9 rounded-xl border border-border bg-white text-xs font-medium text-foreground"
                      >
                        {copiedKey === `${o.id}-phone` ? "已複製電話" : "複製電話"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(
                          `${window.location.origin}${basePath}/track/${o.publicToken}`,
                          `${o.id}-link`
                        )}
                        className="flex-1 h-9 rounded-xl border border-border bg-white text-xs font-medium text-foreground"
                      >
                        {copiedKey === `${o.id}-link` ? "已複製追蹤連結" : "複製追蹤連結"}
                      </button>
                    </div>

                    {/* Status update */}
                    <div>
                      {(VALID_NEXT_STATUSES[o.status]?.length ?? 0) === 0 ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABELS[o.status] ?? o.status}
                          </span>
                          <span className="text-xs text-muted-foreground">此訂單已結束</span>
                        </div>
                      ) : (
                        <>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">更新狀態</label>
                          <select
                            value={o.status}
                            onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <option value={o.status} disabled>
                              {STATUS_LABELS[o.status] ?? o.status}（目前）
                            </option>
                            {VALID_NEXT_STATUSES[o.status]?.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                          {statusErrors[o.id] && (
                            <p className="text-xs text-destructive mt-1">{statusErrors[o.id]}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="orders" />
    </div>
  );
}

function FilterTab({ label, value, active, count, onClick }: { label: string; value: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors ${
        active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
      }`}
    >
      {label}{count !== undefined && count > 0 ? ` (${count})` : ""}
    </button>
  );
}

function InfoRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground font-medium">{value}</div>
    </div>
  );
}
