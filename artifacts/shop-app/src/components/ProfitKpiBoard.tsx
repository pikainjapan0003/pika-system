import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import {
  deriveKpiCards,
  type KpiCard,
  type OperatingSummary,
  type ProfitOutcome,
  type TripListItem,
} from "@/lib/tripProfitBoard";

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

export function ProfitKpiBoard({
  trips,
  selectedTripId,
  onSelectTrip,
  estimate,
  loading,
  error,
}: {
  trips: TripListItem[];
  selectedTripId: number | null;
  onSelectTrip: (id: number) => void;
  estimate: OperatingSummary | null;
  loading: boolean;
  error: string | null;
}) {
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

  const cards = deriveKpiCards(estimate);

  return (
    <section className="space-y-3" data-slot="profit-kpi-board">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            成本利潤 KPI（預估）
          </h2>
          <p className="text-xs text-muted-foreground">
            資料：operating-summary（ESTIMATE）＋ operating-inputs 既有欄位
          </p>
        </div>
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
      </div>
      {estimate?.estimateLocked ? (
        <p className="text-xs text-accent">此行程預估已鎖定。</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
