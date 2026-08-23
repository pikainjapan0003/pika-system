import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  MOCK_AREA_SCATTER,
  MOCK_HISTORY_TREND,
  MOCK_ROUTE_COST_RANKING,
  MOCK_SENSITIVITY_HEATMAP,
} from "@/mocks/mockProfitCharts";
import { ChartCard, ChartFrame, ChartLegendRow } from "./charts/chartCard";
import {
  CHART_TOKEN,
  divergingPositive,
  sequentialProfit,
} from "./charts/chartTheme";

export type PreviewChartKind =
  | "routeCostRanking" // E 路線單件成本排行
  | "areaScatter" // F 地區商品表現
  | "sensitivityHeatmap" // G 敏感度熱圖
  | "historyTrend"; // H 歷史趨勢

const CHART_META: Record<
  PreviewChartKind,
  { title: string; subtitle: string; summary: string }
> = {
  routeCostRanking: {
    title: "E｜路線單件成本排行（示意）",
    subtitle: "無端點；示意資料，正式版接 GET /trips 已算好的單件成本。",
    summary:
      "路線單件成本排行（示意）：路線甲 999、路線乙 876、路線丙 754、路線丁 612、路線戊 480、路線己 333。此為非真實示意。",
  },
  areaScatter: {
    title: "F｜地區商品表現散點（示意）",
    subtitle: "無端點；示意資料，正式版接地區彙總 API。",
    summary:
      "地區商品表現散點（示意）：北區 320 件、中區 210 件、南區 150 件、東區 90 件、離島 40 件；此為非真實示意。",
  },
  sensitivityHeatmap: {
    title: "G｜敏感度熱圖（示意）",
    subtitle:
      "無端點；示意資料。連續數值使用 sequential 1–7 階、附金額刻度圖例。",
    summary:
      "敏感度熱圖示意：列為件數（90→210 件），欄為單件毛利（40→120 元），顏色為最終利益強度階（1 低 →7 高）；domain 為 NT$ 0 至 NT$ 120,000。此為非真實示意。",
  },
  historyTrend: {
    title: "H｜歷史趨勢（示意）",
    subtitle: "無端點；示意資料，正式版接跨行程彙總。",
    summary:
      "歷史趨勢示意：1 至 12 月 30,000 至 52,000 區間波動；此為非真實示意。",
  },
};

export function PreviewChart({
  chart,
  summaryId,
}: {
  chart: PreviewChartKind;
  summaryId: string;
}) {
  const meta = CHART_META[chart];

  return (
    <ChartCard
      title={meta.title}
      subtitle={meta.subtitle}
      summaryId={summaryId}
      summary={meta.summary}
      legend={
        chart === "sensitivityHeatmap" ? (
          <ChartLegendRow
            items={[1, 2, 3, 4, 5, 6, 7].map((step) => ({
              label: `階${step}（${MOCK_SENSITIVITY_HEATMAP.domain[step - 1]}）`,
              color: sequentialProfit(step as 1 | 2 | 3 | 4 | 5 | 6 | 7),
            }))}
          />
        ) : chart === "routeCostRanking" ? (
          <ChartLegendRow
            items={[
              { label: "每趟單件成本（示意）", color: sequentialProfit(5) },
            ]}
          />
        ) : chart === "areaScatter" ? (
          <ChartLegendRow
            items={[
              {
                label: "各區商品（點大小＝銷售額，示意）",
                color: divergingPositive(2),
              },
            ]}
          />
        ) : (
          <ChartLegendRow
            items={[
              { label: "每月最終利益（示意）", color: CHART_TOKEN.actual },
            ]}
          />
        )
      }
    >
      <div className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
        ⚠️ 示意圖・非真實資料
      </div>
      <div>
        {chart === "routeCostRanking" ? (
          <ChartFrame height={220}>
            <BarChart
              data={MOCK_ROUTE_COST_RANKING}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
              barSize={20}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_TOKEN.gridline}
              />
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
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: `1px solid ${CHART_TOKEN.legendBorder}`,
                }}
              />
              <Bar dataKey="單件成本" radius={[2, 2, 2, 2]}>
                {MOCK_ROUTE_COST_RANKING.map((row) => (
                  <Cell key={row.name} fill={sequentialProfit(5)} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
        ) : null}

        {chart === "areaScatter" ? (
          <ChartFrame height={240}>
            <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_TOKEN.gridline}
              />
              <XAxis
                type="number"
                dataKey="件數"
                name="件數"
                tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
                axisLine={{ stroke: CHART_TOKEN.axis }}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="單件毛利"
                name="單件毛利"
                tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
                axisLine={{ stroke: CHART_TOKEN.axis }}
                tickLine={false}
              />
              <ZAxis
                type="number"
                dataKey="銷售額"
                name="銷售額"
                range={[80, 400]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: `1px solid ${CHART_TOKEN.legendBorder}`,
                }}
              />
              <Scatter data={MOCK_AREA_SCATTER} fill={divergingPositive(2)} />
            </ScatterChart>
          </ChartFrame>
        ) : null}

        {chart === "sensitivityHeatmap" ? <HeatmapPreview /> : null}

        {chart === "historyTrend" ? (
          <ChartFrame height={240}>
            <LineChart
              data={MOCK_HISTORY_TREND}
              margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_TOKEN.gridline}
              />
              <XAxis
                dataKey="month"
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
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: `1px solid ${CHART_TOKEN.legendBorder}`,
                }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke={CHART_TOKEN.actual}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_TOKEN.actual, strokeWidth: 0 }}
              />
            </LineChart>
          </ChartFrame>
        ) : null}
      </div>
    </ChartCard>
  );
}

function HeatmapPreview() {
  const { rows, columns, cells } = MOCK_SENSITIVITY_HEATMAP;
  return (
    <div className="overflow-x-auto" data-preview-chart="sensitivity-heatmap">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th
              className="p-1 text-right font-medium"
              style={{ color: CHART_TOKEN.axis }}
            >
              件數 ＼ 單件毛利
            </th>
            {columns.map((column) => (
              <th
                key={column}
                className="p-1 font-medium"
                style={{ color: CHART_TOKEN.axis }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row}>
              <th
                className="p-1 text-right font-medium"
                style={{ color: CHART_TOKEN.axis }}
              >
                {row}
              </th>
              {cells[rowIndex].map((cell, columnIndex) => (
                <td key={columnIndex} className="p-1">
                  <span
                    className="block h-8 w-8 rounded border"
                    style={{
                      backgroundColor:
                        cell === 0
                          ? CHART_TOKEN.missing
                          : sequentialProfit(cell as 1 | 2 | 3 | 4 | 5 | 6 | 7),
                      borderColor: CHART_TOKEN.legendBorder,
                    }}
                    title={cell === 0 ? "待確認" : `階${cell}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
