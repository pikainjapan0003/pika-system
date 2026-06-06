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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrackOrderPage({ publicToken }: Props) {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const { data: order, isLoading, error } = useGetPublicOrder(publicToken);

  const handleCopy = (token: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
            <h1 className="text-xl font-bold text-foreground">訂單追蹤</h1>
          </div>
          <div className="w-6" />
        </div>

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

        {/* Copy public token (order query code) */}
        <div className="mt-4">
          <button
            onClick={() => handleCopy(order.publicToken)}
            className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground"
          >
            {copied ? "已複製！" : "複製訂單查詢碼"}
          </button>
        </div>

        {!isCancelled && (
          <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
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
