import { useState } from "react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  awaiting_payment: "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

export default function OrdersPage() {
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, isLoading } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });
  const updateOrderStatus = useUpdateOrderStatus();
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = filter === "all"
    ? (orders ?? [])
    : (orders ?? []).filter((o) => o.status === filter);

  const sortedFiltered = [...filtered].reverse();

  const handleStatusChange = async (orderId: number, status: string) => {
    await updateOrderStatus.mutateAsync({
      orderId,
      data: { status: status as any },
    });
    qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId!) });
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
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">更新狀態</label>
                      <select
                        value={o.status}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-input bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {ALL_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
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
