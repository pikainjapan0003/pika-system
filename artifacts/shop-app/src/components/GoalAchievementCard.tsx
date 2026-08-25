import { OUTCOME_TEXT, type ProfitOutcome } from "@/lib/tripProfitBoard";

const OUTCOME_STYLE: Record<ProfitOutcome, string> = {
  SALARY_TARGET_MET: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  PROFIT_BELOW_SALARY_TARGET: "border-accent/30 bg-accent/10 text-accent",
  LOSS: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function GoalAchievementCard({
  outcome,
  current,
  target,
}: {
  outcome?: ProfitOutcome;
  current: string;
  target: string;
}) {
  const outcomeLabel = outcome ? OUTCOME_TEXT[outcome] : "待確認";

  return (
    <section
      className={`rounded-[14px] border bg-card p-4 sm:p-5 ${
        outcome ? OUTCOME_STYLE[outcome] : "border-border text-foreground"
      }`}
      aria-labelledby="goal-achievement-title"
    >
      <h3 id="goal-achievement-title" className="text-sm font-semibold">
        目標達成
      </h3>
      <strong className="mt-3 block text-2xl font-bold tabular-nums lining-nums sm:text-[28px]">
        待確認
      </strong>
      <p className="mt-1 text-sm font-semibold">
        {outcome ? `${outcomeLabel}｜達成率待確認` : "達標狀態待確認"}
      </p>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums lining-nums">目前 {current}</span>
          <span className="tabular-nums lining-nums">目標 {target}</span>
        </div>
        <div
          className="flex min-h-8 items-center justify-center rounded-full border border-border bg-muted px-3"
          role="progressbar"
          aria-label="薪資目標達成率"
          aria-valuetext="待確認"
        >
          <span className="text-xs text-muted-foreground">進度待確認</span>
        </div>
        <p className="text-xs text-muted-foreground">
          資料尚未齊全，暫不顯示百分比與差額。
        </p>
      </div>
    </section>
  );
}
