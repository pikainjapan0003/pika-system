import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

import { CHART_TOKEN } from "./chartTheme";

/**
 * jsdom（node:test）沒有 ResizeObserver，recharts 的 ResponsiveContainer
 * 會直接 ReferenceError。此 guard 讓 recharts SVG 只在瀏覽器環境掛載；
 * 圖例與 a11y 摘要仍在無瀏覽器時顯示。
 */
export function ChartResponsiveOnly({ children }: { children: ReactNode }) {
  if (typeof ResizeObserver === "undefined") return null;
  return <>{children}</>;
}

/**
 * jsdom guard + 尺寸容器：recharts 的裸 BarChart／LineChart／ScatterChart
 * 沒有 width/height 時不會產生任何 SVG（A–H 圖表在瀏覽器全部隱形）。
 * ChartFrame 提供 ResponsiveContainer（100% × height），jsdom 下回傳 null。
 */
export function ChartFrame({
  height = 240,
  children,
}: {
  height?: number;
  children: ReactNode;
}) {
  if (typeof ResizeObserver === "undefined") return null;
  return (
    <div className="min-w-0" style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export interface ChartLegendItem {
  label: string;
  color: string;
}

export function ChartLegendRow({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{
              backgroundColor: item.color,
              border: `1px solid ${CHART_TOKEN.legendBorder}`,
            }}
          />
          <span
            className="text-xs tabular-nums lining-nums"
            style={{ color: CHART_TOKEN.legendForeground }}
          >
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({
  title,
  subtitle,
  summary,
  summaryId,
  legend,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  summary: string;
  summaryId: string;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-chart-reveal
      className={
        className ?? "space-y-3 rounded-2xl border border-border bg-card p-4"
      }
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {legend ? <div aria-hidden="true">{legend}</div> : null}
      <p id={summaryId} className="sr-only text-xs text-muted-foreground">
        {summary}
      </p>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
