import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, useBulkUpdateOrders, useGetPickingList, useGetShippingList, getListOrdersQueryKey, type Order, type PickingListResponse, type ShippingListResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, VALID_NEXT_STATUSES } from "../lib/orderStatus";
import { isSevenElevenMethod, isFamilyMartMethod, openSevenElevenMap, openCvsStoreMap } from "@/lib/cvs711";

const DEPRECATED_METHODS: Record<string, string> = {
  "OK Mart": "OK Mart",
  "萊爾富物流": "萊爾富",
};
const HOME_DELIVERY_LABELS: Record<string, string> = {
  "黑貓宅急便": "黑貓宅急便",
  "郵局": "郵局",
  "宅配": "宅配（已停用）",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "未付款",
  pending: "待確認",
  partially_paid: "部分付款",
  paid: "已付款",
  refunded: "已退款",
  failed: "付款失敗",
};
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-600",
  partially_paid: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  bank_transfer: "銀行轉帳",
  line_pay: "LINE Pay",
  other: "其他",
};
const SHIPPING_STATUS_LABELS: Record<string, string> = {
  not_shipped: "未出貨",
  preparing: "備貨中",
  shipped: "已出貨",
  arrived: "已到貨",
  picked_up: "已取貨",
  returned: "已退回",
  cancelled: "已取消",
};
const SHIPPING_STATUS_COLORS: Record<string, string> = {
  not_shipped: "bg-secondary/80 text-muted-foreground",
  preparing: "bg-amber-100 text-amber-600",
  shipped: "bg-cyan-100 text-cyan-700",
  arrived: "bg-blue-100 text-blue-600",
  picked_up: "bg-green-100 text-green-600",
  returned: "bg-orange-100 text-orange-600",
  cancelled: "bg-gray-100 text-gray-500",
};
const SHIPPING_METHOD_LABELS: Record<string, string> = {
  self_pickup: "自取",
  convenience_store: "超商取貨",
  home_delivery: "宅配",
  other: "其他",
};

import { CreateOrderDialog } from "./CreateOrderDialog";
import { EditOrderDialog } from "./EditOrderDialog";
import { PickingListDialog } from "./PickingListDialog";
import { ShippingListDialog } from "./ShippingListDialog";
import { toast } from "@/hooks/use-toast";

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

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("");
  const [bulkShippingStatus, setBulkShippingStatus] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const bulkUpdateOrders = useBulkUpdateOrders();

  // Tracking import state
  const [trackingImportOpen, setTrackingImportOpen] = useState(false);

  // Picking / shipping list state
  const [pickingListOpen, setPickingListOpen] = useState(false);
  const [shippingListOpen, setShippingListOpen] = useState(false);
  const [pickingListData, setPickingListData] = useState<PickingListResponse | null>(null);
  const [shippingListData, setShippingListData] = useState<ShippingListResponse | null>(null);
  const [pickingListError, setPickingListError] = useState<string | null>(null);
  const [shippingListError, setShippingListError] = useState<string | null>(null);
  const [csvPickingLoading, setCsvPickingLoading] = useState(false);
  const [csvShippingLoading, setCsvShippingLoading] = useState(false);
  const getPickingListMutation = useGetPickingList();
  const getShippingListMutation = useGetShippingList();

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

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkError(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkPaymentStatus("");
    setBulkShippingStatus("");
    setBulkError(null);
  };

  const handleBulkUpdate = async (type: "payment" | "shipping") => {
    if (selectedIds.size === 0 || !storeId) return;
    const statusVal = type === "payment" ? bulkPaymentStatus : bulkShippingStatus;
    if (!statusVal) return;
    setIsBulkLoading(true);
    setBulkError(null);
    try {
      const body: Parameters<typeof bulkUpdateOrders.mutateAsync>[0]["data"] = {
        orderIds: [...selectedIds],
        ...(type === "payment" ? { paymentStatus: statusVal as any } : { shippingStatus: statusVal as any }),
      };
      const result = await bulkUpdateOrders.mutateAsync({ data: body });
      const skippedMsg = result.skippedCount > 0 ? `（跳過 ${result.skippedCount} 筆已結束訂單）` : "";
      toast({ title: `已更新 ${result.updatedCount} 筆訂單${skippedMsg}` });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
      clearSelection();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setBulkError(e?.data?.error ?? "批次更新失敗，請稍後再試");
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleViewPickingList = async () => {
    if (selectedIds.size === 0) return;
    setPickingListError(null);
    try {
      const data = await getPickingListMutation.mutateAsync({ data: { orderIds: [...selectedIds] } });
      setPickingListData(data);
      setPickingListOpen(true);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setPickingListError(e?.data?.error ?? e?.message ?? "無法取得撿貨單，請稍後再試");
    }
  };

  const handleViewShippingList = async () => {
    if (selectedIds.size === 0) return;
    setShippingListError(null);
    try {
      const data = await getShippingListMutation.mutateAsync({ data: { orderIds: [...selectedIds] } });
      setShippingListData(data);
      setShippingListOpen(true);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setShippingListError(e?.data?.error ?? e?.message ?? "無法取得出貨單，請稍後再試");
    }
  };

  const handleDownloadPickingCsv = async () => {
    if (selectedIds.size === 0) return;
    setCsvPickingLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/picking-list.csv", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err as { error?: string })?.error ?? "下載失敗，請稍後再試");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "picking-list.csv";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setBulkError(e?.message ?? "下載撿貨 CSV 失敗");
    } finally {
      setCsvPickingLoading(false);
    }
  };

  const handleDownloadShippingCsv = async () => {
    if (selectedIds.size === 0) return;
    setCsvShippingLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/shipping-list.csv", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err as { error?: string })?.error ?? "下載失敗，請稍後再試");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "shipping-list.csv";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setBulkError(e?.message ?? "下載出貨 CSV 失敗");
    } finally {
      setCsvShippingLoading(false);
    }
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
            <button
              onClick={() => setTrackingImportOpen(true)}
              disabled={!storeId}
              className="h-9 px-3 text-xs font-medium text-muted-foreground bg-secondary rounded-xl disabled:opacity-50"
            >
              物流匯入
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
                      {/* Row 1: Checkbox + Order # (left) + Amount (right) */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            role="checkbox"
                            aria-checked={selectedIds.has(o.id)}
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(o.id); }}
                            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleSelect(o.id); } }}
                            className={`w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer flex items-center justify-center transition-colors ${
                              selectedIds.has(o.id) ? "bg-primary border-primary" : "border-border hover:border-primary/60"
                            }`}
                          >
                            {selectedIds.has(o.id) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-bold text-primary tracking-wide">#{o.id}</span>
                        </div>
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
                            SHIPPING_STATUS_COLORS[o.shippingStatus ?? "not_shipped"] ?? "bg-secondary/80 text-muted-foreground"
                          }`}>
                            {SHIPPING_STATUS_LABELS[o.shippingStatus ?? "not_shipped"] ?? "未出貨"}
                          </span>
                        )}
                        <span className="text-muted-foreground shrink-0 ml-auto text-sm leading-none">
                          {expandedId === o.id ? "▲" : "▼"}
                        </span>
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
                            <DetailRow label="商品小計" value={`NT$ ${Number(o.totalPrice).toLocaleString()}`} bold />
                          </div>
                        </div>

                        {/* 付款資訊 */}
                        <div>
                          <SectionLabel>付款資訊</SectionLabel>
                          <p className="text-[10px] text-muted-foreground/50 mb-1.5">店家手動記錄，尚未串接金流</p>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">付款狀態</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_COLORS[o.paymentStatus ?? "unpaid"] ?? "bg-gray-100 text-gray-500"}`}>
                                {PAYMENT_STATUS_LABELS[o.paymentStatus ?? "unpaid"] ?? "未付款"}
                              </span>
                            </div>
                            <DetailRow
                              label="付款方式"
                              value={o.paymentMethod ? (PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod) : "未設定"}
                            />
                            <DetailRow
                              label="運費"
                              value={`NT$ ${Number(o.shippingFee ?? 0).toLocaleString()}`}
                            />
                            <DetailRow
                              label="訂單總額"
                              value={`NT$ ${Number(o.orderTotal ?? (Number(o.totalPrice) + Number(o.shippingFee ?? 0))).toLocaleString()}`}
                              bold
                            />
                            <DetailRow
                              label="已收金額"
                              value={o.paidAmount != null ? `NT$ ${Number(o.paidAmount).toLocaleString()}` : "尚未記錄"}
                            />
                            <DetailRow
                              label="待收金額"
                              value={`NT$ ${Number(o.remainingAmount ?? (Number(o.orderTotal ?? o.totalPrice) - (o.paidAmount ?? 0))).toLocaleString()}`}
                            />
                            {o.paymentNote && (
                              <DetailRow label="付款備註（後台）" value={o.paymentNote} />
                            )}
                          </div>
                        </div>

                        {/* 物流資訊 */}
                        <div>
                          <SectionLabel>物流資訊</SectionLabel>
                          <p className="text-[10px] text-muted-foreground/50 mb-1.5">店家手動記錄，尚未串接物流</p>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">出貨狀態</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SHIPPING_STATUS_COLORS[o.shippingStatus ?? "not_shipped"] ?? "bg-secondary/80 text-muted-foreground"}`}>
                                {SHIPPING_STATUS_LABELS[o.shippingStatus ?? "not_shipped"] ?? "未出貨"}
                              </span>
                            </div>
                            {o.shippingMethod && (
                              <DetailRow
                                label="物流方式"
                                value={SHIPPING_METHOD_LABELS[o.shippingMethod] ?? o.shippingMethod}
                              />
                            )}
                            <DetailRow label="取貨方式" value={o.pickupMethod} />
                            {o.trackingCode && <DetailRow label="物流追蹤碼" value={o.trackingCode} />}
                            {o.trackingProvider && <DetailRow label="物流商" value={o.trackingProvider} />}
                            {o.recipientName && <DetailRow label="收件人" value={o.recipientName} />}
                            {o.recipientPhone && <DetailRow label="收件電話" value={o.recipientPhone} />}
                            {o.recipientAddress && <DetailRow label="收件地址" value={o.recipientAddress} />}
                            {o.storeCode && !isSevenElevenMethod(o.pickupMethod) && (
                              <DetailRow label="超商店號" value={o.storeCode} />
                            )}
                            {o.storeName && !isSevenElevenMethod(o.pickupMethod) && (
                              <DetailRow label="超商店名" value={o.storeName} />
                            )}
                            {o.shippingNote && <DetailRow label="物流備註" value={o.shippingNote} />}
                            {o.internalNote && <DetailRow label="內部備註（後台）" value={o.internalNote} />}
                            {o.notes && <DetailRow label="買家備註" value={o.notes} />}
                          </div>
                        </div>

                        {/* 7-11 門市資訊 */}
                        {isSevenElevenMethod(o.pickupMethod) && (
                          <div>
                            <SectionLabel>7-11 門市</SectionLabel>
                            {o.storeCode ? (
                              <div className="bg-white rounded-xl border border-primary/20 px-4 py-3 space-y-1">
                                <div className="text-sm font-semibold text-foreground">7-11 {o.storeName}</div>
                                <div className="text-xs text-muted-foreground">{o.cvsStoreAddress}</div>
                                <div className="text-xs text-muted-foreground/70">門市編號：{o.storeCode}</div>
                                <div className="flex items-center gap-3 mt-1 pt-1 border-t border-border/40">
                                  <span className="text-xs text-muted-foreground/60">
                                    選擇來源：{o.storeSelectedBy === "admin" ? "老闆代選" : "客人選擇"}
                                  </span>
                                  {o.storeSelectedAt && (
                                    <span className="text-xs text-muted-foreground/60">
                                      {formatDate(o.storeSelectedAt)}
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

                        {/* 全家門市資訊 */}
                        {isFamilyMartMethod(o.pickupMethod) && (
                          <div>
                            <SectionLabel>全家門市</SectionLabel>
                            {o.storeCode ? (
                              <div className="bg-white rounded-xl border border-primary/20 px-4 py-3 space-y-1">
                                <div className="text-sm font-semibold text-foreground">全家 {o.storeName}</div>
                                <div className="text-xs text-muted-foreground">{o.cvsStoreAddress}</div>
                                <div className="text-xs text-muted-foreground/70">門市編號：{o.storeCode}</div>
                                <div className="flex items-center gap-3 mt-1 pt-1 border-t border-border/40">
                                  <span className="text-xs text-muted-foreground/60">
                                    選擇來源：{o.storeSelectedBy === "admin" ? "老闆代選" : "客人選擇"}
                                  </span>
                                  {o.storeSelectedAt && (
                                    <span className="text-xs text-muted-foreground/60">
                                      {formatDate(o.storeSelectedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
                                <p className="text-xs text-amber-700">尚未選擇全家門市</p>
                              </div>
                            )}
                            {o.status !== "completed" && o.status !== "cancelled" && (
                              <button
                                type="button"
                                onClick={() => {
                                  openCvsStoreMap({
                                    provider: "family",
                                    returnPath: `${basePath}/orders`,
                                    source: "admin",
                                    orderId: o.id,
                                  });
                                }}
                                className="mt-2 w-full h-9 rounded-xl border border-primary/40 bg-primary/5 text-xs font-medium text-primary"
                              >
                                選擇 / 修改全家門市
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

      {/* Bulk action bar — shown when any order is selected */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 max-w-[480px] mx-auto z-20 bg-white border-t border-border shadow-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">已選 {selectedIds.size} 筆</span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              清除選取
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 gap-1">
              <select
                value={bulkPaymentStatus}
                onChange={(e) => { setBulkPaymentStatus(e.target.value); setBulkError(null); }}
                disabled={isBulkLoading}
                className="flex-1 min-w-0 h-9 px-2 rounded-xl border border-input bg-secondary/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">付款狀態…</option>
                <option value="unpaid">未付款</option>
                <option value="pending">待確認</option>
                <option value="partially_paid">部分付款</option>
                <option value="paid">已付款</option>
                <option value="refunded">已退款</option>
                <option value="failed">付款失敗</option>
              </select>
              <button
                type="button"
                onClick={() => handleBulkUpdate("payment")}
                disabled={!bulkPaymentStatus || isBulkLoading}
                className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-40 shrink-0"
              >
                {isBulkLoading ? "…" : "套用"}
              </button>
            </div>
            <div className="flex flex-1 gap-1">
              <select
                value={bulkShippingStatus}
                onChange={(e) => { setBulkShippingStatus(e.target.value); setBulkError(null); }}
                disabled={isBulkLoading}
                className="flex-1 min-w-0 h-9 px-2 rounded-xl border border-input bg-secondary/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">出貨狀態…</option>
                <option value="not_shipped">未出貨</option>
                <option value="preparing">備貨中</option>
                <option value="shipped">已出貨</option>
                <option value="arrived">已到貨</option>
                <option value="picked_up">已取貨</option>
                <option value="returned">已退回</option>
                <option value="cancelled">已取消</option>
              </select>
              <button
                type="button"
                onClick={() => handleBulkUpdate("shipping")}
                disabled={!bulkShippingStatus || isBulkLoading}
                className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-40 shrink-0"
              >
                {isBulkLoading ? "…" : "套用"}
              </button>
            </div>
          </div>
          {bulkError && <p className="text-xs text-destructive mt-1.5">{bulkError}</p>}

          {/* Picking / shipping tools row */}
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground/60 mb-1.5">撿貨 / 出貨工具</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleViewPickingList}
                disabled={getPickingListMutation.isPending}
                className="h-8 px-3 text-xs font-medium rounded-xl border border-primary/40 bg-primary/5 text-primary disabled:opacity-50 shrink-0"
              >
                {getPickingListMutation.isPending ? "載入中…" : "查看撿貨單"}
              </button>
              <button
                type="button"
                onClick={handleViewShippingList}
                disabled={getShippingListMutation.isPending}
                className="h-8 px-3 text-xs font-medium rounded-xl border border-primary/40 bg-primary/5 text-primary disabled:opacity-50 shrink-0"
              >
                {getShippingListMutation.isPending ? "載入中…" : "查看出貨單"}
              </button>
              <button
                type="button"
                onClick={handleDownloadPickingCsv}
                disabled={csvPickingLoading}
                className="h-8 px-3 text-xs font-medium rounded-xl border border-border bg-white text-foreground disabled:opacity-50 shrink-0"
              >
                {csvPickingLoading ? "下載中…" : "↓ 撿貨 CSV"}
              </button>
              <button
                type="button"
                onClick={handleDownloadShippingCsv}
                disabled={csvShippingLoading}
                className="h-8 px-3 text-xs font-medium rounded-xl border border-border bg-white text-foreground disabled:opacity-50 shrink-0"
              >
                {csvShippingLoading ? "下載中…" : "↓ 出貨 CSV"}
              </button>
            </div>
            {pickingListError && <p className="text-xs text-destructive mt-1">{pickingListError}</p>}
            {shippingListError && <p className="text-xs text-destructive mt-1">{shippingListError}</p>}
          </div>
        </div>
      )}

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

      <PickingListDialog
        open={pickingListOpen}
        onClose={() => setPickingListOpen(false)}
        data={pickingListData}
      />

      <ShippingListDialog
        open={shippingListOpen}
        onClose={() => setShippingListOpen(false)}
        data={shippingListData}
      />

      <TrackingImportDialog
        open={trackingImportOpen}
        onClose={() => setTrackingImportOpen(false)}
        onSuccess={() => {
          if (storeId) qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
        }}
      />
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

// ─── Tracking Import ────────────────────────────────────────────────────────

interface _TrackingImportRow {
  orderId: string;
  trackingProvider: string;
  trackingCode: string;
}

interface _TrackingImportError {
  row: number;
  orderId?: string;
  reason: string;
}

interface _TrackingImportResponse {
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: _TrackingImportError[];
}

function parseCsvRows(raw: string): { rows: _TrackingImportRow[]; error: string | null } {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], error: "CSV 內容不可為空" };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  if (headers.some((h) => h === "publictoken")) {
    return { rows: [], error: "publicToken 不可作為匯入欄位" };
  }

  const required = ["orderid", "trackingprovider", "trackingcode"] as const;
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    const labelMap: Record<string, string> = {
      orderid: "orderId",
      trackingprovider: "trackingProvider",
      trackingcode: "trackingCode",
    };
    return { rows: [], error: `缺少必要欄位：${missing.map((m) => labelMap[m]).join("、")}` };
  }

  const iIdx = headers.indexOf("orderid");
  const pIdx = headers.indexOf("trackingprovider");
  const cIdx = headers.indexOf("trackingcode");

  const rows: _TrackingImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    rows.push({
      orderId: cols[iIdx] ?? "",
      trackingProvider: cols[pIdx] ?? "",
      trackingCode: cols[cIdx] ?? "",
    });
  }
  return { rows, error: null };
}

function TrackingImportDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getToken } = useAuth();
  const [csvText, setCsvText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<_TrackingImportResponse | null>(null);

  const handleImport = async () => {
    setParseError(null);
    setResult(null);

    const { rows, error } = parseCsvRows(csvText);
    if (error) { setParseError(error); return; }
    if (rows.length === 0) { setParseError("CSV 內容不可為空"); return; }

    setIsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/tracking-import", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows }),
      });

      const data = await res.json().catch(() => null) as { error?: string } & Partial<_TrackingImportResponse>;

      if (res.status === 422) {
        setParseError(data?.error ?? "publicToken 不可作為匯入欄位");
        return;
      }
      if (!res.ok) {
        setParseError(data?.error ?? "匯入失敗，請稍後再試");
        return;
      }

      const importResult = data as _TrackingImportResponse;
      setResult(importResult);
      if (importResult.successCount > 0) onSuccess();
    } catch {
      setParseError("匯入失敗，請確認網路連線後再試");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCsvText("");
    setParseError(null);
    setResult(null);
    onClose();
  };

  const handleReset = () => {
    setResult(null);
    setCsvText("");
    setParseError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-[480px] rounded-t-2xl px-5 pt-5 pb-8 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">匯入物流號碼</h2>
          <button type="button" onClick={handleClose} className="text-xs text-muted-foreground">關閉</button>
        </div>

        <p className="text-xs text-muted-foreground mb-1">
          請貼上 CSV 內容，欄位需包含 <code className="text-[11px] bg-secondary px-1 rounded">orderId</code>、
          <code className="text-[11px] bg-secondary px-1 rounded">trackingProvider</code>、
          <code className="text-[11px] bg-secondary px-1 rounded">trackingCode</code>。
        </p>
        <p className="text-[11px] text-muted-foreground/70 mb-1">支援物流商：711、familymart、home_delivery、other</p>
        <p className="text-[10px] text-muted-foreground/50 mb-3">注意：欄位中請勿包含逗號。publicToken 不可作為匯入欄位。</p>

        <div className="bg-secondary/40 rounded-xl p-3 mb-3 text-[11px] font-mono text-muted-foreground whitespace-pre leading-relaxed">
          {"orderId,trackingProvider,trackingCode\n123,711,F45913208600\n#124,familymart,FM123456789"}
        </div>

        {!result && (
          <>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setParseError(null); }}
              placeholder="在此貼上 CSV 內容..."
              className="w-full h-32 px-3 py-2.5 rounded-xl border border-input bg-white text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-3"
            />
            {parseError && (
              <p className="text-xs text-destructive mb-3">{parseError}</p>
            )}
            <button
              type="button"
              disabled={!csvText.trim() || isLoading}
              onClick={handleImport}
              className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
            >
              {isLoading ? "匯入中…" : "開始匯入"}
            </button>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-foreground">{result.totalRows}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">總列數</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-green-600">{result.successCount}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">成功</div>
              </div>
              <div className={`${result.failedCount > 0 ? "bg-red-50" : "bg-secondary/40"} rounded-xl p-3 text-center`}>
                <div className={`text-lg font-bold ${result.failedCount > 0 ? "text-destructive" : "text-foreground"}`}>
                  {result.failedCount}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">失敗</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">錯誤列表</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs">
                      <span className="font-medium text-destructive">列 {err.row}</span>
                      {err.orderId && <span className="text-muted-foreground ml-1">(#{err.orderId})</span>}
                      <span className="text-foreground/80 ml-1">— {err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.successCount > 0 && (
              <p className="text-[11px] text-muted-foreground/70 text-center">
                已成功匯入 {result.successCount} 筆。訂單出貨狀態需另行更新。
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 h-10 rounded-xl border border-primary/40 bg-primary/5 text-sm font-medium text-primary"
              >
                再次匯入
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                關閉
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
