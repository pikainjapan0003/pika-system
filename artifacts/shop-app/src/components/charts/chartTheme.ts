/**
 * 圖表 token 取值（DESIGN.md 資料視覺化 token，P 段已補進 index.css）。
 * 全部以 CSS var() 引用，圖表內絕無 #hex 或 Tailwind 調色盤硬寫色。
 */
export const CHART_TOKEN = {
  axis: "hsl(var(--chart-axis))",
  gridline: "hsl(var(--chart-gridline))",
  contour: "hsl(var(--chart-contour))",
  missing: "hsl(var(--chart-missing))",
  targetLine: "hsl(var(--chart-target-line))",
  legendForeground: "hsl(var(--chart-legend-foreground))",
  legendBorder: "hsl(var(--chart-legend-border))",
  divergingNeutral: "hsl(var(--chart-diverging-profit-neutral))",
  estimate: "hsl(var(--chart-1))",
  actual: "hsl(var(--chart-4))",
} as const;

export function sequentialProfit(step: 1 | 2 | 3 | 4 | 5 | 6 | 7): string {
  return `hsl(var(--chart-sequential-profit-${step}))`;
}

export function divergingNegative(step: 1 | 2 | 3): string {
  return `hsl(var(--chart-diverging-profit-negative-${step}))`;
}

export function divergingPositive(step: 1 | 2 | 3): string {
  return `hsl(var(--chart-diverging-profit-positive-${step}))`;
}

export const WATERFALL_NEGATIVE = divergingNegative(3);
export const WATERFALL_POSITIVE = divergingPositive(3);
