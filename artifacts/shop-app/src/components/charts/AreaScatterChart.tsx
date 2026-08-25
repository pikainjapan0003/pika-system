import { useState } from "react";
import {
  useGetMyStore,
  useListAreaScatter,
  type AreaScatterItem,
  type AreaScatterResponse,
} from "@workspace/api-client-react";
import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SemanticStatePanel } from "../SemanticStatePanel";
import { ChartCard, ChartFrame, ChartLegendRow } from "./chartCard";
import { chartPendingReason } from "./chartPendingReason";
import { CHART_TOKEN } from "./chartTheme";
import {
  chartTwdAriaLabel,
  compareExact,
  exactDecimal,
  exactPosition,
  formatChartTwd,
} from "./exactChart";

interface AreaScatterChartViewProps {
  data?: AreaScatterResponse;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "大區比較端點讀取失敗。";
}

function pendingReason(item: AreaScatterItem): string {
  return chartPendingReason(item.reason);
}

function isExactValue(value: string | null): value is string {
  return value !== null && exactDecimal(value) !== null;
}

function isNonNegativeExactValue(value: string | null): value is string {
  const decimal = value === null ? null : exactDecimal(value);
  return decimal !== null && !decimal.isNegative();
}

export function AreaScatterChartView({
  data,
  loading,
  error,
  onRetry,
}: AreaScatterChartViewProps) {
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const readyItems = (data?.items ?? [])
    .flatMap((item) => {
      if (
        item.status !== "ready" ||
        !isNonNegativeExactValue(item.itemQuantity) ||
        !isExactValue(item.averageUnitProfitTwd) ||
        !isNonNegativeExactValue(item.revenueTwd)
      ) {
        return [];
      }
      return [
        {
          ...item,
          itemQuantityDecimal: exactDecimal(item.itemQuantity)!,
          averageProfitDecimal: exactDecimal(item.averageUnitProfitTwd)!,
        },
      ];
    })
    .sort((left, right) =>
      compareExact(right.averageProfitDecimal, left.averageProfitDecimal),
    );
  const invalidReadyItems = (data?.items ?? []).filter(
    (item) =>
      item.status === "ready" &&
      (!isNonNegativeExactValue(item.itemQuantity) ||
        !isExactValue(item.averageUnitProfitTwd) ||
        !isNonNegativeExactValue(item.revenueTwd)),
  );
  const pendingItems = (data?.items ?? []).filter(
    (item) => item.status === "pending_confirmation",
  );
  const hasPending = pendingItems.length > 0 || invalidReadyItems.length > 0;
  const title =
    readyItems.length >= 2
      ? `${hasPending ? "已確認大區中，" : ""}${readyItems[0].areaName}的平均單件毛利最高`
      : "大區商品表現待確認";
  const summary =
    readyItems.length > 0
      ? `大區比較：${readyItems
          .map(
            (item) =>
              `${item.areaName} ${item.itemQuantity} 件、平均單件毛利 ${formatChartTwd(item.averageUnitProfitTwd)}、收入 ${formatChartTwd(item.revenueTwd)}、${item.tripCount} 趟`,
          )
          .join("；")}`
      : "尚無兩個資料完整的大區可比較；缺值不畫成座標原點。";
  const quantityOrder = [...readyItems].sort((left, right) =>
    compareExact(left.itemQuantityDecimal, right.itemQuantityDecimal),
  );
  const profitOrder = [...readyItems].sort((left, right) =>
    compareExact(left.averageProfitDecimal, right.averageProfitDecimal),
  );
  const minimumQuantity = quantityOrder[0]?.itemQuantityDecimal ?? null;
  const maximumQuantity = quantityOrder.at(-1)?.itemQuantityDecimal ?? null;
  const minimumProfit = profitOrder[0]?.averageProfitDecimal ?? null;
  const maximumProfit = profitOrder.at(-1)?.averageProfitDecimal ?? null;
  const chartData = readyItems.map((item) => ({
    plotX:
      minimumQuantity && maximumQuantity
        ? exactPosition(
            item.itemQuantityDecimal,
            minimumQuantity,
            maximumQuantity,
          )
        : null,
    plotY:
      minimumProfit && maximumProfit
        ? exactPosition(item.averageProfitDecimal, minimumProfit, maximumProfit)
        : null,
    source: item,
  }));
  const pendingContent =
    pendingItems.length > 0 || invalidReadyItems.length > 0 ? (
      <section
        className="border border-accent bg-accent/10 p-3"
        aria-label="待確認的大區資料"
      >
        <p className="text-sm font-semibold">待確認的大區</p>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {pendingItems.map((item) => (
            <li key={item.areaName}>
              ◆ {item.areaName}：待確認｜{pendingReason(item)}
            </li>
          ))}
          {invalidReadyItems.map((item) => (
            <li key={item.areaName}>
              ◆ {item.areaName}：待確認｜後端散布圖欄位格式不完整
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  const exactDataContent =
    readyItems.length > 0 ? (
      <section aria-labelledby="area-exact-data-title">
        <h4 id="area-exact-data-title" className="text-sm font-semibold">
          精確大區資料
        </h4>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {readyItems.map((item, index) => (
            <li key={item.areaName} className="py-2">
              <button
                type="button"
                className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onMouseEnter={() => setActiveArea(item.areaName)}
                onFocus={() => setActiveArea(item.areaName)}
                onClick={() =>
                  setActiveArea((current) =>
                    current === item.areaName ? null : item.areaName,
                  )
                }
                aria-describedby={
                  activeArea === item.areaName
                    ? `area-tooltip-${index}`
                    : undefined
                }
              >
                <span>{item.areaName}</span>
                <span className="text-right text-sm tabular-nums lining-nums">
                  {item.itemQuantity} 件 ·{" "}
                  <span
                    aria-label={chartTwdAriaLabel(item.averageUnitProfitTwd)}
                  >
                    {formatChartTwd(item.averageUnitProfitTwd)}
                  </span>
                </span>
              </button>
              {activeArea === item.areaName ? (
                <div
                  id={`area-tooltip-${index}`}
                  role="tooltip"
                  className="mt-1 border border-border bg-popover p-2 text-xs text-popover-foreground"
                >
                  收入 {formatChartTwd(item.revenueTwd)}；涵蓋 {item.tripCount}
                  趟行程。
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <ChartCard
      title={title}
      subtitle="全店所有行程的實際大區表現；不隨上方單一行程或模式切換。橫軸為商品件數，縱軸為平均單件毛利。"
      summary={summary}
      summaryId="area-scatter-summary"
      legend={
        <ChartLegendRow
          items={[{ label: "資料完整的大區", color: CHART_TOKEN.actual }]}
        />
      }
    >
      {error && data ? (
        <SemanticStatePanel
          className="mb-4"
          state={{
            kind: "inlineError",
            title: "大區比較更新失敗",
            message: `目前顯示上次成功資料。${errorMessage(error)}`,
            action: { label: "重試", onAction: onRetry },
          }}
        />
      ) : null}
      {loading && data ? (
        <p
          className="mb-4 border border-border bg-secondary/50 p-3 text-sm"
          role="status"
        >
          ◆ 正在更新大區比較；目前保留上次成功資料。
        </p>
      ) : null}
      {loading && !data ? (
        <SemanticStatePanel
          className="min-h-[360px]"
          state={{
            kind: "loading",
            label: "讀取大區商品表現",
            fallbackMessage: "正在讀取大區資料，尚未將缺值畫成 (0, 0)。",
          }}
        />
      ) : error && !data ? (
        <SemanticStatePanel
          state={{
            kind: "inlineError",
            title: "無法讀取大區比較",
            message: errorMessage(error),
            action: { label: "重試", onAction: onRetry },
          }}
        />
      ) : readyItems.length < 2 ? (
        <div className="space-y-3">
          <SemanticStatePanel
            state={{
              kind: readyItems.length === 0 ? "empty" : "pending",
              title:
                readyItems.length === 0
                  ? "尚無大區比較資料"
                  : "大區比較資料不足",
              reason:
                readyItems.length === 0
                  ? "至少需要兩個資料完整的大區，才會顯示商品件數與平均單件毛利比較。"
                  : "目前只有一個資料完整的大區；至少需要兩個大區才能比較，不會用假點補足。",
            }}
          />
          {exactDataContent}
          {pendingContent}
        </div>
      ) : (
        <div className="space-y-4">
          <ChartFrame height={280}>
            <ScatterChart margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_TOKEN.gridline}
              />
              <XAxis
                type="number"
                dataKey="plotX"
                name="商品件數"
                domain={[0, 100]}
                tick={false}
                axisLine={{ stroke: CHART_TOKEN.axis }}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="plotY"
                name="平均單件毛利"
                domain={[0, 100]}
                tick={false}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(
                  _value: unknown,
                  _name: unknown,
                  entry: unknown,
                ) => {
                  const source = (
                    entry as { payload?: { source?: AreaScatterItem } }
                  ).payload?.source;
                  return source
                    ? [
                        `平均單件毛利 ${formatChartTwd(source.averageUnitProfitTwd)}；收入 ${formatChartTwd(source.revenueTwd)}；${source.tripCount} 趟`,
                        `${source.areaName} · ${source.itemQuantity} 件`,
                      ]
                    : ["待確認", "大區資料"];
                }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: `1px solid ${CHART_TOKEN.legendBorder}`,
                  fontVariantNumeric: "tabular-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}
              />
              <Scatter data={chartData} fill={CHART_TOKEN.actual} />
            </ScatterChart>
          </ChartFrame>

          {exactDataContent}
          {pendingContent}
        </div>
      )}
    </ChartCard>
  );
}

export function AreaScatterChart() {
  const storeQuery = useGetMyStore();
  const storeId = storeQuery.data?.id ?? 0;
  const chartQuery = useListAreaScatter(storeId);
  const error =
    storeQuery.error ??
    chartQuery.error ??
    (!storeQuery.isLoading && !storeQuery.data
      ? new Error("待確認｜尚未取得店鋪識別，無法讀取大區比較。")
      : undefined);

  return (
    <AreaScatterChartView
      data={chartQuery.data}
      loading={Boolean(storeQuery.isLoading || chartQuery.isLoading)}
      error={error}
      onRetry={() => {
        if (storeId === 0) void storeQuery.refetch();
        else void chartQuery.refetch();
      }}
    />
  );
}
