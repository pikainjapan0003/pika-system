import { useEffect, useState } from "react";
import { ExactDecimal } from "@workspace/db/transport-cost";
import {
  formatApiTwd,
  OPERATING_COST_PENDING_LABEL,
} from "./operatingCostDisplay";

export type ProfitOutcome =
  | "LOSS"
  | "PROFIT_BELOW_SALARY_TARGET"
  | "SALARY_TARGET_MET";

export interface BoardSection {
  status: string;
  totalTwd: string | null;
  paymentFeeTwd: string | null;
}

export interface BoardProjection {
  status: string;
  outcome?: ProfitOutcome;
  grossProfitTwd?: string;
  adjustedRevenueTwd?: string | null;
  customerDiscountTotalTwd?: string | null;
  grossMarginRate?: string | null;
  operatingProfitBeforeAdjustmentsTwd?: string;
  finalOperatingProfitTwd?: string;
  salaryTargetTwd?: string;
  reason?: string;
}

export interface OperatingSummary {
  status: string;
  mode: "ESTIMATE" | "ACTUAL";
  exchangeRate: string | null;
  totalItemQuantity: number | null;
  unitGrossProfitTwd: string | null;
  sections: {
    fixed: BoardSection;
    variable: BoardSection;
    purchase: BoardSection;
  };
  tripProfit: {
    status: string;
    projections: {
      unit: BoardProjection;
      daily: BoardProjection;
    };
    fixedCostTotalTwd?: string | null;
    variableCostTotalTwd?: string | null;
    purchaseCostPrincipalTwd?: string | null;
    paymentFeeTwd?: string | null;
    operatingExpenseTwd?: string | null;
  };
  estimateLocked: boolean;
  estimateModifiedAfterLock: boolean;
}

export interface ComparisonRow {
  key?: string;
  label?: string;
  state?: string;
  estimatedTwd?: string | null;
  actualTwd?: string | null;
  variance?: {
    status?: string;
    difference?: string | null;
    percent?: string | null;
    direction?: string;
  } | null;
}

export interface TripListItem {
  id: number;
  name: string;
}

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  meta?: string;
  state?: ProfitOutcome;
}

export const OUTCOME_TEXT: Record<ProfitOutcome, string> = {
  SALARY_TARGET_MET: "已達標",
  PROFIT_BELOW_SALARY_TARGET: "未達標",
  LOSS: "虧損",
};

/**
 * 渲染層百分率（小數 → 百分點），沿用 ExactDecimal 字串管線，不引入
 * Number／parseFloat／toFixed（B-6 金額路徑守則）。
 */
function formatRate(value: string | null | undefined): string {
  if (value == null) return OPERATING_COST_PENDING_LABEL;
  try {
    const parsed = ExactDecimal.from(value);
    if (parsed.isNegative()) return OPERATING_COST_PENDING_LABEL;
    return `${parsed.multiply(ExactDecimal.from("100")).toDecimalPlaces(1)}%`;
  } catch {
    return OPERATING_COST_PENDING_LABEL;
  }
}

function money(value: string | null | undefined): string {
  return formatApiTwd(value);
}

export function deriveKpiCards(estimate: OperatingSummary | null): KpiCard[] {
  if (!estimate) return [];
  const tp = estimate.tripProfit;
  const unit = tp.projections.unit;
  const daily = tp.projections.daily;
  const unitReady = unit.status === "ready";
  const dailyReady = daily.status === "ready";
  return [
    {
      key: "sales",
      label: "銷售總額",
      value: OPERATING_COST_PENDING_LABEL,
      meta: "現行 API 無此欄位，依鐵律 2 顯示待確認",
    },
    {
      key: "adjustedRevenue",
      label: "調整後收入",
      value: money(unitReady ? (unit.adjustedRevenueTwd ?? null) : null),
    },
    {
      key: "purchaseCost",
      label: "商品進貨成本",
      value: money(tp.purchaseCostPrincipalTwd ?? null),
    },
    {
      key: "grossProfit",
      label: "營業毛利",
      value: money(unitReady ? (unit.grossProfitTwd ?? null) : null),
    },
    {
      key: "grossMarginRate",
      label: "毛利率",
      value: formatRate(unitReady ? (unit.grossMarginRate ?? null) : null),
    },
    {
      key: "fixedCost",
      label: "固定成本",
      value: money(tp.fixedCostTotalTwd ?? null),
    },
    {
      key: "variableCost",
      label: "變動成本",
      value: money(tp.variableCostTotalTwd ?? null),
    },
    {
      key: "finalProfit",
      label: "最終營業利益",
      value: money(unitReady ? (unit.finalOperatingProfitTwd ?? null) : null),
    },
    {
      key: "salaryTarget",
      label: "薪資目標",
      value: money(unitReady ? (unit.salaryTargetTwd ?? null) : null),
    },
    {
      key: "outcome",
      label: "達標狀態",
      value:
        unitReady && unit.outcome
          ? OUTCOME_TEXT[unit.outcome]
          : OPERATING_COST_PENDING_LABEL,
      state: unitReady && unit.outcome ? unit.outcome : undefined,
    },
    {
      key: "itemQuantity",
      label: "商品總件數",
      value:
        estimate.totalItemQuantity == null
          ? OPERATING_COST_PENDING_LABEL
          : String(estimate.totalItemQuantity),
    },
    {
      key: "unitProfit",
      label: "平均單件毛利",
      value: money(estimate.unitGrossProfitTwd ?? null),
    },
    {
      key: "dailyProfit",
      label: "平均每日毛利",
      value: money(dailyReady ? (daily.grossProfitTwd ?? null) : null),
      meta: "DAILY 投影（整趟值；除以工作天數待 API 補齊欄位）",
    },
  ];
}

export interface BoardData {
  trips: TripListItem[];
  selectedTripId: number | null;
  setSelectedTripId: (id: number) => void;
  estimate: OperatingSummary | null;
  actual: OperatingSummary | null;
  comparisonRows: ComparisonRow[];
  loading: boolean;
  error: string | null;
}

export function useTripProfitBoard(
  storeId: number | undefined,
  getToken: () => Promise<string | null>,
): BoardData {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<OperatingSummary | null>(null);
  const [actual, setActual] = useState<OperatingSummary | null>(null);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/stores/${storeId}/trips`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) setTrips([]);
          return;
        }
        const list = Array.isArray(body)
          ? body
              .filter((trip: any) => trip && typeof trip?.id === "number")
              .map((trip: any) => ({
                id: trip.id as number,
                name: (trip.name as string) ?? `行程 ${trip.id}`,
              }))
          : [];
        if (cancelled) return;
        setTrips(list);
        if (list.length > 0) {
          setSelectedTripId((current) => current ?? list[list.length - 1].id);
        }
      } catch {
        if (!cancelled) setTrips([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, getToken]);

  useEffect(() => {
    if (!storeId || selectedTripId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const fetchJson = async (path: string) => {
          const response = await fetch(`/api/stores/${storeId}${path}`, {
            headers,
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error ?? "無法讀取圖表資料");
          return body;
        };
        const [est, act, comp] = await Promise.all([
          fetchJson(`/trips/${selectedTripId}/operating-summary?mode=ESTIMATE`),
          fetchJson(`/trips/${selectedTripId}/operating-summary?mode=ACTUAL`),
          fetchJson(`/trips/${selectedTripId}/fixed-cost-comparison`),
        ]);
        if (cancelled) return;
        setEstimate(est as OperatingSummary);
        setActual(act as OperatingSummary);
        setComparisonRows(
          Array.isArray(comp?.rows) ? (comp.rows as ComparisonRow[]) : [],
        );
      } catch (caught) {
        if (!cancelled)
          setError(
            caught instanceof Error ? caught.message : "無法載入成本利潤資料",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, selectedTripId, getToken]);

  return {
    trips,
    selectedTripId,
    setSelectedTripId,
    estimate,
    actual,
    comparisonRows,
    loading,
    error,
  };
}
