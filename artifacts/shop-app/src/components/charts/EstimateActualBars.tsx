import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  formatApiTwd,
  OPERATING_COST_PENDING_LABEL,
} from "../../lib/operatingCostDisplay";
import type { OperatingSummary } from "../../lib/tripProfitBoard";
import { ChartCard, ChartLegendRow, ChartResponsiveOnly } from "./chartCard";
import { CHART_TOKEN } from "./chartTheme";

function num(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const SECTION_KEYS = [
  { key: "fixed", label: "固定成本" },
  { key: "variable", label: "變動成本" },
  { key: "purchase", label: "採購成本" },
] as const;

export function EstimateActualBars({
  estimate,
  actual,
  summaryId,
}: {
  estimate: OperatingSummary | null;
  actual: OperatingSummary | null;
  summaryId: string;
}) {
  const data = SECTION_KEYS.map(({ key, label }) => ({
    name: label,
    預估: num(
      estimate?.sections[key].status === "ready"
        ? estimate.sections[key].totalTwd
        : null,
    ),
    實際: num(
      actual?.sections[key].status === "ready"
        ? actual.sections[key].totalTwd
        : null,
    ),
  }));

  const anyMissing = SECTION_KEYS.some(
    (s) =>
      estimate == null ||
      estimate?.sections[s.key].status !== "ready" ||
      actual == null ||
      actual?.sections[s.key].status !== "ready",
  );

  return (
    <ChartCard
      title="B｜預估 ↔ 實際 群組長條"
      subtitle="同端點 operating-summary 取 mode=ESTIMATE 與 ACTUAL 各一次；缺值顯示待確認。"
      summaryId={summaryId}
      summary={
        anyMissing
          ? "預估／實際群組長條：部分成本類別仍待確認。"
          : `預估／實際成本對照：${data
              .map(
                (d) =>
                  `${d.name} 預估 ${d.預估 == null ? "待確認" : formatApiTwd(String(d.預估))} 實際 ${d.實際 == null ? "待確認" : formatApiTwd(String(d.實際))}`,
              )
              .join("；")}`
      }
      legend={
        <ChartLegendRow
          items={[
            { label: "預估（ESTIMATE）", color: CHART_TOKEN.estimate },
            { label: "實際（ACTUAL）", color: CHART_TOKEN.actual },
          ]}
        />
      }
    >
      <ChartResponsiveOnly>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKEN.gridline} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
            axisLine={{ stroke: CHART_TOKEN.axis }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: any, name: any) =>
              value == null
                ? "待確認"
                : `${name}：${formatApiTwd(String(value))}`
            }
            contentStyle={{
              background: "hsl(var(--popover))",
              border: `1px solid ${CHART_TOKEN.legendBorder}`,
            }}
          />
          <Bar
            dataKey="預估"
            fill={CHART_TOKEN.estimate}
            radius={[4, 4, 0, 0]}
          />
          <Bar dataKey="實際" fill={CHART_TOKEN.actual} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartResponsiveOnly>
      <p className="text-xs text-muted-foreground">
        {anyMissing ? "部分類別待確認（不補 0）。" : "全數已確認。"}
      </p>
    </ChartCard>
  );
}
