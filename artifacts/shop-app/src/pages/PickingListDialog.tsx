import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PickingListResponse } from "@workspace/api-client-react";
import { printPickingList } from "../lib/printHelpers";
import {
  PickingCheckSections,
  type PickingCheckItem,
} from "../lib/PickingCheckSections";

interface Props {
  open: boolean;
  onClose: () => void;
  data: PickingListResponse | null;
}

const STORAGE_TEMP_LABELS: Record<string, string> = {
  room_temp: "常溫",
  refrigerated: "冷藏",
  frozen: "冷凍",
};

export function PickingListDialog({ open, onClose, data }: Props) {
  const { getToken } = useAuth();
  const responseWithChecks = data as
    | (PickingListResponse & { orderItems?: PickingCheckItem[] })
    | null;
  const [orderItems, setOrderItems] = useState<PickingCheckItem[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    setOrderItems(responseWithChecks?.orderItems ?? []);
    setPendingKey(null);
    setToggleError(null);
  }, [responseWithChecks]);

  if (!data) return null;

  async function handleToggle(item: PickingCheckItem) {
    const key = `${item.orderId}:${item.itemKey}`;
    setPendingKey(key);
    setToggleError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/orders/${item.orderId}/picking-check`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            itemKey: item.itemKey,
            checked: !item.checked,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "更新包貨進度失敗");
      }
      setOrderItems((current) =>
        current.map((candidate) =>
          candidate.orderId === item.orderId &&
          candidate.itemKey === item.itemKey
            ? {
                ...candidate,
                checked: body.checked,
                checkedAt: body.checkedAt,
              }
            : candidate,
        ),
      );
    } catch (error) {
      setToggleError((error as Error).message);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-[88dvh] flex flex-col p-0 max-w-[480px] mx-auto rounded-t-2xl overflow-hidden [&>button:first-child]:hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <SheetTitle className="text-base font-bold">撿貨單</SheetTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.orderCount} 筆訂單 · {data.items.length} 項商品組合
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printPickingList(data)}
              className="min-h-11 px-3 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-secondary/50"
            >
              列印
            </button>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="關閉"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground active:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </SheetClose>
          </div>
        </div>

        {/* Excluded warning */}
        {data.excludedOrderIds.length > 0 && (
          <div className="px-4 py-2.5 bg-accent/10 border-b border-accent/30 shrink-0">
            <p className="text-xs text-accent">
              已排除 {data.excludedOrderIds.length} 筆已取消訂單 （ID:{" "}
              {data.excludedOrderIds.join("、")}）
            </p>
          </div>
        )}

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {toggleError && (
            <p role="alert" className="text-xs text-destructive">
              {toggleError}
            </p>
          )}
          {orderItems.length > 0 ? (
            <PickingCheckSections
              items={orderItems}
              pendingKey={pendingKey}
              onToggle={(item) => void handleToggle(item)}
            />
          ) : null}
          {orderItems.length === 0 &&
            (data.items.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-sm text-muted-foreground">無商品資料</p>
              </div>
            ) : (
              data.items.map((item, i) => (
                <div
                  key={`${item.productId}-${item.skuCode ?? i}`}
                  className="bg-card rounded-xl border border-border/60 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground leading-tight">
                        {item.productName}
                      </div>
                      {item.specLabel && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.specLabel}
                        </div>
                      )}
                      {item.skuCode && (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                          SKU: {item.skuCode}
                        </div>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-primary shrink-0">
                      ×{item.quantityTotal}
                    </div>
                  </div>

                  {(item.storageTemp || item.shelfLife) && (
                    <div className="flex gap-3 mb-1.5">
                      {item.storageTemp && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-chart-4/10 text-chart-4 font-medium">
                          {STORAGE_TEMP_LABELS[item.storageTemp] ??
                            item.storageTemp}
                        </span>
                      )}
                      {item.shelfLife && (
                        <span className="text-[11px] text-muted-foreground">
                          效期: {item.shelfLife}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground/70 border-t border-border/40 pt-1.5 mt-1.5">
                    訂單: {item.orderNumbers.join("、")}
                  </div>

                  {item.notes && (
                    <div className="text-xs text-muted-foreground mt-1 italic">
                      備註: {item.notes}
                    </div>
                  )}
                </div>
              ))
            ))}
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
