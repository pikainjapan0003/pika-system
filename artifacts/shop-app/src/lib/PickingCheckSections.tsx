export interface PickingCheckItem {
  orderId: number;
  itemKey: string;
  productName: string;
  specLabel: string | null;
  quantity: number;
  checked: boolean;
  checkedAt: string | null;
  readOnly: boolean;
}

interface Props {
  items: PickingCheckItem[];
  pendingKey: string | null;
  onToggle: (item: PickingCheckItem) => void;
}

function ItemCard({
  item,
  pending,
  onToggle,
}: {
  item: PickingCheckItem;
  pending: boolean;
  onToggle: (item: PickingCheckItem) => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        item.checked
          ? "border-chart-3/30 bg-chart-3/10"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`${item.checked ? "取消已包" : "標記已包"}：${item.productName}`}
          aria-pressed={item.checked}
          disabled={item.readOnly || pending}
          onClick={() => onToggle(item)}
          className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-bold ${
            item.checked
              ? "border-chart-3 bg-chart-3 text-primary-foreground"
              : "border-border bg-background text-muted-foreground"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {item.checked ? "✓" : "○"}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {item.productName}
          </p>
          {item.specLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.specLabel}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            訂單 #{item.orderId} · 數量 {item.quantity}
          </p>
          {item.readOnly && (
            <p className="mt-1 text-[11px] font-medium text-accent">
              已出貨，勾選紀錄僅供查看
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PickingCheckSections({ items, pendingKey, onToggle }: Props) {
  const unchecked = items.filter((item) => !item.checked);
  const checked = items.filter((item) => item.checked);

  return (
    <div className="space-y-5">
      <section aria-labelledby="picking-unchecked-heading">
        <h3
          id="picking-unchecked-heading"
          className="mb-2 text-sm font-bold text-foreground"
        >
          未包（{unchecked.length}）
        </h3>
        <div className="space-y-2">
          {unchecked.length === 0 ? (
            <p className="rounded-xl bg-secondary px-3 py-4 text-center text-sm text-secondary-foreground">
              這批商品都已包好
            </p>
          ) : (
            unchecked.map((item) => (
              <ItemCard
                key={`${item.orderId}:${item.itemKey}`}
                item={item}
                pending={pendingKey === `${item.orderId}:${item.itemKey}`}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="picking-checked-heading">
        <h3
          id="picking-checked-heading"
          className="mb-2 text-sm font-bold text-foreground"
        >
          已包（{checked.length}）
        </h3>
        <div className="space-y-2">
          {checked.length === 0 ? (
            <p className="rounded-xl bg-secondary/50 px-3 py-4 text-center text-xs text-muted-foreground">
              尚無已包品項
            </p>
          ) : (
            checked.map((item) => (
              <ItemCard
                key={`${item.orderId}:${item.itemKey}`}
                item={item}
                pending={pendingKey === `${item.orderId}:${item.itemKey}`}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
