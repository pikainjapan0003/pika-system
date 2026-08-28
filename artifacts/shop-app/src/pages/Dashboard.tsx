import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMyStore,
  useGetStoreStats,
  useListOrders,
  useListProducts,
} from "@workspace/api-client-react";
import { useAuth, useClerk } from "@clerk/react";
import { STATUS_LABELS, STATUS_COLORS } from "../lib/orderStatus";
import { resolveOrderDisplayTotal } from "../lib/orderDisplayTotal";
import {
  countDashboardOrders,
  findLowStockProducts,
  LOW_STOCK_THRESHOLD,
} from "@/lib/dashboardMetrics";
import { ProfitKpiBoard } from "@/components/ProfitKpiBoard";
import { PreviewChart } from "@/components/PreviewChart";
import { BottomNavigation } from "@/components/BottomNavigation";
import { SonarBackground } from "@/components/SonarBackground";
import { CostStructureStack } from "@/components/charts/CostStructureStack";
import { EstimateActualBars } from "@/components/charts/EstimateActualBars";
import { ProfitWaterfall } from "@/components/charts/ProfitWaterfall";
import { VarianceContribution } from "@/components/charts/VarianceContribution";
import { useTripProfitBoard } from "@/lib/tripProfitBoard";
import { K_DURATION, loadMotion, motionEnabled, PIKA_EASE } from "@/lib/motion";

interface ProfitSummary {
  capturedProfitSubtotalDisplayTwd: string;
  pendingOrderCount: number;
  missingSnapshotOrderCount: number;
}

// 物流異常待處理數（open + reviewing）。現有 API 的 total 受 limit 影響，
// 因此各抓 limit=100 計數；達上限以 "100+" 顯示。失敗不影響 Dashboard 主功能。
function useLogisticsPendingCount(storeId: number | undefined) {
  const { getToken } = useAuth();
  const [state, setState] = useState<{
    loading: boolean;
    failed: boolean;
    count: number;
    capped: boolean;
  }>({
    loading: true,
    failed: false,
    count: 0,
    capped: false,
  });

  useEffect(() => {
    if (!storeId) {
      setState({ loading: false, failed: false, count: 0, capped: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const fetchCount = async (status: string) => {
          const res = await fetch(
            `/api/stores/${storeId}/logistics/exceptions?status=${status}&limit=100`,
            { credentials: "include", headers },
          );
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error("load failed");
          return (body.items ?? []).length as number;
        };
        const [open, reviewing] = await Promise.all([
          fetchCount("open"),
          fetchCount("reviewing"),
        ]);
        if (!cancelled)
          setState({
            loading: false,
            failed: false,
            count: open + reviewing,
            capped: open >= 100 || reviewing >= 100,
          });
      } catch {
        if (!cancelled)
          setState({ loading: false, failed: true, count: 0, capped: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, getToken]);

  return state;
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  const pending = useLogisticsPendingCount(storeId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = useGetStoreStats(storeId!, {
    query: { enabled: !!storeId } as any,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = useListOrders(storeId!, {
    query: { enabled: !!storeId } as any,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = useListProducts(storeId!, {
    query: { enabled: !!storeId } as any,
  });
  const { getToken } = useAuth();
  const board = useTripProfitBoard(storeId, getToken);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(
    null,
  );

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(
          `/api/stores/${storeId}/orders/profit-summary`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!response.ok) throw new Error("profit summary unavailable");
        const summary = (await response.json()) as ProfitSummary;
        if (!cancelled) setProfitSummary(summary);
      } catch {
        if (!cancelled) setProfitSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, storeId]);

  const recentOrders = orders ? [...orders].reverse().slice(0, 10) : [];
  const orderCounts = countDashboardOrders(orders ?? []);
  const lowStockProducts = findLowStockProducts(products ?? []);

  // ② ScrollTrigger＋⑤ SVG 繪入：首屏以下的 8 張圖表捲到才播放進場
  // （只當「延後播放」的觸發器；不做 parallax／pin／scrub；once 只播第一次，
  //  資料更新不得重播全套）。jsdom 無 matchMedia → motionEnabled=false → 不掛。
  const chartsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = chartsRef.current;
    if (!root || !motionEnabled()) return;
    let killTriggers: (() => void) | undefined;
    void loadMotion().then(({ gsap, ScrollTrigger }) => {
      if (!gsap || !ScrollTrigger) return;
      const triggers = Array.from(
        root.querySelectorAll<HTMLElement>("[data-chart-reveal]"),
      ).map((card) =>
        ScrollTrigger.create({
          trigger: card,
          start: "top 90%",
          once: true,
          onEnter: () => {
            // 長條由底長出（transform-only；目標線 ReferenceLine 不參與）
            const rects = card.querySelectorAll(".recharts-rectangle");
            const curves = card.querySelectorAll(".recharts-line-curve");
            const tl = gsap.timeline({ defaults: { ease: PIKA_EASE.inOut } });
            if (rects.length > 0) {
              tl.fromTo(
                rects,
                { scaleY: 0 },
                {
                  scaleY: 1,
                  duration: K_DURATION.fill,
                  ease: PIKA_EASE.inOut,
                  stagger: 0.05,
                },
                0,
              );
            }
            // 線圖 stroke-dashoffset 繪入（historyTrend 為唯一的線圖）
            curves.forEach((curve) => {
              tl.fromTo(
                curve,
                { strokeDasharray: 1, strokeDashoffset: 1 },
                {
                  strokeDashoffset: 0,
                  duration: K_DURATION.fill,
                  ease: PIKA_EASE.uiOut,
                },
                0.1,
              );
            });
            tl.play();
          },
        }),
      );
      killTriggers = () => triggers.forEach((trigger) => trigger.kill());
    });
    return () => {
      killTriggers?.();
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-[calc(112px+env(safe-area-inset-bottom))]">
      {/* Header */}
      <header className="bg-card border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">歡迎回來</div>
            <h1 className="text-lg font-bold text-foreground">
              {store?.name ?? "我的店鋪"}
            </h1>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-secondary"
          >
            登出
          </button>
        </div>
      </header>

      <div className="px-5 py-5 space-y-5">
        {/* MO-1～MO-3｜裁切於無文字背景帶；與 KPI 頁 280px 雷達主視覺分開。 */}
        <SonarBackground variant="ambient" />

        {/* 成本利潤 KPI（13 張卡，G0 凍結）；無行程時走 empty 空狀態 */}
        <ProfitKpiBoard
          trips={board.trips}
          selectedTripId={board.selectedTripId}
          onSelectTrip={board.setSelectedTripId}
          estimate={board.estimate}
          actual={board.actual}
          comparisonRows={board.comparisonRows}
          loading={board.loading}
          error={board.error}
        />

        {/* 圖表 A–H：A–D 真實資料（operating-summary／fixed-cost-comparison），E–H 示意圖（PreviewChart） */}
        <section className="space-y-4" aria-label="分析圖表" ref={chartsRef}>
          <ProfitWaterfall
            estimate={board.estimate}
            summaryId="chart-a-summary"
          />
          <EstimateActualBars
            estimate={board.estimate}
            actual={board.actual}
            summaryId="chart-b-summary"
          />
          <CostStructureStack
            estimate={board.estimate}
            summaryId="chart-c-summary"
          />
          <VarianceContribution
            rows={board.comparisonRows}
            summaryId="chart-d-summary"
          />
          <PreviewChart chart="routeCostRanking" summaryId="chart-e-summary" />
          <PreviewChart chart="areaScatter" summaryId="chart-f-summary" />
          <PreviewChart
            chart="sensitivityHeatmap"
            summaryId="chart-g-summary"
          />
          <PreviewChart chart="historyTrend" summaryId="chart-h-summary" />
        </section>

        {/* Store info prompt card */}
        {(store?.name === "我的代購店" || !store?.description) && (
          <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4">
            <p className="text-sm font-semibold text-accent mb-1">
              完善商店資訊
            </p>
            <p className="text-xs text-accent leading-relaxed">
              你的店鋪已建立，可以先新增商品開始收單。建議到設定補上店鋪名稱與介紹，讓買家更容易辨識。
            </p>
            <button
              onClick={() => setLocation("/settings")}
              className="mt-3 text-xs font-semibold text-accent bg-accent/15 px-3 py-1.5 rounded-lg active:opacity-75 transition-opacity"
            >
              前往設定
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="總訂單" value={stats?.totalOrders ?? 0} />
          <StatCard
            label="待確認"
            value={stats?.pendingOrders ?? 0}
            accent
            onClick={() => setLocation("/orders")}
          />
          <StatCard
            label="總金額"
            value={`$${(stats?.totalRevenue ?? 0).toLocaleString()}`}
          />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                老闆今日重點
              </h2>
              <p className="text-xs text-muted-foreground">
                毛利沿用訂單定格快照，不重算即時成本。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/orders")}
              className="text-xs font-medium text-primary"
            >
              處理訂單 ›
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OwnerMetricCard
              label="今日訂單"
              value={String(orderCounts.today)}
            />
            <OwnerMetricCard
              label="本週訂單"
              value={String(orderCounts.thisWeek)}
            />
            <OwnerMetricCard
              label="已定格毛利小計"
              value={
                profitSummary
                  ? `NT$${Number(profitSummary.capturedProfitSubtotalDisplayTwd).toLocaleString()}`
                  : "讀取中"
              }
            />
            <OwnerMetricCard
              label="待確認訂單"
              value={String(stats?.pendingOrders ?? 0)}
              accent={(stats?.pendingOrders ?? 0) > 0}
            />
            <OwnerMetricCard
              label="毛利待補拍"
              value={
                profitSummary
                  ? String(profitSummary.pendingOrderCount)
                  : "讀取中"
              }
              accent={(profitSummary?.pendingOrderCount ?? 0) > 0}
            />
            <OwnerMetricCard
              label="尚無快照"
              value={
                profitSummary
                  ? String(profitSummary.missingSnapshotOrderCount)
                  : "讀取中"
              }
              accent={(profitSummary?.missingSnapshotOrderCount ?? 0) > 0}
            />
          </div>
          <button
            type="button"
            onClick={() => setLocation("/reports/monthly-profit")}
            className="mt-3 min-h-11 w-full rounded-xl border border-primary/20 bg-primary/5 text-sm font-semibold text-primary"
          >
            查看每月毛利報表 ›
          </button>
        </section>

        {/* Status breakdown */}
        {stats?.statusBreakdown && stats.statusBreakdown.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              訂單狀態分佈
            </h2>
            <div className="space-y-2">
              {stats.statusBreakdown.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between"
                >
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            label="管理商品"
            desc="新增、編輯商品"
            icon="📦"
            onClick={() => setLocation("/products")}
          />
          <ActionCard
            label="查看訂單"
            desc="管理所有訂單"
            icon="📋"
            onClick={() => setLocation("/orders")}
          />
          <ActionCard
            label="店鋪設定"
            desc="名稱、簡介"
            icon="⚙"
            onClick={() => setLocation("/settings")}
          />
          <ActionCard
            label="物流匯入"
            desc="上傳 7-11 / 全家 Excel"
            icon="🚚"
            onClick={() => setLocation("/logistics/import")}
          />
          <ActionCard
            label="物流異常"
            desc={
              pending.loading
                ? "檢查中..."
                : pending.failed
                  ? "數量載入失敗"
                  : pending.count > 0
                    ? `${pending.capped ? "100+" : pending.count} 筆待處理`
                    : "目前無待處理"
            }
            icon="⚠️"
            badge={
              !pending.loading && !pending.failed && pending.count > 0
                ? `待處理 ${pending.capped ? "100+" : pending.count}`
                : undefined
            }
            onClick={() => setLocation("/logistics/exceptions")}
          />
          <ActionCard
            label="使用說明"
            desc="如何開始接單"
            icon="📖"
            onClick={() => setLocation("/guide")}
          />
        </div>

        {/* Recent orders */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                低庫存提醒
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                庫存 ≤ {LOW_STOCK_THRESHOLD}（建議值，可調）；未設定庫存不追蹤。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/products")}
              className="text-xs font-medium text-primary"
            >
              管理商品 ›
            </button>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              目前沒有低庫存商品
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-accent">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-accent">
                    剩 {product.inventory}
                  </span>
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  另有 {lowStockProducts.length - 5} 件，請到商品頁查看。
                </p>
              )}
            </div>
          )}
        </section>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              最近 10 筆訂單
            </h2>
            <button
              onClick={() => setLocation("/orders")}
              className="text-xs text-primary font-medium"
            >
              查看全部
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <div className="bg-card rounded-2xl p-8 border border-border text-center">
              <p className="text-muted-foreground text-sm">目前還沒有訂單</p>
              <button
                onClick={() => setLocation("/products")}
                className="mt-3 text-sm text-primary font-medium"
              >
                前往新增商品
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o) => (
                <div
                  key={o.id}
                  className="bg-card rounded-2xl p-4 border border-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">
                        {o.buyerName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {o.productName}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[o.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      x{o.quantity}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      NT${resolveOrderDisplayTotal(o)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <BottomNavigation active="home" />
    </div>
  );
}

function OwnerMetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${accent ? "border-accent/30 bg-accent/10" : "border-border bg-card"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-3 border ${accent ? "bg-primary/10 border-primary/20" : "bg-card border-border"} ${onClick ? "cursor-pointer active:opacity-75 transition-opacity" : ""}`}
    >
      <div
        className={`text-xs mb-1 ${accent ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </div>
      <div
        className={`text-lg font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  label,
  desc,
  icon,
  badge,
  onClick,
}: {
  label: string;
  desc: string;
  icon: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="k2-lift bg-card rounded-2xl p-4 border border-border text-left active:bg-secondary transition-colors relative"
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive max-w-[45%] truncate">
          {badge}
        </span>
      )}
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-foreground text-sm">{label}</div>
      <div
        className={`text-xs mt-0.5 ${badge ? "text-destructive" : "text-muted-foreground"}`}
      >
        {desc}
      </div>
    </button>
  );
}
