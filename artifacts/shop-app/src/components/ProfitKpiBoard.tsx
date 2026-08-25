import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AnalysisTabs, type AnalysisCategory } from "./AnalysisTabs";
import { GoalAchievementCard } from "./GoalAchievementCard";
import { type KpiDetail } from "./KpiDetailSheet";
import { KpiSummaryGrid } from "./KpiSummaryGrid";
import { ModeSegment, type KpiMode } from "./ModeSegment";
import { SemanticStatePanel } from "./SemanticStatePanel";
import { SonarBackground } from "./SonarBackground";
import { TripSelector } from "./TripSelector";
import { formatApiTwd } from "@/lib/operatingCostDisplay";
import {
  deriveKpiCards,
  OUTCOME_TEXT,
  type ComparisonRow,
  type KpiCard,
  type OperatingSummary,
  type ProfitOutcome,
  type TripListItem,
} from "@/lib/tripProfitBoard";
import { motionEnabled } from "@/lib/motion";

const PENDING = "待確認";

const MODE_LABEL: Record<KpiMode, string> = {
  estimate: "預估",
  actual: "實際",
  difference: "差異",
};

const CATEGORY_COPY: Record<
  AnalysisCategory,
  { title: string; description: string }
> = {
  overview: {
    title: "概覽｜目標是否達成",
    description: "薪資目標與達標狀態合併呈現，件數退為次要數字。",
  },
  profit: {
    title: "損益｜收入如何轉成利潤",
    description: "先看銷售總額，再核對營業毛利、毛利率與單件毛利。",
  },
  cost: {
    title: "成本｜支出集中在哪裡",
    description: "核對各項成本金額；占比與排序資料不足時維持待確認。",
  },
  trend: {
    title: "趨勢｜效率是否持續改善",
    description: "預設只顯示一張主圖，並保留行程比較與每日毛利。",
  },
};

function cardMap(summary: OperatingSummary | null): Map<string, KpiCard> {
  return new Map(deriveKpiCards(summary).map((card) => [card.key, card]));
}

function cardValue(cards: Map<string, KpiCard>, key: string): string {
  return cards.get(key)?.value ?? PENDING;
}

function coreKpis(
  summary: OperatingSummary | null,
  mode: KpiMode,
): KpiDetail[] {
  const cards = cardMap(summary);
  const modeLabel = MODE_LABEL[mode];
  const unavailableDifference = mode === "difference";
  const value = (key: string) =>
    unavailableDifference ? PENDING : cardValue(cards, key);
  const comparisonStatus = unavailableDifference
    ? `差異比較 · ${PENDING}`
    : `跨模式比較 · ${PENDING}`;

  return [
    {
      key: "finalProfit",
      label: "最終淨利",
      value: value("finalProfit"),
      comparison: comparisonStatus,
      formula: "後端既有 finalOperatingProfitTwd；前端不重算",
      source: "operating-summary → projections.unit.finalOperatingProfitTwd",
      scope: "所選行程的 UNIT 投影",
      updatedAt: "資料來源未提供更新時間",
      mode: modeLabel,
    },
    {
      key: "netProfitRate",
      label: "淨利率",
      value: PENDING,
      comparison: comparisonStatus,
      formula: "依既有後端財務公式；前端不以淨利 ÷ 收入重算",
      source: "operating-summary（待後端提供淨利率欄位）",
      scope: "所選行程",
      updatedAt: "資料來源未提供更新時間",
      mode: modeLabel,
    },
    {
      key: "adjustedRevenue",
      label: "調整後收入",
      value: value("adjustedRevenue"),
      comparison: comparisonStatus,
      formula: "後端既有 adjustedRevenueTwd；前端不重算",
      source: "operating-summary → projections.unit.adjustedRevenueTwd",
      scope: "所選行程的 UNIT 投影",
      updatedAt: "資料來源未提供更新時間",
      mode: modeLabel,
    },
    {
      key: "totalCost",
      label: "總成本",
      value: PENDING,
      comparison: comparisonStatus,
      formula: "依既有後端成本合計；前端不加總各成本欄位",
      source: "operating-summary（待後端提供總成本欄位）",
      scope: "所選行程的固定、變動與商品成本",
      updatedAt: "資料來源未提供更新時間",
      mode: modeLabel,
    },
  ];
}

function variancePresentation(row: ComparisonRow) {
  const direction = row.variance?.direction;
  if (direction === "favorable") {
    return { symbol: "▲", label: "有利", className: "text-chart-3" };
  }
  if (direction === "unfavorable") {
    return { symbol: "▼", label: "不利", className: "text-destructive" };
  }
  if (direction === "neutral") {
    return { symbol: "◆", label: "持平", className: "text-foreground" };
  }
  return { symbol: "◆", label: PENDING, className: "text-muted-foreground" };
}

function varianceSignPrefix(row: ComparisonRow): string {
  const rawDifference = row.variance?.difference?.trim();
  const direction = row.variance?.direction;
  if (
    !rawDifference ||
    direction == null ||
    direction === "neutral" ||
    rawDifference.startsWith("+") ||
    rawDifference.startsWith("-")
  ) {
    return "";
  }
  return "+";
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
  presentation = "compact",
  initialCategory = "overview",
  monthlyTrendContent,
}: {
  trips: TripListItem[];
  selectedTripId: number | null;
  onSelectTrip: (id: number) => void;
  estimate: OperatingSummary | null;
  actual: OperatingSummary | null;
  comparisonRows: ComparisonRow[];
  loading: boolean;
  error: string | null;
  presentation?: "compact" | "full";
  initialCategory?: AnalysisCategory;
  monthlyTrendContent?: ReactNode;
}) {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<KpiMode>("estimate");
  const [visibleMode, setVisibleMode] = useState<KpiMode>("estimate");
  const [category, setCategory] = useState<AnalysisCategory>(initialCategory);
  const [visibleCategory, setVisibleCategory] =
    useState<AnalysisCategory>(initialCategory);
  const [modeSwitching, setModeSwitching] = useState(false);
  const [categorySwitching, setCategorySwitching] = useState(false);
  const modeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeFrameRef = useRef<number | null>(null);
  const categoryFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
      if (categoryTimerRef.current) clearTimeout(categoryTimerRef.current);
      if (modeFrameRef.current) cancelAnimationFrame(modeFrameRef.current);
      if (categoryFrameRef.current)
        cancelAnimationFrame(categoryFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (categoryTimerRef.current) clearTimeout(categoryTimerRef.current);
    if (categoryFrameRef.current)
      cancelAnimationFrame(categoryFrameRef.current);
    setCategorySwitching(false);
    setCategory(initialCategory);
    setVisibleCategory(initialCategory);
  }, [initialCategory]);

  const handleModeChange = (next: KpiMode) => {
    if (next === mode) return;
    setMode(next);
    if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
    if (modeFrameRef.current) cancelAnimationFrame(modeFrameRef.current);
    if (!motionEnabled()) {
      setModeSwitching(false);
      setVisibleMode(next);
      return;
    }
    setModeSwitching(true);
    modeTimerRef.current = setTimeout(() => {
      setVisibleMode(next);
      modeFrameRef.current = requestAnimationFrame(() => {
        setModeSwitching(false);
        modeFrameRef.current = null;
      });
    }, 100);
  };

  const handleCategoryChange = (next: AnalysisCategory) => {
    if (next === category) return;
    setCategory(next);
    if (categoryTimerRef.current) clearTimeout(categoryTimerRef.current);
    if (categoryFrameRef.current)
      cancelAnimationFrame(categoryFrameRef.current);
    if (!motionEnabled()) {
      setCategorySwitching(false);
      setVisibleCategory(next);
      return;
    }
    setCategorySwitching(true);
    categoryTimerRef.current = setTimeout(() => {
      setVisibleCategory(next);
      categoryFrameRef.current = requestAnimationFrame(() => {
        setCategorySwitching(false);
        categoryFrameRef.current = null;
      });
    }, 100);
  };

  let tripStatePanel: ReactNode = null;
  if (!loading && trips.length === 0) {
    tripStatePanel = (
      <SemanticStatePanel
        state={{
          kind: "empty",
          title: "尚無行程",
          reason: "請先建立行程並填入預估輸入，再查看成本利潤 KPI 與圖表。",
        }}
      />
    );
  } else if (selectedTripId == null && !loading) {
    tripStatePanel = (
      <SemanticStatePanel
        state={{
          kind: "empty",
          title: "請選擇行程",
          reason: "尚未選定行程，無法顯示成本利潤 KPI。",
        }}
      />
    );
  } else if (loading && estimate == null) {
    tripStatePanel = (
      <SemanticStatePanel
        state={{
          kind: "loading",
          label: "載入成本利潤資料",
          fallbackMessage: "正在讀取行程預估與實際資料，請稍候。",
        }}
      />
    );
  } else if (error && estimate == null) {
    tripStatePanel = (
      <SemanticStatePanel
        state={{ kind: "inlineError", title: "無法載入 KPI", message: error }}
      />
    );
  }

  if (presentation === "compact") {
    if (tripStatePanel) return tripStatePanel;

    const compactCards = cardMap(estimate);
    const compactProjection = estimate?.tripProfit.projections.unit;
    const compactOutcome =
      compactProjection?.status === "ready"
        ? compactProjection.outcome
        : undefined;

    return (
      <section
        className="rounded-[16px] border border-border bg-card p-4 sm:p-5"
        data-slot="profit-kpi-board-compact"
        aria-labelledby="profit-kpi-compact-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id="profit-kpi-compact-title"
              className="text-base font-semibold"
            >
              暫估淨利與目標達成
            </h2>
            <strong className="mt-3 block text-2xl font-bold tabular-nums lining-nums sm:text-[28px]">
              {cardValue(compactCards, "finalProfit")}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactOutcome ? OUTCOME_TEXT[compactOutcome] : PENDING}
              {" · "}系統計算結果
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocation("/reports/monthly-profit?view=kpi")}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-primary/80 motion-reduce:transition-none"
          >
            開啟 KPI 分析室
          </button>
        </div>
      </section>
    );
  }

  const selectedSummary =
    visibleMode === "estimate"
      ? estimate
      : visibleMode === "actual"
        ? actual
        : null;
  const selectedCards = cardMap(selectedSummary);
  const projection = selectedSummary?.tripProfit.projections.unit;
  const outcome: ProfitOutcome | undefined =
    projection?.status === "ready" ? projection.outcome : undefined;
  const coreCards = coreKpis(selectedSummary, visibleMode);
  const modeTransitionClass = modeSwitching
    ? "opacity-0 translate-y-1"
    : "opacity-100 translate-y-0";
  const analysisTransitionClass =
    modeSwitching || categorySwitching
      ? "opacity-0 translate-y-1"
      : "opacity-100 translate-y-0";

  return (
    <section
      className="space-y-8 pb-4"
      data-slot="profit-kpi-board"
      aria-label="KPI 分析室"
    >
      <div className="grid items-center gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <SonarBackground />

        <section className="rounded-[16px] border border-border bg-card p-4 sm:p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-foreground sm:text-[22px]">
              KPI 分析室
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              回答「為什麼賺或虧」，資料缺口維持待確認。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TripSelector
              trips={trips}
              selectedTripId={selectedTripId}
              onSelectTrip={onSelectTrip}
            />
            <div className="grid content-start gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">最後更新</span>
              <span className="flex min-h-11 items-center rounded-xl border border-border bg-background px-3 text-sm text-foreground">
                資料來源未提供更新時間
              </span>
            </div>
          </div>
          <div className="mt-4">
            <ModeSegment value={mode} onChange={handleModeChange} />
          </div>
          {estimate?.estimateLocked ? (
            <p className="mt-3 text-xs font-medium text-accent">
              預估已鎖定｜數值仍可查看。
            </p>
          ) : null}
        </section>
      </div>

      {tripStatePanel}

      {!tripStatePanel ? (
        <section aria-labelledby="core-kpi-title">
          <div className="mb-4">
            <h2 id="core-kpi-title" className="text-lg font-semibold">
              四張核心 KPI
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              名稱、主數字、比較三層；點擊卡片查看五欄明細。
            </p>
          </div>
          <div
            className={`transition-[opacity,transform] duration-100 ease-out motion-reduce:transition-none ${modeTransitionClass}`}
          >
            <KpiSummaryGrid cards={coreCards} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="kpi-category-title">
        <AnalysisTabs value={category} onChange={handleCategoryChange}>
          <div
            className={`transition-[opacity,transform] duration-100 ease-out motion-reduce:transition-none ${analysisTransitionClass}`}
          >
            <div className="mb-4">
              <h2 id="kpi-category-title" className="text-lg font-semibold">
                {CATEGORY_COPY[visibleCategory].title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {CATEGORY_COPY[visibleCategory].description}
              </p>
            </div>

            {!tripStatePanel && visibleCategory === "overview" ? (
              <OverviewPanel
                outcome={outcome}
                current={cardValue(selectedCards, "finalProfit")}
                target={cardValue(selectedCards, "salaryTarget")}
                itemQuantity={cardValue(selectedCards, "itemQuantity")}
              />
            ) : null}
            {!tripStatePanel && visibleCategory === "profit" ? (
              <ProfitPanel
                cards={selectedCards}
                comparisonRows={comparisonRows}
                mode={visibleMode}
              />
            ) : null}
            {!tripStatePanel && visibleCategory === "cost" ? (
              <CostPanel cards={selectedCards} />
            ) : null}
            {visibleCategory === "trend" ? (
              <TrendPanel monthlyTrendContent={monthlyTrendContent} />
            ) : null}
          </div>
        </AnalysisTabs>
      </section>
    </section>
  );
}

function SecondaryNumbers({
  items,
}: {
  items: Array<{ label: string; value: string; meta?: string }>;
}) {
  return (
    <dl className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="min-h-14 px-3 py-2 first:pl-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums lining-nums text-foreground">
            {item.value}
          </dd>
          {item.meta ? (
            <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function OverviewPanel({
  outcome,
  current,
  target,
  itemQuantity,
}: {
  outcome?: ProfitOutcome;
  current: string;
  target: string;
  itemQuantity: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <GoalAchievementCard
        outcome={outcome}
        current={current}
        target={target}
      />
      <section>
        <h3 className="text-sm font-semibold">行程規模</h3>
        <div className="mt-3">
          <SecondaryNumbers
            items={[{ label: "商品總件數", value: itemQuantity }]}
          />
        </div>
      </section>
    </div>
  );
}

function ProfitPanel({
  cards,
  comparisonRows,
  mode,
}: {
  cards: Map<string, KpiCard>;
  comparisonRows: ComparisonRow[];
  mode: KpiMode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-h-28 max-w-80 rounded-[14px] border border-border bg-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground">銷售總額</h3>
        <strong className="mt-3 block text-2xl font-bold tabular-nums lining-nums sm:text-[28px]">
          {cardValue(cards, "sales")}
        </strong>
        <p className="mt-2 text-xs text-muted-foreground">
          尚未取得銷售總額，資料補齊後才會顯示。
        </p>
      </section>

      <div className="space-y-4">
        <SecondaryNumbers
          items={[
            { label: "營業毛利", value: cardValue(cards, "grossProfit") },
            { label: "毛利率", value: cardValue(cards, "grossMarginRate") },
            { label: "平均單件毛利", value: cardValue(cards, "unitProfit") },
          ]}
        />

        <section className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold">預估與實際差異</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "difference"
              ? "差異方向與數值皆採用系統計算結果。"
              : "有利或不利沿用系統結論，不以顏色自行推測。"}
          </p>
          {comparisonRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {comparisonRows.map((row, index) => {
                const presentation = variancePresentation(row);
                return (
                  <li
                    key={row.key ?? row.label ?? `comparison-${index}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {row.label ?? "比較項目"}
                    </span>
                    <span
                      className={`text-right text-sm font-semibold tabular-nums lining-nums ${presentation.className}`}
                    >
                      <span aria-hidden="true">{presentation.symbol}</span>{" "}
                      {varianceSignPrefix(row)}
                      {formatApiTwd(row.variance?.difference ?? null)} ·{" "}
                      {presentation.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3 rounded-xl border border-border bg-muted p-4">
              <p className="font-semibold">尚無可比較資料</p>
              <p className="mt-1 text-sm text-muted-foreground">
                新增實際成本後，這裡會顯示差額、符號與有利／不利結論。
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CostPanel({ cards }: { cards: Map<string, KpiCard> }) {
  const ranks = [
    {
      label: "商品進貨成本",
      value: cardValue(cards, "purchaseCost"),
    },
    {
      label: "固定成本",
      value: cardValue(cards, "fixedCost"),
    },
    {
      label: "變動成本",
      value: cardValue(cards, "variableCost"),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[16px] border border-border bg-card p-4">
        <h3 className="text-base font-semibold">成本占比待確認</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          目前沒有可用占比，不以 0% 或假比例取代。
        </p>
        <div
          className="mx-auto mt-5 grid aspect-square w-44 place-items-center rounded-full border-[18px] border-muted"
          role="img"
          aria-label="成本占比圖待確認"
        >
          <strong className="text-lg tabular-nums lining-nums">待確認</strong>
        </div>
      </section>

      <section className="rounded-[16px] border border-border bg-card p-4">
        <h3 className="text-base font-semibold">商品進貨成本為排行首項</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          目前只列出可核對金額；相對比例維持待確認。
        </p>
        <ol className="mt-4 space-y-4">
          {ranks.map((rank, index) => (
            <li key={rank.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {index + 1}. {rank.label}
                </span>
                <strong className="tabular-nums lining-nums">
                  {rank.value}
                </strong>
              </div>
              <div className="mt-2 flex min-h-7 items-center rounded-md border border-border bg-muted px-2">
                <span className="text-xs text-muted-foreground">
                  占比待確認
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function TrendPanel({
  monthlyTrendContent,
}: {
  monthlyTrendContent?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-[16px] border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">歷史趨勢待確認</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              預設一張主圖；切換指標不會同時堆出四張圖。
            </p>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            趨勢指標
            <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground">
              <option>平均單件毛利</option>
              <option>商品總件數</option>
              <option>平均每日毛利</option>
            </select>
          </label>
        </div>
        <div
          className="mt-5 grid min-h-56 place-items-center rounded-xl border border-border bg-muted p-4"
          role="img"
          aria-label="單一主趨勢圖資料待確認"
        >
          <p className="text-center text-sm text-muted-foreground">
            尚無趨勢資料。取得足夠行程資料後顯示單一主圖。
          </p>
        </div>
      </section>

      {monthlyTrendContent ? (
        <section className="mx-auto w-full max-w-[960px]">
          {monthlyTrendContent}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SecondaryNumbers
          items={[
            {
              label: "平均每日毛利",
              value: PENDING,
              meta: "目前資料是整趟投影，不等於每日平均；資料補齊後再顯示。",
            },
          ]}
        />

        <section className="rounded-[16px] border border-border bg-card p-4">
          <h3 className="text-base font-semibold">行程比較</h3>
          <div className="mt-3 rounded-xl border border-border bg-muted p-4">
            <p className="font-semibold">尚無行程比較資料</p>
            <p className="mt-1 text-sm text-muted-foreground">
              至少有兩趟具備可比較資料後，這裡會顯示結論與差異方向。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
