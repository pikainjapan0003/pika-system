import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, VALID_NEXT_STATUSES } from "../lib/orderStatus";

export default function OrdersPage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, isLoading } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });
  const updateOrderStatus = useUpdateOrderStatus();
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const filtered = filter === "all"
    ? (orders ?? [])
    : (orders ?? []).filter((o) => o.status === filter);

  const sortedFiltered = [...filtered].reverse();

  const handleStatusChange = async (orderId: number, status: string) => {
    setLoadingOrderId(orderId);
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
    } finally {
      setLoadingOrderId(null);
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
    const token = await getToken();
    let res: Response;
    try {
      res = await fetch(`/api/stores/${storeId}/orders/export`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      window.alert("匯出失敗，請確認網路連線後再試");
      return;
    }
    if (!res.ok) {
      window.alert("匯出失敗，請稍後再試");
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? "orders-export.csv";
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
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
                {/* Card header */}
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
                      <span className="text-sm font-bold text-foreground">NT$ {Number(o.totalPrice).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">{expandedId === o.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {expandedId === o.id && (
                  <div className="border-t border-border bg-secondary/20 px-4 pt-4 pb-5 space-y-3">

                    {/* 買家資訊 */}
                    <div>
                      <SectionLabel>買家資訊</SectionLabel>
                      <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                        <DetailRow label="姓名" value={o.buyerName} />
                        <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">電話</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{o.buyerPhone}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(o.buyerPhone, `${o.id}-phone`)}
                              className="text-xs text-primary font-medium shrink-0"
                            >
                              {copiedKey === `${o.id}-phone` ? "已複製" : "複製"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 商品明細 */}
                    <div>
                      <SectionLabel>商品明細</SectionLabel>
                      <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                        <DetailRow label="商品名稱" value={o.productName ?? "—"} />
                        <DetailRow label="數量" value={`× ${o.quantity}`} />
                        {o.unitPrice != null && (
                          <DetailRow label="單價" value={`NT$ ${Number(o.unitPrice).toLocaleString()}`} />
                        )}
                        <DetailRow label="總金額" value={`NT$ ${Number(o.totalPrice).toLocaleString()}`} bold />
                      </div>
                    </div>

                    {/* 取貨與備註 */}
                    <div>
                      <SectionLabel>取貨與備註</SectionLabel>
                      <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                        <DetailRow label="取貨方式" value={o.pickupMethod} />
                        {o.notes && <DetailRow label="備註" value={o.notes} />}
                      </div>
                    </div>

                    {/* 規格 */}
                    {o.specValues && Object.keys(o.specValues as object).length > 0 && (
                      <div>
                        <SectionLabel>規格</SectionLabel>
                        <div className="bg-white rounded-xl border border-border/50 px-3 py-2.5">
                          <span className="text-sm font-medium text-foreground">
                            {Object.entries(o.specValues as object).map(([k, v]) => `${k}: ${v}`).join("、")}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 訂單資訊 */}
                    <div>
                      <SectionLabel>訂單資訊</SectionLabel>
                      <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                        <DetailRow label="訂單編號" value={`#${o.id}`} />
                        <DetailRow label="下單時間" value={formatDate(o.createdAt)} />
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">目前狀態</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABELS[o.status] ?? o.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 複製追蹤連結 */}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
                        `${window.location.origin}${basePath}/track/${o.publicToken}`,
                        `${o.id}-link`
                      )}
                      className="w-full h-9 rounded-xl border border-border bg-white text-xs font-medium text-foreground"
                    >
                      {copiedKey === `${o.id}-link` ? "已複製追蹤連結" : "複製追蹤連結"}
                    </button>

                    {/* 更新狀態 */}
                    {(VALID_NEXT_STATUSES[o.status]?.length ?? 0) > 0 ? (
                      <div>
                        <SectionLabel>更新狀態</SectionLabel>
                        <div className="flex flex-wrap gap-2">
                          {VALID_NEXT_STATUSES[o.status]?.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={loadingOrderId === o.id}
                              onClick={() => handleStatusChange(o.id, s)}
                              className={`h-9 px-4 rounded-xl text-sm font-medium border transition-colors disabled:opacity-60 ${STATUS_COLORS[s] ? `border-transparent ${STATUS_COLORS[s]}` : "border-input bg-white text-foreground"}`}
                            >
                              {loadingOrderId === o.id ? "更新中..." : STATUS_LABELS[s]}
                            </button>
                          ))}
                        </div>
                        {statusErrors[o.id] && (
                          <p className="text-xs text-destructive mt-1.5">{statusErrors[o.id]}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                        <span className="text-xs text-muted-foreground">此訂單已結束，無法更新狀態</span>
                      </div>
                    )}
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

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1.5">{children}</div>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${bold ? "font-bold" : "font-medium"} text-foreground`}>{value}</span>
    </div>
  );
}
