import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import type { ShippingListResponse, ShippingListOrder } from "@workspace/api-client-react";
import { printShippingList } from "../lib/printHelpers";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShippingListResponse | null;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "未付款",
  pending: "待確認",
  partially_paid: "部分付款",
  paid: "已付款",
  refunded: "已退款",
  failed: "付款失敗",
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
const SHIPPING_METHOD_LABELS: Record<string, string> = {
  self_pickup: "自取",
  convenience_store: "超商取貨",
  home_delivery: "宅配",
  other: "其他",
};

export function ShippingListDialog({ open, onClose, data }: Props) {
  if (!data) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="h-[88dvh] flex flex-col p-0 max-w-[480px] mx-auto rounded-t-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <SheetTitle className="text-base font-bold">出貨單</SheetTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.orderCount} 筆訂單
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printShippingList(data)}
              className="h-7 px-2.5 text-xs font-medium rounded-lg border border-border bg-white text-foreground hover:bg-secondary/50"
            >
              列印
            </button>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="關閉"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </SheetClose>
          </div>
        </div>

        {/* Excluded warning */}
        {data.excludedOrderIds.length > 0 && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
            <p className="text-xs text-amber-700">
              已排除 {data.excludedOrderIds.length} 筆已取消訂單
              （ID: {data.excludedOrderIds.join("、")}）
            </p>
          </div>
        )}

        {/* Order list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {data.orders.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-sm text-muted-foreground">無出貨資料</p>
            </div>
          ) : (
            data.orders.map((order) => <ShippingOrderCard key={order.orderId} order={order} />)
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 border-t border-border bg-secondary/30">
          <p className="text-[10px] text-muted-foreground/60">
            產生時間: {new Date(data.generatedAt).toLocaleString("zh-TW")}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ShippingOrderCard({ order }: { order: ShippingListOrder }) {
  return (
    <div className="bg-white rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
      {/* Order number + status */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-bold text-primary">#{order.orderNumber}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
          {order.status}
        </span>
      </div>

      {/* Buyer */}
      <Row label="買家" value={order.buyerName} />
      <Row label="電話" value={order.buyerPhone} />

      {/* Product */}
      {order.productName && <Row label="商品" value={order.productName} />}
      {order.specValues && Object.keys(order.specValues).length > 0 && (
        <Row
          label="規格"
          value={Object.entries(order.specValues).map(([k, v]) => `${k}: ${v}`).join("、")}
        />
      )}
      <Row label="數量" value={`× ${order.quantity}`} />

      {/* Payment */}
      <Row label="付款狀態" value={PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus} />

      {/* Shipping */}
      <Row label="出貨狀態" value={SHIPPING_STATUS_LABELS[order.shippingStatus] ?? order.shippingStatus} />
      {order.shippingMethod && (
        <Row label="物流方式" value={SHIPPING_METHOD_LABELS[order.shippingMethod] ?? order.shippingMethod} />
      )}
      {order.trackingCode && <Row label="追蹤碼" value={order.trackingCode} />}
      {order.trackingProvider && <Row label="物流商" value={order.trackingProvider} />}

      {/* CVS */}
      {order.storeCode && <Row label="超商店號" value={order.storeCode} />}
      {order.storeName && <Row label="超商店名" value={order.storeName} />}

      {/* Recipient */}
      {order.recipientName && <Row label="收件人" value={order.recipientName} />}
      {order.recipientPhone && <Row label="收件電話" value={order.recipientPhone} />}
      {order.recipientAddress && <Row label="收件地址" value={order.recipientAddress} />}

      {/* Notes */}
      {order.shippingNote && <Row label="物流備註" value={order.shippingNote} />}

      {/* Items text */}
      <div className="px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground/70 break-all leading-relaxed">{order.itemsText}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between px-3 py-2 gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-foreground text-right break-all">{value}</span>
    </div>
  );
}
