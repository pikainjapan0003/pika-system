import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useListOrders, useUpdateOrderStatus, useBulkUpdateOrders, useGetPickingList, useGetShippingList, getListOrdersQueryKey, type Order, type PickingListResponse, type ShippingListResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { maskAddress, maskName, maskPhone } from "@workspace/db/privacy";
import { BottomNav } from "./Dashboard";
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, STATUS_STEPS, VALID_NEXT_STATUSES } from "../lib/orderStatus";
import { isSevenElevenMethod, isFamilyMartMethod, openSevenElevenMap, openCvsStoreMap } from "@/lib/cvs711";
import { parseRecipientAddress } from "@/lib/taiwanZipcodes";
import { getProviderShortName } from "@/lib/logisticsProviders";
import {
  ORDER_MESSAGE_TEMPLATE_LABELS,
  ORDER_MESSAGE_TEMPLATE_TYPES,
  buildOrderMessage,
} from "@/lib/orderMessageTemplates";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

const DEPRECATED_METHODS: Record<string, string> = {
  "OK Mart": "OK Mart",
  "萊爾富物流": "萊爾富",
};
const HOME_DELIVERY_LABELS: Record<string, string> = {
  "黑貓宅急便": "黑貓宅急便",
  "郵局": "郵局",
  "郵局宅配": "郵局宅配",
  "宅配": "宅配（已停用）",
};

function isHomeDeliveryMethod(pickupMethod: string): boolean {
  return Object.prototype.hasOwnProperty.call(HOME_DELIVERY_LABELS, pickupMethod);
}

function isCvsMethod(pickupMethod: string): boolean {
  return isSevenElevenMethod(pickupMethod) || isFamilyMartMethod(pickupMethod);
}

function orderIsHome(pickupMethod: string, shippingMethod?: string | null): boolean {
  if (isHomeDeliveryMethod(pickupMethod)) return true;
  if (isCvsMethod(pickupMethod)) return false;
  return shippingMethod === "home_delivery";
}

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
const BACKFILL_MISSING_FIELD_INFO: Record<string, { label: string; href: string }> = {
  productCostJpy: { label: "商品日圓成本", href: "/products" },
  storeExchangeRate: { label: "店鋪進貨匯率", href: "/settings" },
  tripRoute: { label: "行程路線／交通成本", href: "/trips" },
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

// Step 7G: 訂單卡片物流摘要（資料來自 orders list API 的 shipmentTracking）
const TRACKING_STATUS_LABELS: Record<string, string> = {
  pending: "待查詢",
  checking: "查詢中",
  active: "運送中",
  delivered: "已完成",
  failed: "查詢失敗",
  inactive: "已停用",
};
// provider label 收斂至 @/lib/logisticsProviders（Step 7H-B）

// Local augmentation: generated Order may lag behind DB schema on shipmentTracking.
interface OrderShipmentTrackingSummary {
  trackingCode: string;
  trackingProvider: string;
  trackingStatus: string;
  latestEventStatus: string | null;
  latestEventDescription: string | null;
  latestEventAt: string | null;
  lastCheckedAt: string | null;
  checkError: string | null;
  updatedAt: string | null;
}
interface ProfitSnapshotDisplay {
  productCostTwd: string | null;
  transportCostTwd: string | null;
  unitProfitTwd: string | null;
  fullUnitProfitTwd: string | null;
}
interface OrderProfitSummary {
  capturedProfitSubtotalDisplayTwd: string;
  pendingOrderCount: number;
  missingSnapshotOrderCount: number;
}
type OrderWithTracking = Order & {
  shipmentTracking?: OrderShipmentTrackingSummary | null;
  profitSnapshotCostJpy?: string | null;
  profitSnapshotExchangeRate?: string | null;
  profitSnapshotProductCostTwd?: string | null;
  profitSnapshotTransportCostTwd?: string | null;
  profitSnapshotUnitProfitTwd?: string | null;
  profitSnapshotFullUnitProfitTwd?: string | null;
  profitSnapshotStatus?: "captured" | "pending" | "exempt" | null;
  profitSnapshotCapturedAt?: string | null;
  profitSnapshotBackfilledAt?: string | null;
  profitSnapshotDisplay?: ProfitSnapshotDisplay | null;
};

const TRACKING_TONE_PINK = "bg-pink-50/70 border-pink-200/70 text-pink-900";
const TRACKING_TONE_YELLOW = "bg-yellow-50/80 border-yellow-200/80 text-yellow-900";
const TRACKING_TONE_GREEN = "bg-green-50/75 border-green-200/75 text-green-900";
const TRACKING_TONE_GRAY = "bg-gray-50/80 border-gray-200/80 text-gray-700";
const TRACKING_TONE_RED = "bg-red-50/75 border-red-200/75 text-red-900";

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

// 物流摘要整框底色：紅（查詢異常/failed）> 綠（已寄達）> 粉（尚未出貨）> 黃（運送中）> 灰（未查到/無法判斷）
function getTrackingSummaryToneClass(
  statusText: string,
  trackingStatus: string | null,
  checkError: string | null,
  latestEventStatus: string | null,
): string {
  if (
    checkError ||
    trackingStatus === "failed" ||
    includesAny(statusText, ["失敗", "異常", "錯誤", "遺失", "取消", "逾期"])
  ) return TRACKING_TONE_RED;
  // 「已完成寄件」是出貨事件，需先於綠色的「已完成」判斷
  if (includesAny(statusText, ["已完成寄件"])) return TRACKING_TONE_YELLOW;
  if (
    trackingStatus === "delivered" ||
    (latestEventStatus !== null && ["arrived_store", "picked_up", "delivered"].includes(latestEventStatus)) ||
    includesAny(statusText, ["已寄達", "已送達", "已到店", "配達取件店舖", "已取貨", "已取件", "取件完成", "已完成", "投遞成功", "順利送達", "成功取件"])
  ) return TRACKING_TONE_GREEN;
  if (
    trackingStatus === "pending" ||
    includesAny(statusText, ["尚未出貨", "待查詢", "訂單成立未寄件", "未寄件"])
  ) return TRACKING_TONE_PINK;
  if (
    trackingStatus === "active" ||
    trackingStatus === "checking" ||
    includesAny(statusText, ["已出貨", "貨件前往", "物流中心", "運送", "配送", "轉運"])
  ) return TRACKING_TONE_YELLOW;
  // 未查到 / 查無資料 / 無 shipmentTracking / 無法判斷 → 灰
  return TRACKING_TONE_GRAY;
}

function formatTrackingTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface OrderItem {
  productName: string;
  specValues: Record<string, string>;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  productImageUrl?: string | null;
}

// Returns a normalized items array for multi-item (cart) orders.
// Falls back to a single item built from legacy scalar fields for old orders.
function normalizeOrderItems(order: {
  items?: unknown;
  productName?: string | null;
  specValues?: unknown;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}): OrderItem[] {
  const raw = order.items as OrderItem[] | null | undefined;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  const qty = order.quantity ?? 1;
  const unitPrice = order.unitPrice ?? (order.totalPrice != null && qty > 0 ? order.totalPrice / qty : 0);
  return [{
    productName: order.productName ?? "（商品）",
    specValues: (order.specValues as Record<string, string>) ?? {},
    quantity: qty,
    unitPrice,
    subtotal: unitPrice * qty,
  }];
}

function formatSpecSummary(specValues: Record<string, string>): string {
  const entries = Object.entries(specValues);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}：${v}`).join("、");
}

import { CreateOrderDialog } from "./CreateOrderDialog";
import { EditOrderDialog } from "./EditOrderDialog";
import { PickingListDialog } from "./PickingListDialog";
import { ShippingListDialog } from "./ShippingListDialog";
import { toast } from "@/hooks/use-toast";
import { printOrderReceipt } from "../lib/printHelpers";

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
  const [paymentLast5Query, setPaymentLast5Query] = useState("");
  const [amountQuery, setAmountQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedOrderIds, setRevealedOrderIds] = useState<Set<number>>(new Set());
  // Step 8E: App 內狀態操作確認彈窗（取代 window.confirm）
  const [statusConfirm, setStatusConfirm] = useState<{
    orderId: number;
    fromStatus: string;
    toStatus: string;
    kind: "cancel" | "restore";
  } | null>(null);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  // Step 7H: 刪除訂單（與取消訂單分開的危險操作）
  const [deleteConfirm, setDeleteConfirm] = useState<{ orderId: number; buyerName: string } | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);
  const [backfillingOrderId, setBackfillingOrderId] = useState<number | null>(null);
  const [backfillErrors, setBackfillErrors] = useState<Record<number, { message: string; missing: string[] }>>({});
  const [profitSummary, setProfitSummary] = useState<OrderProfitSummary | null>(null);
  const [exportCleartext, setExportCleartext] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("");
  const [bulkShippingStatus, setBulkShippingStatus] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const bulkUpdateOrders = useBulkUpdateOrders();

  const [, setLocation] = useLocation();

  const revealOrderPii = (order: Order) => {
    console.info("[privacy-audit] reveal_order_pii", {
      orderId: order.id,
      storeId,
      occurredAt: new Date().toISOString(),
    });
    setRevealedOrderIds((current) => new Set(current).add(order.id));
  };

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

  const allOrders = (orders ?? []) as OrderWithTracking[];

  useEffect(() => {
    if (!storeId) {
      setProfitSummary(null);
      return;
    }
    let cancelled = false;
    setProfitSummary(null);
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/stores/${storeId}/orders/profit-summary`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok || cancelled) return;
        const summary = await response.json() as OrderProfitSummary;
        if (!cancelled) setProfitSummary(summary);
      } catch {
        if (!cancelled) setProfitSummary(null);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, storeId, orders]);

  // Status filter
  const statusFiltered = filter === "all"
    ? allOrders
    : allOrders.filter((o) => o.status === filter);

  // Client-side search
  const q = searchQuery.trim().toLowerCase();
  const paymentLast5Q = paymentLast5Query.trim();
  const amountQ = amountQuery.trim().replace(/[^0-9]/g, "");
  const searched = statusFiltered.filter((o) => {
    const textMatches = !q ||
      o.buyerName.toLowerCase().includes(q) ||
      o.buyerPhone.toLowerCase().includes(q) ||
      String(o.id).includes(q) ||
      (o.productName ?? "").toLowerCase().includes(q);
    const paymentMatches = !paymentLast5Q || ((o as any).paymentLast5 ?? "").includes(paymentLast5Q);
    const orderTotal = o.orderTotal ?? (Number(o.totalPrice) + Number(o.shippingFee ?? 0));
    const amountMatches = !amountQ || String(Math.round(Number(orderTotal))).includes(amountQ);
    return textMatches && paymentMatches && amountMatches;
  });

  const sortedFiltered = [...searched].reverse();

  // Stats (computed from all orders, ignoring current filter)
  const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.orderTotal ?? (Number(o.totalPrice) + Number(o.shippingFee ?? 0))), 0);
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

  // Step 8E: 確認彈窗按下「確認」後才真正呼叫既有 handleStatusChange / API
  const handleConfirmStatusChange = () => {
    if (!statusConfirm) return;
    const { orderId, toStatus } = statusConfirm;
    setStatusConfirm(null);
    handleStatusChange(orderId, toStatus);
  };

  const handleDeleteOrder = async () => {
    if (!deleteConfirm || !storeId) return;
    const { orderId } = deleteConfirm;
    setDeletingOrderId(orderId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        const msg = typeof body?.error === "string" && body.error
          ? body.error
          : "刪除訂單失敗，請稍後再試。";
        setStatusErrors((prev) => ({ ...prev, [orderId]: msg }));
        return;
      }
      toast({ title: "訂單已刪除" });
      setStatusErrors((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      setExpandedId(null);
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
    } catch {
      setStatusErrors((prev) => ({ ...prev, [orderId]: "刪除訂單失敗，請稍後再試。" }));
    } finally {
      setDeletingOrderId(null);
      setDeleteConfirm(null);
    }
  };

  const handleBackfillProfitSnapshot = async (orderId: number) => {
    if (!storeId) return;
    setBackfillingOrderId(orderId);
    setBackfillErrors((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
    try {
      const token = await getToken();
      const res = await fetch(`/api/orders/${orderId}/profit-snapshot/backfill`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof body?.error === "string" && body.error
          ? body.error
          : "成本快照補拍失敗，請稍後再試。";
        const missing = Array.isArray(body?.missing) ? body.missing as string[] : [];
        setBackfillErrors((prev) => ({ ...prev, [orderId]: { message, missing } }));
        return;
      }
      toast({ title: "成本快照已補拍並定格" });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
    } catch {
      setBackfillErrors((prev) => ({
        ...prev,
        [orderId]: { message: "成本快照補拍失敗，請確認網路後再試。", missing: [] },
      }));
    } finally {
      setBackfillingOrderId(null);
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
    if (!storeId || allOrders.length === 0) return;
    const mode = exportCleartext ? "cleartext" : "masked";
    if (!window.confirm(`即將匯出 ${allOrders.length} 筆訂單（${exportCleartext ? "明文版" : "遮罩版"}），是否繼續？`)) return;
    if (exportCleartext && !window.confirm("明文版包含完整個資。請再次確認只會交給有權限的人員，並在使用後刪除檔案。")) return;
    setExporting(true);
    const token = await getToken();
    let res: Response;
    try {
      res = await fetch(`/api/stores/${storeId}/orders/export?mode=${mode}`, {
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(exportCleartext ? { "X-Confirm-Cleartext-Export": "true" } : {}),
        },
      });
    } catch {
      window.alert("匯出失敗，請確認網路連線後再試");
      setExporting(false);
      return;
    }
    if (!res.ok) {
      window.alert("匯出失敗，請稍後再試");
      setExporting(false);
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
    console.info("[privacy-audit] export_orders", {
      storeId,
      mode,
      count: allOrders.length,
      occurredAt: new Date().toISOString(),
    });
    setExporting(false);
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowAddOrder(true)}
              disabled={!storeId}
              className="min-h-11 px-3 text-xs font-semibold text-white bg-primary rounded-xl disabled:opacity-50"
            >
              ＋ 新增訂單
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || allOrders.length === 0}
              className="min-h-11 px-3 text-xs font-medium text-primary bg-primary/10 rounded-xl disabled:opacity-50"
            >
              {exporting ? "匯出中…" : "匯出 CSV"}
            </button>
            <button
              onClick={() => setLocation("/logistics/import")}
              disabled={!storeId}
              className="min-h-11 px-3 text-xs font-medium text-muted-foreground bg-secondary rounded-xl disabled:opacity-50"
            >
              物流匯入
            </button>
            <button
              onClick={() => setLocation("/logistics/exceptions")}
              disabled={!storeId}
              className="min-h-11 px-3 text-xs font-medium text-muted-foreground bg-secondary rounded-xl disabled:opacity-50"
            >
              物流異常
            </button>
          </div>
        </div>
        <label className="mb-2.5 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={exportCleartext}
            onChange={(event) => setExportCleartext(event.target.checked)}
            className="h-4 w-4"
          />
          匯出明文個資（下載前會再確認一次）
        </label>
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
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <input
            type="search"
            value={paymentLast5Query}
            onChange={(e) => setPaymentLast5Query(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="付款末五碼"
            inputMode="numeric"
            maxLength={5}
            className="w-full min-h-11 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="search"
            value={amountQuery}
            onChange={(e) => setAmountQuery(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="金額"
            inputMode="numeric"
            className="w-full min-h-11 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
              <div className="grid grid-cols-2 gap-2 mb-4">
                <StatCard label="訂單筆數" value={String(allOrders.length)} />
                <StatCard label="訂單總額" value={`NT$${totalRevenue.toLocaleString()}`} />
                <StatCard label="待確認" value={String(pendingCount)} urgent={pendingCount > 0} />
                <StatCard
                  label="已定格毛利小計"
                  value={profitSummary ? `NT$${Number(profitSummary.capturedProfitSubtotalDisplayTwd).toLocaleString()}` : "—"}
                />
                <StatCard
                  label="毛利待確認"
                  value={profitSummary ? String(profitSummary.pendingOrderCount) : "—"}
                  urgent={(profitSummary?.pendingOrderCount ?? 0) > 0}
                />
                <StatCard
                  label="尚無快照"
                  value={profitSummary ? String(profitSummary.missingSnapshotOrderCount) : "—"}
                  urgent={(profitSummary?.missingSnapshotOrderCount ?? 0) > 0}
                />
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
                        <span className="text-xl font-bold text-primary">NT${Number(o.orderTotal ?? (Number(o.totalPrice) + Number(o.shippingFee ?? 0))).toLocaleString()}</span>
                      </div>
                      {/* Row 2: Buyer name (left) + date (right) */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[15px] font-semibold text-foreground leading-tight">{revealedOrderIds.has(o.id) ? o.buyerName : maskName(o.buyerName)}</span>
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
                        <ProfitSnapshotBadge order={o} />
                      </div>
                      {/* Row 4: Item count + shipping status badge + expand arrow */}
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const items = normalizeOrderItems(o as any);
                          if (items.length > 1) {
                            const totalQty = items.reduce((s, i) => s + i.quantity, 0);
                            return (
                              <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
                                {items[0].productName} 等・共 {items.length} 項・{totalQty} 件
                              </span>
                            );
                          }
                          return (
                            <>
                              <span className="text-[11px] text-muted-foreground shrink-0">商品 {o.quantity} 件</span>
                              {o.productName && (
                                <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">· {o.productName}</span>
                              )}
                            </>
                          );
                        })()}
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
                      {/* Row 5: 物流摘要（Step 7G） */}
                      {(() => {
                        const t = (o as OrderWithTracking).shipmentTracking ?? null;
                        const code = (t?.trackingCode ?? o.trackingCode ?? "").trim();
                        if (!code) return null;
                        const providerKey = t?.trackingProvider ?? o.trackingProvider ?? "";
                        const provider = getProviderShortName(providerKey) ?? "物流";
                        const statusText = t
                          ? (t.latestEventDescription?.trim() || (TRACKING_STATUS_LABELS[t.trackingStatus] ?? "待查詢"))
                          : "已建立物流追蹤";
                        // 貨態時間 = 物流商最新事件時間；上次查詢 = 系統最後查詢時間（語意拆開避免誤判排程失效）
                        const eventTime = t ? formatTrackingTime(t.latestEventAt) : null;
                        const lastChecked = t
                          ? formatTrackingTime(t.lastCheckedAt) ?? formatTrackingTime(t.updatedAt)
                          : null;
                        const toneClass = getTrackingSummaryToneClass(
                          statusText,
                          t?.trackingStatus ?? null,
                          t?.checkError ?? null,
                          t?.latestEventStatus ?? null,
                        );
                        return (
                          <div className={`mt-2 rounded-2xl border px-3 py-2.5 space-y-1 min-w-0 shadow-sm ${toneClass}`}>
                            <p className="text-[11px] font-semibold">{provider}</p>
                            <p className="text-[11px] font-medium">貨態：{statusText}</p>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] break-all min-w-0">貨號：{code}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(code, `${o.id}-tracking`); }}
                                className="text-[11px] text-primary font-medium shrink-0"
                              >
                                {copiedKey === `${o.id}-tracking` ? "已複製" : "複製"}
                              </button>
                            </div>
                            <p className="text-[11px] opacity-80">貨態時間：{eventTime ?? "尚無貨態時間"}</p>
                            <p className="text-[11px] opacity-80">上次查詢：{lastChecked ?? "尚未查詢"}</p>
                            {t?.checkError && <p className="text-[11px] font-medium">物流查詢異常</p>}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Expanded detail panel */}
                    {expandedId === o.id && (
                      <div className="border-t border-border bg-secondary/20 px-4 pt-4 pb-5 space-y-3">

                        {/* 買家資訊 */}
                        <div>
                          <SectionLabel>買家資訊</SectionLabel>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <DetailRow label="姓名" value={revealedOrderIds.has(o.id) ? o.buyerName : maskName(o.buyerName)} />
                            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">電話</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{revealedOrderIds.has(o.id) ? o.buyerPhone : maskPhone(o.buyerPhone)}</span>
                                {revealedOrderIds.has(o.id) && (
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(o.buyerPhone, `${o.id}-phone`)}
                                    className="text-xs text-primary font-medium shrink-0"
                                  >
                                    {copiedKey === `${o.id}-phone` ? "已複製" : "複製"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 收件資訊（Step 7H-4） */}
                        <div>
                          <SectionLabel>收件資訊</SectionLabel>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            {(() => {
                              const rName = (o.recipientName ?? "").trim();
                              const rPhone = (o.recipientPhone ?? "").trim();
                              const isSame =
                                (!rName && !rPhone) ||
                                (rName === o.buyerName && rPhone === o.buyerPhone);
                              if (isSame) {
                                return (
                                  <>
                                    <DetailRow label="收件人" value={revealedOrderIds.has(o.id) ? (rName || o.buyerName) : maskName(rName || o.buyerName)} />
                                    <DetailRow label="收件電話" value={revealedOrderIds.has(o.id) ? (rPhone || o.buyerPhone) : maskPhone(rPhone || o.buyerPhone)} />
                                    <div className="px-3 py-2">
                                      <span className="text-[11px] text-muted-foreground/60">同買家資訊</span>
                                    </div>
                                  </>
                                );
                              }
                              return (
                                <>
                                  <DetailRow label="收件人" value={revealedOrderIds.has(o.id) ? (rName || "—") : maskName(rName)} />
                                  <DetailRow label="收件電話" value={revealedOrderIds.has(o.id) ? (rPhone || "—") : maskPhone(rPhone)} />
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* 商品明細 */}
                        <div>
                          <SectionLabel>商品明細</SectionLabel>
                          {(() => {
                            const items = normalizeOrderItems(o as any);
                            if (items.length > 1) {
                              return (
                                <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                                  {items.map((item, idx) => {
                                    const specSummary = formatSpecSummary(item.specValues);
                                    return (
                                      <div key={idx} className="px-3 py-2.5 flex items-start gap-2.5">
                                        {item.productImageUrl && (
                                          <img
                                            src={item.productImageUrl}
                                            alt={item.productName}
                                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                          />
                                        )}
                                        <div className="flex-1 min-w-0 space-y-0.5">
                                          <div className="text-xs font-semibold text-foreground">{item.productName}</div>
                                          {specSummary && (
                                            <div className="text-[11px] text-muted-foreground">{specSummary}</div>
                                          )}
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-[11px] text-muted-foreground">× {item.quantity} 件 · NT$ {item.unitPrice.toLocaleString()} / 件</span>
                                            <span className="text-xs font-semibold text-foreground">NT$ {item.subtotal.toLocaleString()}</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return (
                              <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                                <DetailRow label="商品名稱" value={o.productName ?? "—"} />
                                <DetailRow label="數量" value={`× ${o.quantity}`} />
                                {o.unitPrice != null && (
                                  <DetailRow label="單價" value={`NT$ ${Number(o.unitPrice).toLocaleString()}`} />
                                )}
                                <DetailRow label="商品小計" value={`NT$ ${Number(o.totalPrice).toLocaleString()}`} bold />
                              </div>
                            );
                          })()}
                        </div>

                        {/* 成本與單件毛利快照（只顯示訂單建立/補拍時定格值） */}
                        <div>
                          <SectionLabel>成本與單件毛利</SectionLabel>
                          <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                            <DetailRow
                              label="快照狀態"
                              value={profitSnapshotStatusLabel(o.profitSnapshotStatus)}
                              bold
                            />
                            {o.profitSnapshotStatus === "pending" || o.profitSnapshotStatus == null ? (
                              <>
                                <DetailRow label="商品日圓成本" value="待確認" />
                                <DetailRow label="店鋪進貨匯率" value="待確認" />
                                <DetailRow label="單件交通成本" value="待確認" />
                                <DetailRow label="單件毛利" value="待確認" bold />
                                <div className="px-3 py-3 space-y-2">
                                  <p className="text-xs text-amber-700">
                                    {o.profitSnapshotStatus == null
                                      ? "舊單可用現在的成本補拍一次；補拍時間不是成交當時，成功後即永久定格。"
                                      : "成本資料補齊後可補拍一次；成功後即永久定格。"}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => void handleBackfillProfitSnapshot(o.id)}
                                    disabled={backfillingOrderId === o.id}
                                    className="w-full min-h-11 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                                  >
                                    {backfillingOrderId === o.id && (
                                      <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                                    )}
                                    {backfillingOrderId === o.id ? "補拍中…" : "補拍成本快照"}
                                  </button>
                                  {backfillErrors[o.id] && (
                                    <div className="bg-destructive/10 rounded-xl px-3 py-2.5 space-y-1.5">
                                      <p className="text-xs text-destructive font-medium">
                                        {backfillErrors[o.id].message}
                                      </p>
                                      {backfillErrors[o.id].missing.length > 0 && (
                                        <ul className="space-y-1">
                                          {backfillErrors[o.id].missing.map((field) => {
                                            const info = BACKFILL_MISSING_FIELD_INFO[field];
                                            if (!info) return null;
                                            const href = field === "productCostJpy" ? `/products/${o.productId}/edit` : info.href;
                                            return (
                                              <li key={field} className="text-xs text-destructive/90 flex items-center justify-between gap-2">
                                                <span>缺少：{info.label}</span>
                                                <a href={href} className="shrink-0 text-primary font-medium underline">
                                                  前往設定
                                                </a>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : o.profitSnapshotStatus === "captured" || o.profitSnapshotStatus === "exempt" ? (
                              <>
                                <DetailRow
                                  label="商品日圓成本"
                                  value={`¥ ${trimSnapshotDecimal(o.profitSnapshotCostJpy)}`}
                                />
                                <DetailRow
                                  label="店鋪進貨匯率"
                                  value={trimSnapshotDecimal(o.profitSnapshotExchangeRate)}
                                />
                                <DetailRow
                                  label="商品台幣成本"
                                  value={formatSnapshotMoney(o.profitSnapshotDisplay?.productCostTwd)}
                                />
                                <DetailRow
                                  label="單件交通成本"
                                  value={o.profitSnapshotStatus === "exempt"
                                    ? "免攤"
                                    : formatSnapshotMoney(o.profitSnapshotDisplay?.transportCostTwd)}
                                />
                                <DetailRow
                                  label="單件毛利"
                                  value={formatSnapshotMoney(o.profitSnapshotDisplay?.unitProfitTwd)}
                                  bold
                                />
                                <DetailRow
                                  label="全毛利（未扣交通）"
                                  value={formatSnapshotMoney(o.profitSnapshotDisplay?.fullUnitProfitTwd)}
                                />
                                <DetailRow
                                  label="成交快照時間"
                                  value={o.profitSnapshotCapturedAt
                                    ? formatDate(o.profitSnapshotCapturedAt)
                                    : "待確認"}
                                />
                                {o.profitSnapshotBackfilledAt && (
                                  <DetailRow
                                    label={o.profitSnapshotCapturedAt ? "補拍時間" : "補拍快照（非成交當時）"}
                                    value={formatDate(o.profitSnapshotBackfilledAt)}
                                  />
                                )}
                              </>
                            ) : (
                              <DetailRow label="成本快照" value="尚未建立" />
                            )}
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
                            <DetailRow label="付款末五碼" value={(o as any).paymentLast5 ?? "尚未填寫"} />
                            {o.discountAmount != null && o.discountAmount > 0 && (
                              <DetailRow
                                label="折讓"
                                value={`-NT$ ${Number(o.discountAmount).toLocaleString()}`}
                              />
                            )}
                            {o.discountNote && (
                              <DetailRow label="折讓備註" value={o.discountNote} />
                            )}
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
                            {/* 宅配欄位：只有黑貓/郵局/宅配才顯示 */}
                            {orderIsHome(o.pickupMethod, o.shippingMethod) && (
                              <>
                                {o.trackingCode && <DetailRow label="物流追蹤碼" value={o.trackingCode} />}
                                {o.trackingProvider && <DetailRow label="物流商" value={o.trackingProvider} />}
                                {o.recipientName && <DetailRow label="收件人" value={revealedOrderIds.has(o.id) ? o.recipientName : maskName(o.recipientName)} />}
                                {o.recipientPhone && <DetailRow label="收件電話" value={revealedOrderIds.has(o.id) ? o.recipientPhone : maskPhone(o.recipientPhone)} />}
                                {o.recipientAddress && !revealedOrderIds.has(o.id) && <DetailRow label="收件地址" value={maskAddress(o.recipientAddress)} />}
                                {o.recipientAddress && revealedOrderIds.has(o.id) && (() => {
                                  const parsed = parseRecipientAddress(o.recipientAddress);
                                  if (!parsed) return <DetailRow label="收件地址" value={o.recipientAddress!} />;
                                  return (
                                    <>
                                      {parsed.zip && <DetailRow label="郵遞區號" value={parsed.zip} />}
                                      <DetailRow label="縣市" value={parsed.city} />
                                      {parsed.district && <DetailRow label="行政區" value={parsed.district} />}
                                      {parsed.line && <DetailRow label="詳細地址" value={parsed.line} />}
                                    </>
                                  );
                                })()}
                              </>
                            )}
                            {/* 面交 / 自取地點：沿用 recipientAddress 欄位，label 依取貨方式 */}
                            {(o.pickupMethod === "面交" || o.pickupMethod === "自取") && o.recipientAddress && (() => {
                              const label = o.pickupMethod === "面交" ? "面交地點" : "自取地點";
                              const parsed = parseRecipientAddress(o.recipientAddress);
                              const value = parsed
                                ? `${parsed.city}${parsed.district}${parsed.line}`.trim()
                                : o.recipientAddress;
                              return <DetailRow label={label} value={revealedOrderIds.has(o.id) ? value : maskAddress(value)} />;
                            })()}
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
                                {o.cvsStorePhone && <div className="text-xs text-muted-foreground/70">電話：{o.cvsStorePhone}</div>}
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
                                {o.cvsStorePhone && <div className="text-xs text-muted-foreground/70">電話：{o.cvsStorePhone}</div>}
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
                        {orderIsHome(o.pickupMethod, o.shippingMethod) && (
                          <div>
                            <SectionLabel>物流方式</SectionLabel>
                            <div className="bg-white rounded-xl border border-border/50 px-4 py-3">
                              <span className="text-sm font-medium text-foreground">{HOME_DELIVERY_LABELS[o.pickupMethod] ?? o.pickupMethod}</span>
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

                        {/* 規格（多品項訂單的規格已顯示在商品明細各項目中，此區只給單品項訂單） */}
                        {!(Array.isArray((o as any).items) && (o as any).items.length > 1) && o.specValues && Object.keys(o.specValues as object).length > 0 && (
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
                          {!revealedOrderIds.has(o.id) && (
                            <button
                              type="button"
                              onClick={() => revealOrderPii(o)}
                              className="mt-2 min-h-11 px-4 rounded-xl border border-border text-sm font-medium"
                            >
                              顯示完整資料
                            </button>
                          )}
                        </div>

                        {/* Copy-only message templates; never sends automatically. */}
                        <div>
                          <SectionLabel>客人通知文案</SectionLabel>
                          <div className="grid grid-cols-3 gap-2">
                            {ORDER_MESSAGE_TEMPLATE_TYPES.map((templateType) => {
                              const items = normalizeOrderItems(o as any);
                              const productSummary = items
                                .map((item) => `${item.productName} × ${item.quantity}`)
                                .join("、");
                              const amount = Number(
                                o.orderTotal ??
                                  Number(o.totalPrice) + Number(o.shippingFee ?? 0),
                              ).toLocaleString();
                              const copyKey = `${o.id}-message-${templateType}`;
                              return (
                                <button
                                  key={templateType}
                                  type="button"
                                  onClick={() =>
                                    copyToClipboard(
                                      buildOrderMessage(templateType, {
                                        orderNumber: `#${o.id}`,
                                        productSummary,
                                        amountTwd: amount,
                                        pickupMethod: o.pickupMethod,
                                      }),
                                      copyKey,
                                    )
                                  }
                                  className="min-h-10 rounded-xl border border-border bg-white px-2 py-2 text-xs font-medium text-foreground"
                                >
                                  {copiedKey === copyKey
                                    ? "已複製"
                                    : ORDER_MESSAGE_TEMPLATE_LABELS[templateType]}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            只會複製到剪貼簿，不會自動發送。
                          </p>
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

                        {/* 列印銷貨單 */}
                        <button
                          type="button"
                          onClick={() => printOrderReceipt(o, store)}
                          className="w-full h-9 rounded-xl border border-border bg-white text-xs font-medium text-foreground"
                        >
                          列印銷貨單
                        </button>

                        {/* 更新狀態 / 危險操作 */}
                        {(() => {
                          const nextStatuses = VALID_NEXT_STATUSES[o.status] ?? [];
                          const hasCancelOption = nextStatuses.includes("cancelled");
                          // Step 8C: completed / cancelled 不再是死路，老闆可手動復原成其他狀態，
                          // 但因為這類變更會「復原一筆已結束的訂單」，需要額外二次確認。
                          const isRestoringFromTerminal = o.status === "completed" || o.status === "cancelled";
                          const handleNormalStatusClick = (s: string) => {
                            if (s === o.status) return;
                            if (isRestoringFromTerminal) {
                              setStatusConfirm({ orderId: o.id, fromStatus: o.status, toStatus: s, kind: "restore" });
                              return;
                            }
                            handleStatusChange(o.id, s);
                          };
                          return (
                            <>
                              <div>
                                <SectionLabel>更新狀態</SectionLabel>
                                {isRestoringFromTerminal && (
                                  <p className="text-xs text-muted-foreground mb-1.5">
                                    此訂單目前已結束（{STATUS_LABELS[o.status] ?? o.status}），選擇以下狀態將會復原並變更此訂單。
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  {STATUS_STEPS.map((s) => {
                                    const isCurrent = s === o.status;
                                    return (
                                      <button
                                        key={s}
                                        type="button"
                                        disabled={isCurrent || loadingOrderId === o.id}
                                        aria-current={isCurrent ? "true" : undefined}
                                        onClick={() => handleNormalStatusClick(s)}
                                        className={`h-9 px-4 rounded-xl text-sm font-medium border transition-colors ${
                                          isCurrent
                                            ? "border-primary bg-primary/10 text-primary cursor-default disabled:opacity-100"
                                            : `${STATUS_COLORS[s] ? `border-transparent ${STATUS_COLORS[s]}` : "border-input bg-white text-foreground"} disabled:opacity-60`
                                        }`}
                                      >
                                        {!isCurrent && loadingOrderId === o.id ? "更新中..." : STATUS_LABELS[s]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {(() => {
                                // Step 7H: 刪除限制 — 已出貨 / 已完成 / 已有物流追蹤的訂單不可刪除
                                const hasTracking = !!(o as OrderWithTracking).shipmentTracking || !!(o.trackingCode ?? "").trim();
                                const deleteBlocked = o.status === "shipped" || o.status === "completed" || hasTracking;
                                return (
                                  <div className="border border-red-200 rounded-xl px-3 py-3 bg-red-50/40 space-y-2">
                                    <SectionLabel>危險操作</SectionLabel>
                                    <p className="text-[11px] text-muted-foreground">
                                      取消訂單：保留紀錄，狀態改為已取消。刪除訂單：移除誤建立或誤下的訂單，刪除後不可復原。
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {hasCancelOption && (
                                        <button
                                          type="button"
                                          disabled={loadingOrderId === o.id}
                                          onClick={() => setStatusConfirm({ orderId: o.id, fromStatus: o.status, toStatus: "cancelled", kind: "cancel" })}
                                          className="h-9 px-4 rounded-xl text-sm font-medium border border-red-300 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                                        >
                                          {loadingOrderId === o.id ? "更新中..." : "取消訂單"}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={deleteBlocked || deletingOrderId === o.id}
                                        onClick={() => setDeleteConfirm({ orderId: o.id, buyerName: o.buyerName })}
                                        className="h-9 px-4 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                                      >
                                        {deletingOrderId === o.id ? "刪除中..." : "刪除訂單"}
                                      </button>
                                    </div>
                                    {deleteBlocked && (
                                      <p className="text-[11px] text-muted-foreground">
                                        這筆訂單已有物流或完成紀錄，為避免帳務與物流資料不一致，請保留紀錄或改用取消訂單。
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                              {statusErrors[o.id] && (
                                <p className="text-xs text-destructive mt-0.5">{statusErrors[o.id]}</p>
                              )}
                            </>
                          );
                        })()}
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
                className="flex-1 min-w-0 min-h-11 px-2 rounded-xl border border-input bg-secondary/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
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
                className="min-h-11 px-3 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-40 shrink-0"
              >
                {isBulkLoading ? "…" : "套用"}
              </button>
            </div>
            <div className="flex flex-1 gap-1">
              <select
                value={bulkShippingStatus}
                onChange={(e) => { setBulkShippingStatus(e.target.value); setBulkError(null); }}
                disabled={isBulkLoading}
                className="flex-1 min-w-0 min-h-11 px-2 rounded-xl border border-input bg-secondary/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
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
                className="min-h-11 px-3 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-40 shrink-0"
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
                className="min-h-11 px-3 text-xs font-medium rounded-xl border border-primary/40 bg-primary/5 text-primary disabled:opacity-50 shrink-0"
              >
                {getPickingListMutation.isPending ? "載入中…" : "查看撿貨單"}
              </button>
              <button
                type="button"
                onClick={handleViewShippingList}
                disabled={getShippingListMutation.isPending}
                className="min-h-11 px-3 text-xs font-medium rounded-xl border border-primary/40 bg-primary/5 text-primary disabled:opacity-50 shrink-0"
              >
                {getShippingListMutation.isPending ? "載入中…" : "查看出貨單"}
              </button>
              <button
                type="button"
                onClick={handleDownloadPickingCsv}
                disabled={csvPickingLoading}
                className="min-h-11 px-3 text-xs font-medium rounded-xl border border-border bg-white text-foreground disabled:opacity-50 shrink-0"
              >
                {csvPickingLoading ? "下載中…" : "↓ 撿貨 CSV"}
              </button>
              <button
                type="button"
                onClick={handleDownloadShippingCsv}
                disabled={csvShippingLoading}
                className="min-h-11 px-3 text-xs font-medium rounded-xl border border-border bg-white text-foreground disabled:opacity-50 shrink-0"
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

      {/* Step 8E: 狀態操作確認彈窗（取代 window.confirm，App 內樣式，手機可用） */}
      <AlertDialog
        open={!!statusConfirm}
        onOpenChange={(open) => { if (!open) setStatusConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusConfirm?.kind === "cancel" ? "取消訂單" : "復原訂單狀態"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirm?.kind === "cancel"
                ? "確定要取消這筆訂單嗎？取消後仍可由後台重新改回其他狀態，但此操作可能影響後續處理。"
                : statusConfirm
                ? `此訂單目前為「${STATUS_LABELS[statusConfirm.fromStatus] ?? statusConfirm.fromStatus}」，確定要改回「${STATUS_LABELS[statusConfirm.toStatus] ?? statusConfirm.toStatus}」嗎？這會復原一筆已結束的訂單。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStatusConfirm(null)}>先不要</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              disabled={!!statusConfirm && loadingOrderId === statusConfirm.orderId}
              className={statusConfirm?.kind === "cancel" ? buttonVariants({ variant: "destructive" }) : undefined}
            >
              {statusConfirm?.kind === "cancel" ? "確認取消" : "確認變更"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 7H: 刪除訂單二次確認 */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open && deletingOrderId === null) setDeleteConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除訂單</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm
                ? `確定要刪除訂單 #${deleteConfirm.orderId}${deleteConfirm.buyerName ? `（買家：${deleteConfirm.buyerName}）` : ""} 嗎？刪除後不可復原。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingOrderId !== null}
              onClick={() => setDeleteConfirm(null)}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteOrder(); }}
              disabled={deletingOrderId !== null}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deletingOrderId !== null ? "刪除中..." : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function formatSnapshotInteger(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}`;
}

function formatSnapshotMoney(value: string | null | undefined): string {
  return value == null ? "待確認" : `NT$ ${formatSnapshotInteger(value)}`;
}

function trimSnapshotDecimal(value: string | null | undefined): string {
  if (value == null) return "待確認";
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function profitSnapshotStatusLabel(status: OrderWithTracking["profitSnapshotStatus"]): string {
  if (status === "captured") return "已定格";
  if (status === "exempt") return "免攤・已定格";
  if (status === "pending") return "待確認";
  return "尚未建立";
}

function ProfitSnapshotBadge({ order }: { order: OrderWithTracking }) {
  if (order.profitSnapshotStatus === "pending") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 shrink-0">
        毛利待確認
      </span>
    );
  }
  if (order.profitSnapshotStatus === "captured" || order.profitSnapshotStatus === "exempt") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 shrink-0">
        毛利 {formatSnapshotMoney(order.profitSnapshotDisplay?.unitProfitTwd)}
        {order.profitSnapshotStatus === "exempt" ? "・免攤" : ""}
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 shrink-0">
      毛利尚無快照
    </span>
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
