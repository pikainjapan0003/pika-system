import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, getListOrdersQueryKey, type Order } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, VALID_NEXT_STATUSES } from "../lib/orderStatus";
import { isSevenElevenMethod, openSevenElevenMap } from "@/lib/cvs711";

const DEPRECATED_METHODS: Record<string, string> = {
  "OK Mart": "OK Mart",
  "萊爾富物流": "萊爾富",
};
const HOME_DELIVERY_LABELS: Record<string, string> = {
  "黑貓宅急便": "黑貓宅急便",
  "郵局": "郵局",
  "宅配": "宅配（已停用）",
};
import { CreateOrderDialog } from "./CreateOrderDialog";
import { EditOrderDialog } from "./EditOrderDialog";

export default function OrdersPage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, isLoading } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });
  const updateOrderStatus = useUpdateOrderStatus();
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const allOrders = orders ?? [];

  // Status filter
  const statusFiltered = filter === "all"
    ? allOrders
    : allOrders.filter((o) => o.status === filter);

  // Client-side search
  const q = searchQuery.trim().toLowerCase();
  const searched = q
    ? statusFiltered.filter((o) =>
        o.buyerName.toLowerCase().includes(q) ||
        o.buyerPhone.toLowerCase().includes(q) ||
        String(o.id).includes(q) ||
        (o.productName ?? "").toLowerCase().includes(q)
      )
    : statusFiltered;

  const sortedFiltered = [...searched].reverse();

  // Stats (computed from all orders, ignoring current filter)
  const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
  const pendingCount = allOrders.filter((o) => o.status === "pending").length;

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
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-28">
      <header className="bg-white border-b border-border px-5 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">訂單管理</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddOrder(true)}
              disabled={!storeId}
              className="h-9 px-3 text-xs font-semibold text-white bg-primary rounded-xl disabled:opacity-50"
            >
              ＋ 新增訂單
            </button>
            <button
              onClick={handleExport}
              className="h-9 px-3 text-xs font-medium text-primary bg-primary/10 rounded-xl"
            >
              匯出 CSV
            </button>
          </div>
        </div>
        {/* Search bar */}
        <div className="mb-2.5">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋姓名、電話、訂單編號"
            className="w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <FilterTab label="全部" value="all" active={filter === "all"} count={allOrders.length} onClick={() => setFilter("all")} />
          {ALL_STATUSES.map((s) => (
            <FilterTab
              key={s}
              label={STATUS_LABELS[s]}
              value={s}
              active={filter === s}
              count={allOrders.filter((o) => o.status === s).length}
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
        ) : (
          <>
            {/* Stats cards */}
            {allOrders.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <StatCard label="訂單筆數" value={String(allOrders.length)} />
                <StatCard label="訂單總額" value={`NT$${totalRevenue.toLocaleString()}`} />
                <StatCard label="待確認" value={String(pendingCount)} urgent={pendingCount > 0} />
              </div>
            )}

            {sortedFiltered.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 border border-border text-center">
                <p className="text-muted-foreground text-sm">
                  {allOrders.length > 0 ? "找不到符合條件的訂單" : "目前沒有訂單"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedFiltered.map((o) => (
                  <div key={o.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                    {/* Card header */}
                    <div
                      className="px-4 pt-3.5 pb-3.5 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                    >
                      {/* Row 1: Order # (left) + Amount (right) */}
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-sm font-bold text-primary tracking-wide">#{o.id}</span>
                        <span className="text-xl font-bold text-primary">NT${Number(o.totalPrice).toLocaleString()}</span>
                      </div>
                      {/* Row 2: Buyer name (left) + date (right) */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[15px] font-semibold text-foreground leading-tight">{o.buyerName}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(o.createdAt)}</span>
                      </div>
                      {/* Row 3: Pickup method badge + order status badge */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                          {o.pickupMethod}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </div>
                      {/* Row 4: Item count + shipping status badge + expand arrow */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground shrink-0">商品 {o.quantity} 件</span>
                        {o.productName && (
                          <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">· {o.productName}</span>
                        )}
                        {o.status !== "cancelled" && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                            o.status === "shipped" || o.status === "completed"
                              ? "bg-cyan-100 text-cyan-700"
                              : "bg-secondary/80 text-muted-foreground"
                          }`}>
                            {o.status === "shipped" || o.status === "completed" ? "已出貨" : "未出貨"}
                          </span>
                        )}
                        <span className="text-muted-foreground shrink-0 ml-auto text-sm leading-none">
                          {expandedId === o.id ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail panel (Step 1) */}
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

                        {/* 付款資訊 */}
                        <div>
                          <SectionLabel>付款資訊</SectionLabel>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <PlaceholderRow label="付款方式" />
                            <PlaceholderRow label="付款狀態" />
                            <PlaceholderRow label="運費" />
                          </div>
                        </div>

                        {/* 物流資訊 */}
                        <div>
                          <SectionLabel>物流資訊</SectionLabel>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <DetailRow label="取貨方式" value={o.pickupMethod} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(o as any).shippingFee != null && (
                              <DetailRow label="運費" value={`NT$ ${Number((o as any).shippingFee).toLocaleString()}`} />
                            )}
                            <PlaceholderRow label="出貨狀態" />
                            <PlaceholderRow label="物流追蹤碼" />
                            {o.notes && <DetailRow label="備註" value={o.notes} />}
                          </div>
                        </div>

                        {/* 7-11 門市資訊 */}
                        {isSevenElevenMethod(o.pickupMethod) && (
                          <div>
                            <SectionLabel>7-11 門市</SectionLabel>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(o as any).cvsStoreId ? (
                              <div className="bg-white rounded-xl border border-primary/20 px-4 py-3 space-y-1">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                <div className="text-sm font-semibold text-foreground">7-11 {(o as any).cvsStoreName}</div>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                <div className="text-xs text-muted-foreground">{(o as any).cvsStoreAddress}</div>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                <div className="text-xs text-muted-foreground/70">門市編號：{(o as any).cvsStoreId}</div>
                                <div className="flex items-center gap-3 mt-1 pt-1 border-t border-border/40">
                                  <span className="text-xs text-muted-foreground/60">
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    選擇來源：{(o as any).storeSelectedBy === "admin" ? "老闆代選" : "客人選擇"}
                                  </span>
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {(o as any).storeSelectedAt && (
                                    <span className="text-xs text-muted-foreground/60">
                                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                      {formatDate((o as any).storeSelectedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
                                <p className="text-xs text-amber-700">尚未選擇 7-11 門市</p>
                              </div>
                            )}
                            {o.status !== "completed" && o.status !== "cancelled" && (
                              <button
                                type="button"
                                onClick={() => {
                                  openSevenElevenMap({
                                    returnPath: `${basePath}/orders`,
                                    source: "admin",
                                    orderId: o.id,
                                  });
                                }}
                                className="mt-2 w-full h-9 rounded-xl border border-primary/40 bg-primary/5 text-xs font-medium text-primary"
                              >
                                選擇 / 修改 7-11 門市
                              </button>
                            )}
                          </div>
                        )}

                        {/* 宅配顯示（黑貓 / 郵局） */}
                        {HOME_DELIVERY_LABELS[o.pickupMethod] && (
                          <div>
                            <SectionLabel>物流方式</SectionLabel>
                            <div className="bg-white rounded-xl border border-border/50 px-4 py-3">
                              <span className="text-sm font-medium text-foreground">{HOME_DELIVERY_LABELS[o.pickupMethod]}</span>
                            </div>
                          </div>
                        )}

                        {/* 已停用的取貨方式（舊訂單 backward compat） */}
                        {DEPRECATED_METHODS[o.pickupMethod] && (
                          <div>
                            <SectionLabel>物流方式</SectionLabel>
                            <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
                              <p className="text-xs text-amber-700">已停用的取貨方式：{DEPRECATED_METHODS[o.pickupMethod]}</p>
                            </div>
                          </div>
                        )}

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

                        {/* 編輯訂單 */}
                        {o.status !== "completed" && o.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => setEditingOrder(o)}
                            className="w-full h-9 rounded-xl border border-primary/40 bg-primary/5 text-xs font-medium text-primary"
                          >
                            編輯訂單
                          </button>
                        )}

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
          </>
        )}
      </div>

      <BottomNav active="orders" />

      {storeId && (
        <CreateOrderDialog
          storeId={storeId}
          open={showAddOrder}
          onClose={() => setShowAddOrder(false)}
        />
      )}

      {storeId && (
        <EditOrderDialog
          order={editingOrder}
          storeId={storeId}
          open={!!editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
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

function StatCard({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-border p-3 text-center">
      <div className={`text-lg font-bold ${urgent ? "text-amber-600" : "text-primary"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
    </div>
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

function PlaceholderRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-muted-foreground/50 italic">尚未建立此欄位</span>
    </div>
  );
}
