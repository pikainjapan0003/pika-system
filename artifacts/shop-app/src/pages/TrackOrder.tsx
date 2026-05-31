import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicOrder } from "@workspace/api-client-react";
import { STATUS_COLORS } from "../lib/orderStatus";

interface Props {
  publicToken: string;
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
            {is404 ? "請確認追蹤碼是否正確" : "請稍後再試"}
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

  const statusColor = STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600";
  const statusLabel = order.statusLabel;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="max-w-sm w-full">
        <div className="flex items-center mb-6 gap-3">
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

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">目前狀態</span>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusColor}`}>
              {statusLabel}
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

        <div className="mt-4 space-y-2">
          <button
            onClick={() => handleCopy(order.publicToken)}
            className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground"
          >
            {copied ? "已複製！" : "複製追蹤碼"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
          如有疑問，請聯繫商家。
        </p>
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
