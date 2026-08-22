import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatApiTwd,
  OPERATING_COST_PENDING_LABEL,
} from "../../lib/operatingCostDisplay";
import type { ComparisonRow } from "../../lib/tripProfitBoard";
import { ChartCard, ChartFrame, ChartLegendRow } from "./chartCard";
import {
  CHART_TOKEN,
  divergingNegative,
  divergingPositive,
} from "./chartTheme";

export function VarianceContribution({
  rows,
  summaryId,
}: {
  rows: ComparisonRow[];
  summaryId: string;
}) {
  const data = rows
    .filter(
      (row) =>
        row.variance?.difference != null &&
        (row.variance.direction === "favorable" ||
          row.variance.direction === "unfavorable"),
    )
    .map((row) => {
      const diff = Number(row.variance!.difference!);
      const direction: string = row.variance!.direction!;
      const value =
        direction === "unfavorable" ? -Math.abs(diff) : Math.abs(diff);
      return {
        name: row.label ?? row.key ?? "未具名項目",
        value,
        direction,
        raw: row.variance!.difference!,
      };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);

  const missingCount = rows.filter(
    (row) =>
      row.variance?.difference == null ||
      (row.variance.direction !== "favorable" &&
        row.variance.direction !== "unfavorable"),
  ).length;

  const colorFor = (direction: string) =>
    direction === "favorable"
      ? divergingPositive(2)
      : direction === "unfavorable"
        ? divergingNegative(2)
        : CHART_TOKEN.missing;

  return (
    <ChartCard
      title="D｜差異貢獻圖（發散）"
      subtitle="fixed-cost-comparison 的 difference／direction；有利在右、不利在左，雙編碼（顏色＋文字）。"
      summaryId={summaryId}
      summary={
        data.length === 0
          ? "差異貢獻：尚無可比較的預估／實際差異。"
          : `差異貢獻：${data
              .map(
                (row) =>
                  `${row.name} ${row.direction === "favorable" ? "有利" : "不利"} ${formatApiTwd(row.raw)}`,
              )
              .join(
                "；",
              )}${missingCount > 0 ? `；另有 ${missingCount} 項待確認或無差異` : ""}`
      }
      legend={
        <ChartLegendRow
          items={[
            { label: "有利（正）", color: divergingPositive(2) },
            { label: "不利（負）", color: divergingNegative(2) },
            { label: "待確認／無差異（不補 0）", color: CHART_TOKEN.missing },
          ]}
        />
      }
    >
      {data.length > 0 ? (
        <ChartFrame>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            barSize={18}
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
              tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
              axisLine={{ stroke: CHART_TOKEN.axis }}
              tickLine={false}
              width={96}
            />
            <Tooltip
              formatter={(value: any, name: any, entry: any) => {
                const raw = entry?.payload?.raw;
                return raw == null
                  ? OPERATING_COST_PENDING_LABEL
                  : formatApiTwd(String(raw));
              }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: `1px solid ${CHART_TOKEN.legendBorder}`,
              }}
            />
            <ReferenceLine
              x={0}
              stroke={CHART_TOKEN.axis}
              strokeDasharray="4 4"
            />
            <Bar dataKey="value" radius={[2, 2, 2, 2]}>
              {data.map((row) => (
                <Cell key={row.name} fill={colorFor(row.direction)} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      ) : (
        <p className="text-sm text-muted-foreground">
          尚無可顯示的差異；
          {missingCount > 0
            ? `${missingCount} 項待確認`
            : "請先建立預估與實際成本"}
          。
        </p>
      )}
    </ChartCard>
  );
}
