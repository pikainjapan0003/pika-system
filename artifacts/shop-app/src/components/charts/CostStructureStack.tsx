import { Bar, BarChart, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { formatApiTwd } from "../../lib/operatingCostDisplay";
import type { OperatingSummary } from "../../lib/tripProfitBoard";
import { ChartCard, ChartLegendRow, ChartResponsiveOnly } from "./chartCard";
import { CHART_TOKEN } from "./chartTheme";

function num(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const SEGMENTS = [
  { key: "固定成本", color: CHART_TOKEN.estimate },
  { key: "變動成本", color: CHART_TOKEN.actual },
  { key: "採購成本", color: "hsl(var(--chart-2))" },
  { key: "金流手續費", color: "hsl(var(--chart-5))" },
] as const;

export function CostStructureStack({
  estimate,
  summaryId,
}: {
  estimate: OperatingSummary | null;
  summaryId: string;
}) {
  const data = [
    {
      name: "成本結構",
      固定成本: num(
        estimate?.sections.fixed.status === "ready"
          ? estimate.sections.fixed.totalTwd
          : null,
      ),
      變動成本: num(
        estimate?.sections.variable.status === "ready"
          ? estimate.sections.variable.totalTwd
          : null,
      ),
      採購成本: num(
        estimate?.sections.purchase.status === "ready"
          ? estimate.sections.purchase.totalTwd
          : null,
      ),
      金流手續費: num(estimate?.tripProfit.paymentFeeTwd ?? null),
    },
  ];

  const ready = Object.values(data[0]).some(
    (value) => typeof value === "number",
  );

  return (
    <ChartCard
      title="C｜成本結構堆疊圖"
      subtitle="sections（FIXED／VARIABLE／PURCHASE）＋ 金流手續費，單列堆疊（ESTIMATE）。"
      summaryId={summaryId}
      summary={
        ready
          ? `成本結構：固定 ${formatApiTwd(data[0].固定成本 == null ? "0" : String(data[0].固定成本))}、變動 ${formatApiTwd(
              data[0].變動成本 == null ? "0" : String(data[0].變動成本),
            )}、採購 ${formatApiTwd(
              data[0].採購成本 == null ? "0" : String(data[0].採購成本),
            )}、手續費 ${formatApiTwd(
              data[0].金流手續費 == null ? "0" : String(data[0].金流手續費),
            )}。`
          : "成本結構：尚無就緒資料。"
      }
      legend={
        <ChartLegendRow
          items={SEGMENTS.map((s) => ({ label: s.key, color: s.color }))}
        />
      }
    >
      {ready ? (
        <ChartResponsiveOnly>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            barSize={44}
          >
            <XAxis
              type="number"
              tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: CHART_TOKEN.axis, fontSize: 12 }}
              axisLine={{ stroke: CHART_TOKEN.axis }}
              tickLine={false}
              width={84}
            />
            <Tooltip
              formatter={(value: any, name: any) =>
                `${name}：${value == null ? "待確認" : formatApiTwd(String(value))}`
              }
              contentStyle={{
                background: "hsl(var(--popover))",
                border: `1px solid ${CHART_TOKEN.legendBorder}`,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SEGMENTS.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="cost" fill={s.color} />
            ))}
          </BarChart>
        </ChartResponsiveOnly>
      ) : (
        <p className="text-sm text-muted-foreground">
          尚無就緒的成本結構資料。
        </p>
      )}
    </ChartCard>
  );
}
