import {
  useGetMyStore,
  useListRouteCostRanking,
  type RouteCostRankingResponse,
} from "@workspace/api-client-react";
import { ExactDecimal } from "@workspace/db/transport-cost";

import { SemanticStatePanel } from "../SemanticStatePanel";
import { ChartCard } from "./chartCard";
import { chartPendingReason } from "./chartPendingReason";
import { CHART_TOKEN } from "./chartTheme";
import {
  chartTwdAriaLabel,
  compareExact,
  exactDecimal,
  exactPercent,
  formatChartTwd,
} from "./exactChart";

interface RouteCostRankingChartViewProps {
  data?: RouteCostRankingResponse;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "路線成本端點讀取失敗。";
}

export function RouteCostRankingChartView({
  data,
  loading,
  error,
  onRetry,
}: RouteCostRankingChartViewProps) {
  const readyItems = (data?.items ?? [])
    .flatMap((item) => {
      if (item.status !== "ready" || item.unitCostTwd === null) return [];
      const decimal = exactDecimal(item.unitCostTwd);
      return decimal === null || decimal.isNegative()
        ? []
        : [{ ...item, decimal }];
    })
    .sort((left, right) => compareExact(right.decimal, left.decimal));
  const invalidReadyItems = (data?.items ?? []).filter(
    (item) =>
      item.status === "ready" &&
      (item.unitCostTwd === null ||
        exactDecimal(item.unitCostTwd) === null ||
        exactDecimal(item.unitCostTwd)?.isNegative()),
  );
  const pendingItems = (data?.items ?? []).filter(
    (item) => item.status === "pending_confirmation",
  );
  const maximum = readyItems[0]?.decimal ?? null;
  const maximumIsZero = maximum?.equals(ExactDecimal.zero()) ?? false;
  const hasPending = pendingItems.length > 0 || invalidReadyItems.length > 0;
  const title =
    readyItems.length > 0
      ? `${hasPending ? "已確認路線中，" : ""}${readyItems[0].name}的單件路線成本最高`
      : "路線單件成本待確認";
  const summary =
    readyItems.length > 0
      ? `路線單件成本由高至低：${readyItems
          .map((item) => `${item.name} ${formatChartTwd(item.unitCostTwd)}`)
          .join("；")}`
      : "尚無可顯示的路線單件成本；不以零值補缺資料。";

  return (
    <ChartCard
      title={title}
      subtitle="全店所有行程的預估路線成本；不隨上方單一行程或模式切換。精確金額常駐於條尾。"
      summary={summary}
      summaryId="route-cost-ranking-summary"
    >
      {error && data ? (
        <SemanticStatePanel
          className="mb-4"
          state={{
            kind: "inlineError",
            title: "路線成本更新失敗",
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
          ◆ 正在更新路線成本；目前保留上次成功資料。
        </p>
      ) : null}
      {loading && !data ? (
        <SemanticStatePanel
          className="min-h-64"
          state={{
            kind: "loading",
            label: "讀取路線單件成本",
            fallbackMessage: "正在讀取路線成本排行，尚未以 0 代替資料。",
          }}
        />
      ) : error && !data ? (
        <SemanticStatePanel
          state={{
            kind: "inlineError",
            title: "無法讀取路線成本排行",
            message: errorMessage(error),
            action: { label: "重試", onAction: onRetry },
          }}
        />
      ) : readyItems.length === 0 &&
        pendingItems.length === 0 &&
        invalidReadyItems.length === 0 ? (
        <SemanticStatePanel
          state={{
            kind: "empty",
            title: "尚無路線成本資料",
            reason: "建立路線並完成交通成本資料後，這裡才會顯示單件成本排行。",
          }}
        />
      ) : (
        <div className="space-y-4">
          {readyItems.length > 0 && maximum !== null ? (
            <ol className="space-y-4" aria-label="路線單件成本排行">
              {readyItems.map((item, index) => (
                <li key={`${item.routeId}-${item.tripId}`}>
                  <div className="mb-1.5 flex items-end justify-between gap-3 text-sm">
                    <span
                      className="line-clamp-2 min-w-0 break-words"
                      title={item.name}
                    >
                      {index + 1}. {item.name}
                      {item.tripName ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {item.tripName}
                        </span>
                      ) : null}
                    </span>
                    <strong
                      className="shrink-0 tabular-nums lining-nums"
                      aria-label={chartTwdAriaLabel(item.unitCostTwd)}
                    >
                      {formatChartTwd(item.unitCostTwd)}
                    </strong>
                  </div>
                  <div
                    className="h-6 overflow-hidden rounded-md"
                    style={{ backgroundColor: CHART_TOKEN.gridline }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full min-h-5 rounded-md"
                      style={{
                        width: `${exactPercent(item.decimal, maximum) ?? "0"}%`,
                        backgroundColor: CHART_TOKEN.estimate,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {maximumIsZero ? (
            <p className="text-xs text-muted-foreground tabular-nums lining-nums">
              ◆ 所有已確認路線的單件成本皆為 {formatChartTwd("0")}
              ；零長度代表後端真實零值。
            </p>
          ) : null}

          {pendingItems.length > 0 || invalidReadyItems.length > 0 ? (
            <section
              className="border border-accent bg-accent/10 p-3"
              aria-label="待確認的路線成本"
            >
              <p className="text-sm font-semibold">待確認的路線</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                {pendingItems.map((item) => (
                  <li key={`${item.routeId}-${item.tripId}`}>
                    ◆ {item.name}：待確認｜{chartPendingReason(item.reason)}
                  </li>
                ))}
                {invalidReadyItems.map((item) => (
                  <li key={`${item.routeId}-${item.tripId}`}>
                    ◆ {item.name}：待確認｜後端單件成本格式無法辨識
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}

export function RouteCostRankingChart() {
  const storeQuery = useGetMyStore();
  const storeId = storeQuery.data?.id ?? 0;
  const chartQuery = useListRouteCostRanking(storeId);
  const error =
    storeQuery.error ??
    chartQuery.error ??
    (!storeQuery.isLoading && !storeQuery.data
      ? new Error("待確認｜尚未取得店鋪識別，無法讀取路線成本。")
      : undefined);

  return (
    <RouteCostRankingChartView
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
