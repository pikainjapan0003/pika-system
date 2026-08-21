import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExactDecimal } from "@workspace/db/transport-cost";
import { formatApiTwd } from "../../lib/operatingCostDisplay";
import type { OperatingSummary } from "../../lib/tripProfitBoard";
import { ChartCard, ChartLegendRow, ChartResponsiveOnly } from "./chartCard";
import {
  CHART_TOKEN,
  divergingNegative,
  divergingPositive,
} from "./chartTheme";

interface WaterfallStep {
  name: string;
  value: string | null;
  kind: "income" | "after-cost" | "subtotal" | "result" | "target" | "diff";
}

function toDecimal(value: string | null | undefined): ExactDecimal | null {
  if (value == null) return null;
  try {
    const parsed = ExactDecimal.from(value);
    return parsed.isNegative() ? null : parsed;
  } catch {
    return null;
  }
}

function minus(
  a: ExactDecimal | null,
  b: ExactDecimal | null,
): ExactDecimal | null {
  if (a === null || b === null) return null;
  return a.add(b.multiply(ExactDecimal.from("-1")));
}

export function ProfitWaterfall({
  estimate,
  summaryId,
}: {
  estimate: OperatingSummary | null;
  summaryId: string;
}) {
  const steps = useMemo<WaterfallStep[]>(() => {
    if (!estimate) return [];
    const tp = estimate.tripProfit;
    const unit = tp.projections.unit;
    if (unit.status !== "ready") return [];
    const gross = toDecimal(unit.grossProfitTwd);
    const fixed = toDecimal(tp.fixedCostTotalTwd ?? null);
    const variable = toDecimal(tp.variableCostTotalTwd ?? null);
    const fee = toDecimal(tp.paymentFeeTwd ?? null);
    const afterFixed = minus(gross, fixed);
    const afterVariable = minus(afterFixed, variable);
    const afterFee = minus(afterVariable, fee);
    const before = toDecimal(unit.operatingProfitBeforeAdjustmentsTwd);
    const final = toDecimal(unit.finalOperatingProfitTwd);
    const salary = toDecimal(unit.salaryTargetTwd);
    const diff = minus(final, salary);

    // 銷售總額鏈（REVENUE 源）出現時前置「調整後收入」階段；現行 ESTIMATE
    // 多為 UNIT 源，此階段依可用資料條件提供。
    const revenueStart: WaterfallStep[] = unit.adjustedRevenueTwd
      ? [
          {
            name: "調整後收入",
            value: unit.adjustedRevenueTwd,
            kind: "income",
          },
        ]
      : [];

    return [
      ...revenueStart,
      { name: "營業毛利", value: unit.grossProfitTwd ?? null, kind: "income" },
      {
        name: "扣固定成本",
        value: afterFixed?.toDecimalPlaces(12).toString() ?? null,
        kind: "after-cost",
      },
      {
        name: "扣變動成本",
        value: afterVariable?.toDecimalPlaces(12).toString() ?? null,
        kind: "after-cost",
      },
      {
        name: "扣金流手續費",
        value: afterFee?.toDecimalPlaces(12).toString() ?? null,
        kind: "after-cost",
      },
      {
        name: "調整前營業利益",
        value:
          before?.toDecimalPlaces(12).toString() ??
          afterFee?.toDecimalPlaces(12).toString() ??
          null,
        kind: "subtotal",
      },
      {
        name: "最終營業利益",
        value: final?.toDecimalPlaces(12).toString() ?? null,
        kind: "result",
      },
      {
        name: "薪資目標",
        value: salary?.toDecimalPlaces(12).toString() ?? null,
        kind: "target",
      },
      {
        name: "達標差額",
        value: diff?.toDecimalPlaces(12).toString() ?? null,
        kind: "diff",
      },
    ];
  }, [estimate]);

  const data = steps.map((step, index) => {
    const numeric =
      step.value == null
        ? null
        : Number.isFinite(Number(step.value))
          ? Number(step.value)
          : null;
    return { ...step, index, numeric };
  });

  const colorFor = (step: WaterfallStep & { numeric: number | null }) => {
    if (step.numeric == null) return CHART_TOKEN.missing;
    switch (step.kind) {
      case "income":
      case "result":
        return CHART_TOKEN.estimate;
      case "after-cost":
        return divergingNegative(1);
      case "subtotal":
        return CHART_TOKEN.divergingNeutral;
      case "target":
        return CHART_TOKEN.targetLine;
      case "diff":
        return step.numeric < 0 ? divergingNegative(3) : divergingPositive(3);
    }
  };

  const legend = [
    { label: "收入／結果", color: CHART_TOKEN.estimate },
    { label: "扣減成本", color: divergingNegative(1) },
    { label: "小計／參考", color: CHART_TOKEN.divergingNeutral },
    { label: "薪資目標", color: CHART_TOKEN.targetLine },
    { label: "達標差額（有利／不利）", color: divergingPositive(3) },
  ];

  return (
    <ChartCard
      title="A｜損益階梯（瀑布）"
      subtitle="階梯式累積（營業毛利 → 扣減 → 最終利益 → 薪資目標 → 達標差額）；非對稱，資料取 operating-summary（ESTIMATE）。"
      summaryId={summaryId}
      summary={
        steps.length === 0
          ? "損益瀑布：暫無可顯示的預估損益資料，待選定已就緒行程。"
          : `損益瀑布共 ${steps.length} 階段：${steps
              .map(
                (s) =>
                  `${s.name}${s.value == null ? "待確認" : formatApiTwd(s.value)}`,
              )
              .join("；")}`
      }
      legend={<ChartLegendRow items={legend} />}
    >
      {data.length > 0 ? (
        <ChartResponsiveOnly>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_TOKEN.gridline}
            />
            <XAxis
              dataKey="name"
              tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
              axisLine={{ stroke: CHART_TOKEN.axis }}
              tickLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={64}
            />
            <YAxis
              tick={{ fill: CHART_TOKEN.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: any) =>
                value == null ? "待確認" : formatApiTwd(String(value))
              }
              cursor={{ fill: CHART_TOKEN.divergingNeutral, opacity: 0.3 }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: `1px solid ${CHART_TOKEN.legendBorder}`,
              }}
            />
            <ReferenceLine
              y={0}
              stroke={CHART_TOKEN.axis}
              strokeDasharray="4 4"
            />
            <Bar dataKey="numeric" radius={[4, 4, 0, 0]}>
              {data.map((step) => (
                <Cell key={step.index} fill={colorFor(step)} />
              ))}
            </Bar>
          </BarChart>
        </ChartResponsiveOnly>
      ) : (
        <p className="text-sm text-muted-foreground">
          尚無就緒的預估損益資料（待確認）。
        </p>
      )}
    </ChartCard>
  );
}
