import { useEffect, useRef, useState } from "react";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import {
  deriveKpiCards,
  type ComparisonRow,
  type KpiCard,
  type OperatingSummary,
  type ProfitOutcome,
  type TripListItem,
} from "@/lib/tripProfitBoard";
import { loadMotion, motionEnabled, PIKA_EASE } from "@/lib/motion";

const OUTCOME_SURFACE: Record<ProfitOutcome, string> = {
  SALARY_TARGET_MET: "border-chart-3/30 bg-chart-3/10",
  PROFIT_BELOW_SALARY_TARGET: "border-accent/30 bg-accent/10",
  LOSS: "border-destructive/30 bg-destructive/10",
};

const OUTCOME_TEXT_COLOR: Record<ProfitOutcome, string> = {
  SALARY_TARGET_MET: "text-chart-3",
  PROFIT_BELOW_SALARY_TARGET: "text-accent",
  LOSS: "text-destructive",
};

/** K7 三態：預估／實際／對比（DESIGN.md K7：文字與符號一起更新）。 */
type KpiMode = "estimate" | "actual" | "compare";

const MODE_LABELS: Array<{ value: KpiMode; label: string }> = [
  { value: "estimate", label: "預估" },
  { value: "actual", label: "實際" },
  { value: "compare", label: "對比" },
];

function directionSymbol(direction: string | undefined): string {
  if (direction === "favorable") return "▲";
  if (direction === "unfavorable") return "▼";
  return "◆";
}

export function ProfitKpiBoard({
  trips,
  selectedTripId,
  onSelectTrip,
  estimate,
  actual,
  comparisonRows,
  loading,
  error,
}: {
  trips: TripListItem[];
  selectedTripId: number | null;
  onSelectTrip: (id: number) => void;
  estimate: OperatingSummary | null;
  actual: OperatingSummary | null;
  comparisonRows: ComparisonRow[];
  loading: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<KpiMode>("estimate");
  const gridRef = useRef<HTMLDivElement>(null);
  const prevEstimateRef = useRef<OperatingSummary | null>(null);

  // K6｜進場／真實更新交錯：只對同一組最多 5 張做（13 張全交錯＝違規）。
  // 紅線 1：數字先出現再動 —— React 首幀即渲染完整值（直接可讀），
  // 動效只做很短的 transform 坐定（160ms，間隔 35ms），
  // reduced-motion 或 jsdom 完全不播。
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !motionEnabled()) return;
    const prev = prevEstimateRef.current;
    prevEstimateRef.current = estimate;
    if (estimate == null || estimate === prev) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-kpi]"));
    if (cards.length === 0) return;
    const firstFive = cards.slice(0, 5);
    void loadMotion().then(({ gsap }) => {
      if (!gsap) return;
      // ⛔ 紅線 1：數字「先出現，再動」→ 不碰 opacity（首幀 100% 可讀），
      // 只做很短的位置坐定（≤200ms 完成，GPU-only）。
      gsap.fromTo(
        firstFive,
        { y: 6, opacity: 1 },
        {
          y: 0,
          opacity: 1,
          duration: 0.16,
          ease: PIKA_EASE.uiOut,
          stagger: 0.035,
        },
      );
    });
  }, [estimate]);

  if (!loading && trips.length === 0) {
    return (
      <SemanticStatePanel
        state={{
          kind: "empty",
          title: "尚無行程",
          reason: "請先建立行程並填入預估輸入，再查看成本利潤 KPI 與圖表。",
        }}
      />
    );
  }
  if (selectedTripId == null && !loading) {
    return (
      <SemanticStatePanel
        state={{
          kind: "empty",
          title: "請選擇行程",
          reason: "尚未選定行程，無法計算成本利潤 KPI。",
        }}
      />
    );
  }
  if (loading && estimate == null) {
    return (
      <SemanticStatePanel
        state={{
          kind: "loading",
          label: "載入成本利潤資料",
          fallbackMessage: "正在讀取行程預估與實際資料，請稍候。",
        }}
      />
    );
  }
  if (error && estimate == null) {
    return (
      <SemanticStatePanel
        state={{ kind: "inlineError", title: "無法載入 KPI", message: error }}
      />
    );
  }

  // K7 對比卡：位置連續、文字與符號一起更新（C 類語意色＋▲▼◆ 雙編碼）。
  const compareCards: KpiCard[] = comparisonRows.map((row) => ({
    key: row.key ?? row.label ?? "compare-row",
    label: row.label ?? "比較項目",
    value:
      row.variance?.direction != null
        ? `${directionSymbol(row.variance.direction)} ${row.variance.difference ?? "—"}`
        : (row.state ?? "待確認"),
    meta: [
      row.estimatedTwd == null ? "預估待確認" : `預估 NT$${row.estimatedTwd}`,
      row.actualTwd == null ? "實際待確認" : `實際 NT$${row.actualTwd}`,
    ].join(" · "),
    state:
      row.variance?.direction === "unfavorable"
        ? "LOSS"
        : row.variance?.direction === "favorable"
          ? "SALARY_TARGET_MET"
          : undefined,
  }));

  const cards =
    mode === "actual"
      ? deriveKpiCards(actual)
      : mode === "compare"
        ? compareCards
        : deriveKpiCards(estimate);

  const switchMode = (next: KpiMode) => {
    if (next === mode || !gridRef.current) {
      setMode(next);
      return;
    }
    if (!motionEnabled()) {
      setMode(next);
      return;
    }
    // K7｜Flip：保持元素位置連續，文字與符號一起更新
    const targets = gridRef.current.querySelectorAll("[data-kpi]");
    const prevState = gridRef.current;
    void loadMotion().then(({ Flip, gsap }) => {
      if (!Flip || !gsap) return;
      const state = Flip.getState(targets);
      setMode(next);
      requestAnimationFrame(() => {
        Flip.from(state, {
          duration: 0.24,
          ease: PIKA_EASE.inOut,
          absolute: true,
          scale: true,
          onComplete: () => {
            const nodes = prevState.querySelectorAll("[data-kpi]");
            if (nodes) gsap.set(nodes, { clearProps: "transform" });
          },
        });
      });
    });
  };

  return (
    <section className="space-y-3" data-slot="profit-kpi-board">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            成本利潤 KPI（{MODE_LABELS.find((m) => m.value === mode)?.label}）
          </h2>
          <p className="text-xs text-muted-foreground">
            資料：operating-summary（ESTIMATE／ACTUAL）＋ fixed-cost-comparison
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-0.5">
          {MODE_LABELS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => switchMode(option.value)}
              aria-pressed={mode === option.value}
              className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                mode === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <select
          aria-label="選擇行程"
          value={selectedTripId ?? ""}
          onChange={(event) => onSelectTrip(Number(event.target.value))}
          className="h-10 max-w-[180px] rounded-xl border border-input bg-background px-2 text-sm text-foreground"
        >
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
        {estimate?.estimateLocked ? (
          <p className="text-xs text-accent">此行程預估已鎖定。</p>
        ) : null}
      </div>
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        data-kpi-grid
      >
        {cards.map((card) => (
          <KpiCardView key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

function KpiCardView({ card }: { card: KpiCard }) {
  const outcomeSurface = card.state ? OUTCOME_SURFACE[card.state] : "";
  const outcomeColor = card.state ? OUTCOME_TEXT_COLOR[card.state] : "";
  return (
    <div
      className={`min-w-0 rounded-2xl border border-border bg-card p-3 ${outcomeSurface}`}
      data-kpi={card.key}
    >
      <p className="text-xs text-muted-foreground">{card.label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums lining-nums ${card.state ? outcomeColor : "text-foreground"}`}
      >
        {card.value}
      </p>
      {card.meta ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {card.meta}
        </p>
      ) : null}
    </div>
  );
}
