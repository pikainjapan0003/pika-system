import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicOrder } from "@workspace/api-client-react";
import { STATUS_COLORS, STATUS_STEPS, STATUS_LABELS } from "../lib/orderStatus";
import { formatActionableError } from "@/lib/actionableError";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import { exactDecimal } from "@/components/charts/exactChart";
import { trimAmountForDisplay } from "@/lib/operatingCostDisplay";

interface Props {
  publicToken: string;
}

type StepStatus = (typeof STATUS_STEPS)[number];
type StepState = "done" | "current" | "future";

function getStepState(step: StepStatus, currentStatus: string): StepState {
  // All steps are done when the order is fully completed
  if (currentStatus === "completed") return "done";
  const stepIndex = STATUS_STEPS.indexOf(step);
  const currentIndex = STATUS_STEPS.indexOf(currentStatus as StepStatus);
  // currentIndex is -1 for statuses not in STATUS_STEPS (e.g. cancelled)
  if (currentIndex === -1) return "future";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "future";
}

// 客人端大狀態 badge：依物流最新貨態與訂單狀態歸納
function getTrackingBadge(order: {
  status: string;
  trackingCode?: string | null;
  latestTrackingStatus?: string | null;
}): { label: string; className: string } {
  if (order.status === "cancelled") {
    return { label: "已取消", className: "bg-muted text-muted-foreground" };
  }
  switch (order.latestTrackingStatus) {
    case "delivered":
      return { label: "已送達", className: "bg-chart-3/10 text-chart-3" };
    case "picked_up":
      return { label: "已取貨", className: "bg-chart-3/10 text-chart-3" };
    case "arrived_store":
      return { label: "待取貨", className: "bg-chart-4/10 text-chart-4" };
    case "in_transit":
      return { label: "運送中", className: "bg-chart-4/10 text-chart-4" };
    case "pending":
      return { label: "已出貨", className: "bg-chart-4/10 text-chart-4" };
    case "returned":
    case "exception":
    case "unknown":
      return { label: "需店家確認", className: "bg-accent/10 text-accent" };
  }
  if (order.trackingCode) {
    return { label: "已出貨", className: "bg-chart-4/10 text-chart-4" };
  }
  return {
    label: "店家處理中",
    className: "bg-secondary text-muted-foreground",
  };
}

// 面交 / 自取同屬 self_pickup，文案與判斷需一致（同 printHelpers 的 fulfillment category 邏輯）
function isSelfPickup(pickupMethod?: string | null): boolean {
  const m = (pickupMethod ?? "").trim();
  if (m === "面交" || m === "自取" || m === "self_pickup") return true;
  // 涵蓋「面交 / 自取」等合併寫法
  return m.includes("面交") || m.includes("自取");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "待確認（時間未完整回傳）";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "待確認（時間未完整回傳）";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeExactAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const decimal = exactDecimal(normalized);
  return decimal !== null && !decimal.isNegative() ? normalized : null;
}

function formatExactAmountForDisplay(value: unknown): string | null {
  const normalized = normalizeExactAmount(value);
  if (normalized === null) return null;
  const decimal = exactDecimal(normalized);
  if (decimal === null) return null;
  const trimmed = trimAmountForDisplay(decimal.toDecimalPlaces(3));
  const [integerPart, fractionPart] = trimmed.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractionPart === undefined
    ? groupedInteger
    : `${groupedInteger}.${fractionPart}`;
}

function normalizeQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function multiplyExactAmount(
  amount: string | null,
  quantity: number | null,
): string | null {
  if (amount === null || quantity === null) return null;
  const amountDecimal = exactDecimal(amount);
  const quantityDecimal = exactDecimal(String(quantity));
  if (amountDecimal === null || quantityDecimal === null) return null;
  return amountDecimal.multiply(quantityDecimal).toDecimalPlaces(12);
}

function divideExactAmount(
  amount: string | null,
  quantity: number | null,
): string | null {
  if (amount === null || quantity === null) return null;
  const amountDecimal = exactDecimal(amount);
  const quantityDecimal = exactDecimal(String(quantity));
  if (amountDecimal === null || quantityDecimal === null) return null;
  return amountDecimal.divide(quantityDecimal).toDecimalPlaces(12);
}

interface OrderItem {
  productName: string | null;
  specValues: Record<string, string>;
  quantity: number | null;
  unitPrice: string | null;
  subtotal: string | null;
  productImageUrl?: string | null;
}

interface NormalizedOrderItems {
  items: OrderItem[];
  malformedItemCount: number;
}

// Returns a normalized items array. If order.items (JSONB multi-item) exists, use it.
// Otherwise fall back to legacy single-product fields so old orders keep working.
function normalizeOrderItems(order: {
  items?: unknown;
  productName?: string | null;
  specValues?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  totalPrice?: unknown;
}): NormalizedOrderItems {
  const raw = Array.isArray(order.items) ? order.items : [];
  if (raw.length > 0) {
    const items = raw.flatMap((entry): OrderItem[] => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return [];
      }

      const item = entry as Record<string, unknown>;
      const quantity = normalizeQuantity(item.quantity);
      const unitPrice = normalizeExactAmount(item.unitPrice);
      return [
        {
          productName:
            typeof item.productName === "string" && item.productName.trim()
              ? item.productName
              : null,
          specValues:
            item.specValues !== null &&
            typeof item.specValues === "object" &&
            !Array.isArray(item.specValues)
              ? (item.specValues as Record<string, string>)
              : {},
          quantity,
          unitPrice,
          subtotal:
            normalizeExactAmount(item.subtotal) ??
            multiplyExactAmount(unitPrice, quantity),
          productImageUrl:
            typeof item.productImageUrl === "string"
              ? item.productImageUrl
              : null,
        },
      ];
    });
    return {
      items,
      malformedItemCount: raw.length - items.length,
    };
  }

  const quantity = normalizeQuantity(order.quantity);
  const totalPrice = normalizeExactAmount(order.totalPrice);
  const explicitUnitPrice = normalizeExactAmount(order.unitPrice);
  const unitPrice =
    explicitUnitPrice ?? divideExactAmount(totalPrice, quantity);
  const productName = order.productName?.trim() || null;
  if (
    productName === null &&
    quantity === null &&
    unitPrice === null &&
    totalPrice === null
  ) {
    return { items: [], malformedItemCount: 0 };
  }
  return {
    items: [
      {
        productName,
        specValues: (order.specValues as Record<string, string>) ?? {},
        quantity,
        unitPrice,
        subtotal: totalPrice ?? multiplyExactAmount(unitPrice, quantity),
      },
    ],
    malformedItemCount: 0,
  };
}

function formatSpecSummary(specValues: Record<string, string>): string {
  const entries = Object.entries(specValues);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}：${v}`).join("、");
}

export default function TrackOrderPage({ publicToken }: Props) {
  const [, setLocation] = useLocation();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [paymentLast5, setPaymentLast5] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [savingPaymentLast5, setSavingPaymentLast5] = useState(false);
  const [copyError, setCopyError] = useState("");
  const {
    data: order,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetPublicOrder(publicToken);

  useEffect(() => {
    setPaymentLast5((order as any)?.paymentLast5 ?? "");
  }, [order?.publicToken, (order as any)?.paymentLast5]);

  const handleCopyToken = (text: string) => {
    setCopyError("");
    if (!navigator.clipboard) {
      setCopyError("複製功能無法使用，請長按訂單查詢碼手動複製。");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      })
      .catch(() => {
        setCopyError("複製失敗，請長按訂單查詢碼手動複製。");
      });
  };

  const handleCopyTracking = (text: string) => {
    setCopyError("");
    if (!navigator.clipboard) {
      setCopyError("複製功能無法使用，請長按物流追蹤碼手動複製。");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedTracking(true);
        setTimeout(() => setCopiedTracking(false), 2000);
      })
      .catch(() => {
        setCopyError("複製失敗，請長按物流追蹤碼手動複製。");
      });
  };

  const canEditPaymentLast5 =
    order?.status === "pending" || order?.status === "awaiting_payment";
  const handleSavePaymentLast5 = async () => {
    setSavingPaymentLast5(true);
    setPaymentMessage("");
    try {
      const response = await fetch(
        `/api/orders/track/${encodeURIComponent(publicToken)}/payment-last5`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentLast5: paymentLast5.trim() || null }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "付款末五碼儲存失敗");
      setPaymentLast5(payload.paymentLast5 ?? "");
      setPaymentMessage("已儲存，僅供人工對帳。");
    } catch (saveError) {
      setPaymentMessage(
        formatActionableError({
          happened: "付款末五碼沒有儲存。",
          reason:
            saveError instanceof Error
              ? saveError.message
              : "網路或系統暫時沒有回應。",
          action: "請確認仍在可修改的付款階段，再重新儲存。",
          support: "若仍失敗，請把訂單查詢碼提供給店家。",
        }),
      );
    } finally {
      setSavingPaymentLast5(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background px-5 py-8">
        <SemanticStatePanel
          className="mx-auto max-w-sm"
          state={{
            kind: "loading",
            label: "正在載入訂單狀態",
            fallbackMessage: "若等待時間過長，請確認網路連線後重新整理。",
          }}
        />
      </div>
    );
  }

  if (error) {
    const is404 = (error as { status?: number })?.status === 404;
    return (
      <div className="min-h-[100dvh] bg-background px-5 py-8">
        <SemanticStatePanel
          className="mx-auto max-w-sm"
          state={
            is404
              ? {
                  kind: "emptyAction",
                  title: "找不到此訂單",
                  reason:
                    "訂單查詢碼可能不完整或不正確。請回到查詢入口，重新貼上完整查詢碼。",
                  action: {
                    label: "返回查詢入口",
                    onAction: () => setLocation("/track"),
                  },
                }
              : {
                  kind: "pageError",
                  title: "訂單狀態載入失敗",
                  message: formatActionableError({
                    happened: "訂單狀態暫時無法載入。",
                    reason:
                      error instanceof Error
                        ? error.message
                        : "網路或系統暫時沒有回應。",
                    action: "請保留查詢碼，重新載入一次。",
                    support: "若持續失敗，請把畫面截圖傳給店家。",
                  }),
                  retry: {
                    label: isFetching ? "重新載入中…" : "重新載入",
                    onAction: () => void refetch(),
                    busy: isFetching,
                  },
                }
          }
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[100dvh] bg-background px-5 py-8">
        <SemanticStatePanel
          className="mx-auto max-w-sm"
          state={{
            kind: "pending",
            title: "訂單資料待確認",
            reason: "系統尚未回傳完整訂單內容，沒有以 0 或空白代替。",
            action: {
              label: isFetching ? "重新確認中…" : "重新確認",
              onAction: () => void refetch(),
              busy: isFetching,
            },
          }}
        />
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const statusColor =
    STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground";
  const { items, malformedItemCount } = normalizeOrderItems(
    order as unknown as Parameters<typeof normalizeOrderItems>[0],
  );
  const orderTotalDisplay = formatExactAmountForDisplay(order.orderTotal);

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8">
      <div className="max-w-sm mx-auto w-full">
        {/* Header */}
        <div className="flex items-center mb-5 gap-3">
          <button
            onClick={() => setLocation("/track")}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground"
          >
            ←
          </button>
          <div className="flex-1 text-center">
            {order.storeName && (
              <p className="text-xs text-muted-foreground mb-0.5">
                {order.storeName}
              </p>
            )}
            <h1 className="text-xl font-bold text-foreground">物流查詢</h1>
          </div>
          <div className="w-6" />
        </div>

        {/* Big status badge */}
        {(() => {
          const badge = getTrackingBadge(order);
          return (
            <div className="bg-card rounded-2xl border border-border px-5 py-4 mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">物流狀態</span>
              <span
                className={`text-sm px-3 py-1.5 rounded-full font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
          );
        })()}

        {/* Cancelled notice OR progress timeline */}
        {isCancelled ? (
          <div className="bg-destructive/5 rounded-2xl border border-destructive/20 px-5 py-4 mb-3">
            <p className="text-sm font-semibold text-destructive">
              此訂單已取消
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              如有疑問，請聯繫商家。
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border mb-3 overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-xs font-semibold text-muted-foreground">
                訂單進度
              </h2>
            </div>
            <div className="px-5 py-4">
              {STATUS_STEPS.map((step, i) => {
                const state = getStepState(step, order.status);
                const isLast = i === STATUS_STEPS.length - 1;
                return (
                  <div key={step} className="flex gap-3 items-start">
                    {/* Circle + connector line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          state === "done"
                            ? "bg-chart-3/10 text-chart-3"
                            : state === "current"
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {state === "done" ? "✓" : ""}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-px h-5 mt-0.5 ${state === "done" ? "bg-chart-3/40" : "bg-border"}`}
                        />
                      )}
                    </div>

                    {/* Label + "目前" badge */}
                    <div
                      className={`flex-1 flex items-center gap-2 ${isLast ? "pb-0" : "pb-3"}`}
                    >
                      <span
                        className={`text-sm ${
                          state === "done"
                            ? "text-chart-3 font-medium"
                            : state === "current"
                              ? "text-primary font-semibold"
                              : "text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[step]}
                      </span>
                      {state === "current" && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium leading-none">
                          目前
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items card — supports both multi-item (cart) orders and legacy single-item orders */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-3">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground">
              商品明細
            </h2>
          </div>
          {items.length === 0 ? (
            <SemanticStatePanel
              className="border-0"
              state={{
                kind: "pending",
                title: "商品明細待確認",
                reason:
                  malformedItemCount > 0
                    ? `系統回傳的 ${malformedItemCount} 筆商品資料格式不完整，沒有以空白或 0 代替。`
                    : "系統尚未回傳商品名稱、數量與金額，沒有以 0 代替。",
              }}
            />
          ) : (
            <div className="divide-y divide-border">
              {malformedItemCount > 0 && (
                <SemanticStatePanel
                  className="border-0"
                  state={{
                    kind: "pending",
                    title: "部分商品明細待確認",
                    reason: `系統有 ${malformedItemCount} 筆商品資料格式不完整，已先顯示其餘可確認內容，沒有以空白或 0 代替。`,
                  }}
                />
              )}
              {items.map((item, idx) => {
                const specSummary = formatSpecSummary(item.specValues);
                const unitPriceDisplay = formatExactAmountForDisplay(
                  item.unitPrice,
                );
                const subtotalDisplay = formatExactAmountForDisplay(
                  item.subtotal,
                );
                const missingParts = [
                  item.productName === null ? "商品名稱" : null,
                  item.quantity === null ? "數量" : null,
                  unitPriceDisplay === null ? "單價" : null,
                  subtotalDisplay === null ? "小計" : null,
                ].filter((part): part is string => part !== null);
                return (
                  <div key={idx} className="px-5 py-3 flex items-start gap-3">
                    {item.productImageUrl && (
                      <img
                        src={item.productImageUrl}
                        alt={item.productName ?? "商品圖片"}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {item.productName ?? "商品名稱待確認"}
                      </div>
                      {specSummary && (
                        <div className="text-xs text-muted-foreground">
                          規格：{specSummary}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <span className="text-xs text-muted-foreground tabular-nums lining-nums">
                          {item.quantity === null
                            ? "數量待確認"
                            : "× " + item.quantity + " 件"}{" "}
                          ·{" "}
                          {unitPriceDisplay === null
                            ? "單價待確認"
                            : "NT$ " + unitPriceDisplay + " / 件"}
                        </span>
                        <span className="text-sm font-semibold text-foreground tabular-nums lining-nums">
                          {subtotalDisplay === null
                            ? "小計待確認"
                            : "NT$ " + subtotalDisplay}
                        </span>
                      </div>
                      {missingParts.length > 0 && (
                        <p className="text-xs text-accent" role="status">
                          資料待確認：系統未完整回傳
                          {missingParts.join("、")}。
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-5 py-3 border-t border-border space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">
                訂單總額
              </span>
              <span className="text-base font-bold text-primary tabular-nums lining-nums">
                {orderTotalDisplay === null
                  ? "待確認"
                  : "NT$ " + orderTotalDisplay}
              </span>
            </div>
            {orderTotalDisplay === null && (
              <p className="text-xs text-accent" role="status">
                原因：系統未回傳有效訂單總額，沒有以 0 代替。
              </p>
            )}
          </div>
        </div>

        {/* Order details card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">目前狀態</span>
            <span
              className={`text-sm px-3 py-1 rounded-full font-medium ${statusColor}`}
            >
              {order.statusLabel || "狀態待確認"}
            </span>
          </div>

          <div className="px-5 py-4 space-y-3">
            <InfoRow
              label="取貨方式"
              value={order.pickupMethod || "待確認（系統尚未回傳取貨方式）"}
            />
            <InfoRow label="下單時間" value={formatDate(order.createdAt)} />
          </div>
        </div>

        {/* Shipment info card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mt-3">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground">
              物流資訊
            </h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {order.trackingCode ? (
              <>
                <InfoRow
                  label="物流商"
                  value={
                    order.trackingProviderLabel ??
                    order.trackingProvider ??
                    "待確認（系統尚未回傳物流商）"
                  }
                />
                <InfoRow label="物流貨號" value={order.trackingCode} />
                {order.latestTrackingStatusLabel ? (
                  <InfoRow
                    label="最新貨態"
                    value={order.latestTrackingStatusLabel}
                  />
                ) : (
                  <InfoRow
                    label="最新貨態"
                    value="待確認（物流商尚未回傳最新貨態）"
                  />
                )}
                <InfoRow
                  label="貨態時間"
                  value={formatDate(
                    order.latestTrackingTime ?? order.shipmentUpdatedAt,
                  )}
                />
                {(order.latestTrackingStatus === "exception" ||
                  order.latestTrackingStatus === "unknown" ||
                  order.latestTrackingStatus === "returned") && (
                  <p className="text-xs text-accent leading-relaxed">
                    物流資料需要店家確認，請稍後再查看，或聯絡店家。
                  </p>
                )}
              </>
            ) : isSelfPickup(order.pickupMethod) ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                此訂單為面交 /
                自取，不會有物流貨態。取貨地點請見下方資訊，實際時間與地點請依店家通知為準。
              </p>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                物流追蹤碼待確認：店家正在處理訂單，目前尚未建立物流資料。出貨後這裡會更新物流資訊。
              </p>
            )}
          </div>
        </div>

        {/* Pickup / recipient info card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mt-3">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground">
              取貨 / 收件資訊
            </h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <InfoRow
              label="取貨方式"
              value={order.pickupMethod || "待確認（系統尚未回傳取貨方式）"}
            />
            {/* CVS 門市名稱／地址不對外公開（public tracking 政策），僅顯示買家自己的收件資訊摘要 */}
            <InfoRow
              label="收件人"
              value={
                order.recipientNameMasked ?? "待確認（系統未回傳收件人摘要）"
              }
            />
            <InfoRow
              label="收件電話"
              value={
                order.recipientPhoneMasked ?? "待確認（系統未回傳電話摘要）"
              }
            />
            {/* 面交 / 自取：顯示地點摘要（public-safe），未填則請依店家通知 */}
            {isSelfPickup(order.pickupMethod) ? (
              <InfoRow
                label={
                  order.pickupMethod === "面交"
                    ? "面交地點"
                    : order.pickupMethod === "自取"
                      ? "自取地點"
                      : "取貨地點"
                }
                value={
                  order.recipientAddressMasked ??
                  "待確認（系統未回傳取貨地點，請依店家通知）"
                }
              />
            ) : (
              <InfoRow
                label="收件地址"
                value={
                  order.recipientAddressMasked ?? "待確認（系統未回傳地址摘要）"
                }
              />
            )}
          </div>
        </div>

        {canEditPaymentLast5 && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden mt-3">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-xs font-semibold text-muted-foreground">
                付款末五碼（選填）
              </h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <label htmlFor="payment-last5" className="sr-only">
                付款末五碼
              </label>
              <input
                id="payment-last5"
                type="text"
                inputMode="numeric"
                maxLength={5}
                pattern="[0-9]{5}"
                value={paymentLast5}
                onChange={(event) =>
                  setPaymentLast5(
                    event.target.value.replace(/\D/g, "").slice(0, 5),
                  )
                }
                placeholder="請填 5 位數字"
                className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={handleSavePaymentLast5}
                disabled={
                  savingPaymentLast5 ||
                  (paymentLast5.length > 0 && paymentLast5.length !== 5)
                }
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {savingPaymentLast5 ? "儲存中…" : "儲存付款末五碼"}
              </button>
              <p className="text-xs text-muted-foreground">
                僅供人工對帳，不會自動判定付款。
              </p>
              {paymentMessage && (
                <p
                  className="text-xs text-primary"
                  role="status"
                  aria-live="polite"
                >
                  {paymentMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Copy buttons */}
        <div className="mt-4 space-y-2">
          {order.trackingCode && (
            <button
              type="button"
              onClick={() => handleCopyTracking(order.trackingCode!)}
              className="w-full h-11 rounded-xl border border-border bg-card text-sm font-medium text-foreground"
            >
              {copiedTracking ? "已複製！" : "複製物流追蹤碼"}
            </button>
          )}
          {/* Copy public token (order query code, not logistics tracking code) */}
          <button
            type="button"
            onClick={() => handleCopyToken(order.publicToken)}
            className="w-full h-11 rounded-xl border border-border bg-card text-sm font-medium text-foreground"
          >
            {copiedToken ? "已複製！" : "複製訂單查詢碼"}
          </button>
          {copyError && (
            <p className="text-xs text-destructive" role="alert">
              複製未完成：{copyError}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
          物流狀態以物流商或門市實際通知為準。
        </p>
        {!isCancelled && (
          <p className="text-xs text-muted-foreground text-center mt-1 leading-relaxed">
            如有疑問，請聯繫商家。
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-foreground text-right ${bold ? "font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
