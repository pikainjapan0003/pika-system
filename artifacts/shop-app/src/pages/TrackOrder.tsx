import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicOrder } from "@workspace/api-client-react";
import { STATUS_COLORS, STATUS_STEPS, STATUS_LABELS } from "../lib/orderStatus";

interface Props {
  publicToken: string;
}

type StepStatus = typeof STATUS_STEPS[number];
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
    return { label: "已取消", className: "bg-gray-100 text-gray-600" };
  }
  switch (order.latestTrackingStatus) {
    case "delivered":
      return { label: "已送達", className: "bg-green-100 text-green-700" };
    case "picked_up":
      return { label: "已取貨", className: "bg-green-100 text-green-700" };
    case "arrived_store":
      return { label: "待取貨", className: "bg-blue-100 text-blue-700" };
    case "in_transit":
      return { label: "運送中", className: "bg-blue-100 text-blue-700" };
    case "pending":
      return { label: "已出貨", className: "bg-blue-100 text-blue-700" };
    case "returned":
    case "exception":
    case "unknown":
      return { label: "需店家確認", className: "bg-amber-100 text-amber-700" };
  }
  if (order.trackingCode) {
    return { label: "已出貨", className: "bg-blue-100 text-blue-700" };
  }
  return { label: "店家處理中", className: "bg-secondary text-muted-foreground" };
}

// 面交 / 自取同屬 self_pickup，文案與判斷需一致（同 printHelpers 的 fulfillment category 邏輯）
function isSelfPickup(pickupMethod?: string | null): boolean {
  const m = (pickupMethod ?? "").trim();
  if (m === "面交" || m === "自取" || m === "self_pickup") return true;
  // 涵蓋「面交 / 自取」等合併寫法
  return m.includes("面交") || m.includes("自取");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrackOrderPage({ publicToken }: Props) {
  const [, setLocation] = useLocation();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const { data: order, isLoading, error } = useGetPublicOrder(publicToken);

  const handleCopyToken = (text: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }).catch(() => {});
  };

  const handleCopyTracking = (text: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
    }).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    const is404 = (error as any)?.status === 404;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
        <div className="text-center">
          <div className="text-4xl mb-3">{is404 ? "🔍" : "😔"}</div>
          <h1 className="text-lg font-bold text-foreground">
            {is404 ? "找不到此訂單" : "查詢失敗"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {is404 ? "請確認訂單查詢碼是否正確" : "請稍後再試"}
          </p>
          <button
            onClick={() => setLocation("/track")}
            className="mt-5 text-sm text-primary font-medium"
          >
            ← 返回查詢入口
          </button>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const statusColor = STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8">
      <div className="max-w-sm mx-auto w-full">

        {/* Header */}
        <div className="flex items-center mb-5 gap-3">
          <button
            onClick={() => setLocation("/track")}
            className="text-sm text-muted-foreground"
          >
            ←
          </button>
          <div className="flex-1 text-center">
            {order.storeName && (
              <p className="text-xs text-muted-foreground mb-0.5">{order.storeName}</p>
            )}
            <h1 className="text-xl font-bold text-foreground">物流查詢</h1>
          </div>
          <div className="w-6" />
        </div>

        {/* Big status badge */}
        {(() => {
          const badge = getTrackingBadge(order);
          return (
            <div className="bg-white rounded-2xl border border-border px-5 py-4 mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">物流狀態</span>
              <span className={`text-sm px-3 py-1.5 rounded-full font-semibold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
          );
        })()}

        {/* Cancelled notice OR progress timeline */}
        {isCancelled ? (
          <div className="bg-destructive/5 rounded-2xl border border-destructive/20 px-5 py-4 mb-3">
            <p className="text-sm font-semibold text-destructive">此訂單已取消</p>
            <p className="text-xs text-muted-foreground mt-1">如有疑問，請聯繫商家。</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border mb-3 overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-xs font-semibold text-muted-foreground">訂單進度</h2>
            </div>
            <div className="px-5 py-4">
              {STATUS_STEPS.map((step, i) => {
                const state = getStepState(step, order.status);
                const isLast = i === STATUS_STEPS.length - 1;
                return (
                  <div key={step} className="flex gap-3 items-start">
                    {/* Circle + connector line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        state === "done"
                          ? "bg-green-100 text-green-700"
                          : state === "current"
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {state === "done" ? "✓" : ""}
                      </div>
                      {!isLast && (
                        <div className={`w-px h-5 mt-0.5 ${state === "done" ? "bg-green-200" : "bg-border"}`} />
                      )}
                    </div>

                    {/* Label + "目前" badge */}
                    <div className={`flex-1 flex items-center gap-2 ${isLast ? "pb-0" : "pb-3"}`}>
                      <span className={`text-sm ${
                        state === "done"
                          ? "text-green-700 font-medium"
                          : state === "current"
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                      }`}>
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

        {/* Order details card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">目前狀態</span>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusColor}`}>
              {order.statusLabel}
            </span>
          </div>

          <div className="px-5 py-4 space-y-3">
            {order.productName && (
              <InfoRow label="商品" value={order.productName} />
            )}
            <InfoRow label="數量" value={`x${order.quantity}`} />
            <InfoRow label="金額" value={`NT$ ${Number(order.totalPrice).toLocaleString()}`} bold />
            <InfoRow label="取貨方式" value={order.pickupMethod} />
            {order.specValues && Object.keys(order.specValues as object).length > 0 && (
              <InfoRow
                label="規格"
                value={Object.entries(order.specValues as object).map(([k, v]) => `${k}: ${v}`).join("、")}
              />
            )}
            <InfoRow label="下單時間" value={formatDate(order.createdAt)} />
          </div>
        </div>

        {/* Shipment info card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden mt-3">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground">物流資訊</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {order.trackingCode ? (
              <>
                {(order.trackingProviderLabel ?? order.trackingProvider) && (
                  <InfoRow label="物流商" value={order.trackingProviderLabel ?? order.trackingProvider!} />
                )}
                <InfoRow label="物流貨號" value={order.trackingCode} />
                {order.latestTrackingStatusLabel ? (
                  <InfoRow label="最新貨態" value={order.latestTrackingStatusLabel} />
                ) : (
                  <InfoRow label="最新貨態" value="等待物流商更新" />
                )}
                {(order.latestTrackingTime ?? order.shipmentUpdatedAt) && (
                  <InfoRow label="最後更新" value={formatDate((order.latestTrackingTime ?? order.shipmentUpdatedAt)!)} />
                )}
                {(order.latestTrackingStatus === "exception" || order.latestTrackingStatus === "unknown" || order.latestTrackingStatus === "returned") && (
                  <p className="text-xs text-amber-700 leading-relaxed">
                    物流資料需要店家確認，請稍後再查看，或聯絡店家。
                  </p>
                )}
              </>
            ) : isSelfPickup(order.pickupMethod) ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                此訂單為面交 / 自取，不會有物流貨態。取貨地點請見下方資訊，實際時間與地點請依店家通知為準。
              </p>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                店家正在處理訂單，目前尚未建立物流資料。出貨後這裡會更新物流資訊。
              </p>
            )}
          </div>
        </div>

        {/* Pickup / recipient info card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden mt-3">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground">取貨 / 收件資訊</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <InfoRow label="取貨方式" value={order.pickupMethod} />
            {order.cvsStoreName ? (
              <>
                <InfoRow label="門市名稱" value={order.cvsStoreName} />
                {order.cvsStoreAddress && (
                  <InfoRow label="門市地址" value={order.cvsStoreAddress} />
                )}
              </>
            ) : (
              <>
                {order.recipientNameMasked && (
                  <InfoRow label="收件人" value={order.recipientNameMasked} />
                )}
                {order.recipientPhoneMasked && (
                  <InfoRow label="收件電話" value={order.recipientPhoneMasked} />
                )}
                {/* 面交 / 自取：顯示地點摘要（public-safe），未填則請依店家通知 */}
                {isSelfPickup(order.pickupMethod) ? (
                  <InfoRow
                    label={order.pickupMethod === "面交" ? "面交地點" : order.pickupMethod === "自取" ? "自取地點" : "取貨地點"}
                    value={order.recipientAddressMasked ?? "請依店家通知為準"}
                  />
                ) : (
                  order.recipientAddressMasked && (
                    <InfoRow label="收件地址" value={order.recipientAddressMasked} />
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Copy buttons */}
        <div className="mt-4 space-y-2">
          {order.trackingCode && (
            <button
              onClick={() => handleCopyTracking(order.trackingCode!)}
              className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground"
            >
              {copiedTracking ? "已複製！" : "複製物流追蹤碼"}
            </button>
          )}
          {/* Copy public token (order query code, not logistics tracking code) */}
          <button
            onClick={() => handleCopyToken(order.publicToken)}
            className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground"
          >
            {copiedToken ? "已複製！" : "複製訂單查詢碼"}
          </button>
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

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-foreground text-right ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
