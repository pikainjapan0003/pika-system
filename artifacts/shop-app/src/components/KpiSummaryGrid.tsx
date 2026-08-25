import { useState } from "react";
import { KpiDetailSheet, type KpiDetail } from "./KpiDetailSheet";

export function KpiSummaryGrid({ cards }: { cards: KpiDetail[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = cards.find((card) => card.key === selectedKey) ?? null;

  return (
    <>
      <div
        className="grid max-w-[1280px] grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
        data-kpi-grid
      >
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setSelectedKey(card.key)}
            className="grid min-h-28 min-w-0 grid-rows-[auto_1fr_auto] rounded-[14px] border border-border bg-card p-4 text-left text-card-foreground transition-colors duration-200 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-muted motion-reduce:transition-none lg:max-w-80 lg:p-5"
            data-kpi={card.key}
            aria-label={`查看${card.label}明細`}
          >
            <span className="text-xs font-medium text-muted-foreground">
              {card.label}
            </span>
            <strong className="self-center break-words text-2xl font-bold leading-tight tabular-nums lining-nums text-foreground sm:text-[28px]">
              {card.value}
            </strong>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {card.comparison}
            </span>
          </button>
        ))}
      </div>

      <KpiDetailSheet
        detail={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      />
    </>
  );
}
