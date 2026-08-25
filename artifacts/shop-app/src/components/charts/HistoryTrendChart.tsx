import { useState } from "react";
import {
  useGetMyStore,
  useListHistoryTrend,
  type HistoryTrendItem,
  type HistoryTrendResponse,
} from "@workspace/api-client-react";
import {
  CartesianGrid,
  Line,
  LineChart,
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

type HistoryMetric = "actualProfit" | "tripCount";

interface HistoryTrendChartViewProps {
  data?: HistoryTrendResponse;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "歷史趨勢端點讀取失敗。";
}

function pendingReason(item: HistoryTrendItem): string {
  if (item.status === "ready") {
    return "後端淨利格式無法辨識";
  }
  return chartPendingReason(item.reason);
}

export function HistoryTrendChartView({
  data,
  loading,
  error,
  onRetry,
}: HistoryTrendChartViewProps) {
  const [metric, setMetric] = useState<HistoryMetric>("actualProfit");
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const items = [...(data?.items ?? [])].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const readyProfitItems = items.flatMap((item) => {
    if (item.status !== "ready" || item.profitTwd === null) return [];
    const decimal = exactDecimal(item.profitTwd);
    return decimal === null ? [] : [{ ...item, decimal }];
  });
  const invalidReadyItems = items.filter(
    (item) =>
      item.status === "ready" &&
      (item.profitTwd === null || exactDecimal(item.profitTwd) === null),
  );
  const pendingItems = items.filter(
    (item) => item.status === "pending_confirmation",
  );
  const profitOrder = [...readyProfitItems].sort((left, right) =>
    compareExact(left.decimal, right.decimal),
  );
  const minimumProfit = profitOrder[0]?.decimal ?? null;
  const maximumProfit = profitOrder.at(-1)?.decimal ?? null;
  const chartData = items.map((item) => ({
    month: item.month,
    actualProfit:
      item.status === "ready" &&
      item.profitTwd !== null &&
      exactDecimal(item.profitTwd) !== null
        ? exactPosition(
            exactDecimal(item.profitTwd)!,
            minimumProfit!,
            maximumProfit!,
          )
        : null,
    tripCount: item.tripCount,
    source: item,
  }));
  const firstReady = readyProfitItems[0];
  const lastReady = readyProfitItems.at(-1);
  const direction =
    firstReady && lastReady
      ? compareExact(lastReady.decimal, firstReady.decimal)
      : null;
  const profitTitle =
    readyProfitItems.length >= 2 && firstReady && lastReady
      ? `最新可確認月份的實際淨利較最早可確認月份${
          direction === 1 ? "高" : direction === -1 ? "低" : "相同"
        }`
      : readyProfitItems.length === 1
        ? `${readyProfitItems[0].month} 的實際淨利為 ${formatChartTwd(readyProfitItems[0].profitTwd)}`
        : "每月實際最終淨利待確認";
  const title =
    metric === "actualProfit"
      ? profitTitle
      : items.length >= 2
        ? `${items[0].month} 至 ${items.at(-1)?.month ?? items[0].month} 的每月行程數比較`
        : "每月行程數待確認";
  const enoughData =
    metric === "actualProfit"
      ? readyProfitItems.length >= 2
      : items.length >= 2;
  const summary =
    items.length === 0
      ? "歷史趨勢尚無月份資料。"
      : items
          .map((item) =>
            item.status === "ready" &&
            item.profitTwd !== null &&
            exactDecimal(item.profitTwd) !== null
              ? `${item.month} 實際淨利 ${formatChartTwd(item.profitTwd)}、${item.tripCount} 趟`
              : `${item.month} 待確認：${pendingReason(item)}`,
          )
          .join("；");
  const exactDataContent = (
    <section aria-labelledby="history-exact-data-title">
      <h4 id="history-exact-data-title" className="text-sm font-semibold">
        精確月份資料
      </h4>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {items.map((item) => {
          const isProfitReady =
            item.status === "ready" &&
            item.profitTwd !== null &&
            exactDecimal(item.profitTwd) !== null;
          return (
            <li key={item.month} className="py-2">
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onMouseEnter={() => setActiveMonth(item.month)}
                onFocus={() => setActiveMonth(item.month)}
                onClick={() =>
                  setActiveMonth((current) =>
                    current === item.month ? null : item.month,
                  )
                }
                aria-describedby={
                  activeMonth === item.month
                    ? `history-tooltip-${item.month}`
                    : undefined
                }
              >
                <span>{item.month}</span>
                <span
                  className="text-right text-sm tabular-nums lining-nums"
                  aria-label={
                    metric === "actualProfit" && isProfitReady
                      ? chartTwdAriaLabel(item.profitTwd)
                      : undefined
                  }
                >
                  {metric === "tripCount"
                    ? `${item.tripCount} 趟${isProfitReady ? "" : " · 淨利待確認"}`
                    : isProfitReady
                      ? formatChartTwd(item.profitTwd)
                      : `◆ 待確認｜${pendingReason(item)}`}
                </span>
              </button>
              {activeMonth === item.month ? (
                <div
                  id={`history-tooltip-${item.month}`}
                  role="tooltip"
                  className="mt-1 border border-border bg-popover p-2 text-xs text-popover-foreground"
                >
                  {isProfitReady
                    ? `${item.month}：實際最終淨利 ${formatChartTwd(item.profitTwd)}；共 ${item.tripCount} 趟行程。`
                    : `${item.month}：${item.tripCount} 趟行程；淨利待確認，${pendingReason(item)}。`}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <ChartCard
      title={title}
      subtitle="全店所有行程的每月實際結果；不隨上方單一行程或模式切換。一張主圖以下拉切換指標。"
      summary={summary}
      summaryId="history-trend-summary"
      legend={
        <ChartLegendRow
          items={[
            {
              label: metric === "actualProfit" ? "每月實際淨利" : "每月行程數",
              color: CHART_TOKEN.actual,
            },
          ]}
        />
      }
    >
      <label className="mb-4 grid gap-1 text-xs text-muted-foreground sm:ml-auto sm:max-w-56">
        趨勢指標
        <select
          value={metric}
          onChange={(event) => setMetric(event.target.value as HistoryMetric)}
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="actualProfit">每月實際最終淨利</option>
          <option value="tripCount">每月行程數</option>
        </select>
      </label>

      {error && data ? (
        <SemanticStatePanel
          className="mb-4"
          state={{
            kind: "inlineError",
            title: "歷史趨勢更新失敗",
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
          ◆ 正在更新歷史趨勢；目前保留上次成功資料。
        </p>
      ) : null}
      {loading && !data ? (
        <SemanticStatePanel
          className="min-h-[340px]"
          state={{
            kind: "loading",
            label: "讀取歷史趨勢",
            fallbackMessage: "正在讀取每月實際資料，尚未以 0 補值。",
          }}
        />
      ) : error && !data ? (
        <SemanticStatePanel
          state={{
            kind: "inlineError",
            title: "無法讀取歷史趨勢",
            message: errorMessage(error),
            action: { label: "重試", onAction: onRetry },
          }}
        />
      ) : items.length === 0 ? (
        <SemanticStatePanel
          state={{
            kind: "empty",
            title: "尚無歷史趨勢資料",
            reason:
              "建立跨月份行程並完成實際成本後，才會顯示每月實際淨利趨勢。",
          }}
        />
      ) : !enoughData ? (
        <div className="space-y-4">
          <SemanticStatePanel
            state={{
              kind: "pending",
              title: "趨勢資料待確認",
              reason:
                metric === "actualProfit"
                  ? "至少需要兩個月份的完整實際淨利；待確認月份不會畫成 0 或跨月連線。"
                  : "至少需要兩個月份，才能比較每月行程數。",
            }}
          />
          {exactDataContent}
        </div>
      ) : (
        <div className="space-y-4">
          <ChartFrame height={260}>
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_TOKEN.gridline}
              />
              <XAxis
                dataKey="month"
                tick={{
                  fill: CHART_TOKEN.axis,
                  fontSize: 11,
                  className: "tabular-nums lining-nums",
                }}
                axisLine={{ stroke: CHART_TOKEN.axis }}
                tickLine={false}
              />
              <YAxis
                domain={metric === "actualProfit" ? [0, 100] : undefined}
                tick={
                  metric === "actualProfit"
                    ? false
                    : { fill: CHART_TOKEN.axis, fontSize: 11 }
                }
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
                    entry as { payload?: { source?: HistoryTrendItem } }
                  ).payload?.source;
                  return metric === "actualProfit"
                    ? formatChartTwd(source?.profitTwd ?? null)
                    : `${source?.tripCount ?? "待確認"} 趟`;
                }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: `1px solid ${CHART_TOKEN.legendBorder}`,
                  fontVariantNumeric: "tabular-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}
              />
              <Line
                type="monotone"
                dataKey={metric}
                connectNulls={false}
                stroke={CHART_TOKEN.actual}
                strokeWidth={2}
                activeDot={{ r: 6 }}
                dot={{ r: 4, fill: CHART_TOKEN.actual }}
              />
            </LineChart>
          </ChartFrame>

          {exactDataContent}

          {pendingItems.length > 0 || invalidReadyItems.length > 0 ? (
            <p className="border border-accent bg-accent/10 p-3 text-sm text-muted-foreground">
              ◆ {pendingItems.length + invalidReadyItems.length} 個月份待確認；
              未完成月份不會補 0，淨利線段亦不會跨過缺口。
            </p>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}

export function HistoryTrendChart() {
  const storeQuery = useGetMyStore();
  const storeId = storeQuery.data?.id ?? 0;
  const chartQuery = useListHistoryTrend(storeId);
  const error =
    storeQuery.error ??
    chartQuery.error ??
    (!storeQuery.isLoading && !storeQuery.data
      ? new Error("待確認｜尚未取得店鋪識別，無法讀取歷史趨勢。")
      : undefined);

  return (
    <HistoryTrendChartView
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
