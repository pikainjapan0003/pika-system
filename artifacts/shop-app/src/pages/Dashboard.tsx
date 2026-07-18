import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useGetStoreStats, useListOrders, useListProducts } from "@workspace/api-client-react";
import { useAuth, useClerk } from "@clerk/react";
import { STATUS_LABELS, STATUS_COLORS } from "../lib/orderStatus";
import { countDashboardOrders, findLowStockProducts, LOW_STOCK_THRESHOLD } from "@/lib/dashboardMetrics";
import { useDailySkillVisibility } from "@/lib/dailySkillVisibilityContext";

interface ProfitSummary {
  capturedProfitSubtotalDisplayTwd: string;
  pendingOrderCount: number;
  missingSnapshotOrderCount: number;
}

// 物流異常待處理數（open + reviewing）。現有 API 的 total 受 limit 影響，
// 因此各抓 limit=100 計數；達上限以 "100+" 顯示。失敗不影響 Dashboard 主功能。
function useLogisticsPendingCount(storeId: number | undefined, enabled: boolean) {
  const { getToken } = useAuth();
  const [state, setState] = useState<{ loading: boolean; failed: boolean; count: number; capped: boolean }>({
    loading: true,
    failed: false,
    count: 0,
    capped: false,
  });

  useEffect(() => {
    if (!storeId || !enabled) {
      setState({ loading: false, failed: false, count: 0, capped: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const fetchCount = async (status: string) => {
          const res = await fetch(
            `/api/stores/${storeId}/logistics/exceptions?status=${status}&limit=100`,
            { credentials: "include", headers },
          );
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error("load failed");
          return (body.items ?? []).length as number;
        };
        const [open, reviewing] = await Promise.all([fetchCount("open"), fetchCount("reviewing")]);
        if (!cancelled)
          setState({ loading: false, failed: false, count: open + reviewing, capped: open >= 100 || reviewing >= 100 });
      } catch {
        if (!cancelled) setState({ loading: false, failed: true, count: 0, capped: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, getToken, enabled]);

  return state;
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const skillVisibility = useDailySkillVisibility();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  const pending = useLogisticsPendingCount(storeId, skillVisibility.isVisible("logistics"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = useGetStoreStats(storeId!, { query: { enabled: !!storeId } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = useListProducts(storeId!, { query: { enabled: !!storeId } as any });
  const { getToken } = useAuth();
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/stores/${storeId}/orders/profit-summary`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("profit summary unavailable");
        const summary = await response.json() as ProfitSummary;
        if (!cancelled) setProfitSummary(summary);
      } catch {
        if (!cancelled) setProfitSummary(null);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, storeId]);

  const recentOrders = orders ? [...orders].reverse().slice(0, 10) : [];
  const orderCounts = countDashboardOrders(orders ?? []);
  const lowStockProducts = findLowStockProducts(products ?? []);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">歡迎回來</div>
            <h1 className="text-lg font-bold text-foreground">{store?.name ?? "我的店鋪"}</h1>
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
        {/* Store info prompt card */}
        {(store?.name === "我的代購店" || !store?.description) && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-amber-900 mb-1">完善商店資訊</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              你的店鋪已建立，可以先新增商品開始收單。建議到設定補上店鋪名稱與介紹，讓買家更容易辨識。
            </p>
            <button
              onClick={() => setLocation("/settings")}
              className="mt-3 text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg active:opacity-75 transition-opacity"
            >
              前往設定
            </button>
          </div>
        )}

        {skillVisibility.loaded && skillVisibility.enabledSkillCount === 0 && (
          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <h2 className="text-sm font-semibold text-sky-950">
              先從成本套餐開始
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-sky-800">
              進階功能（行程成本／毛利／客戶等）需先到技能地圖開啟，建議從「成本套餐」開始。
            </p>
            <button
              type="button"
              onClick={() => setLocation("/skill-map")}
              className="mt-3 min-h-11 w-full rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white"
            >
              前往技能地圖
            </button>
          </section>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="總訂單" value={stats?.totalOrders ?? 0} />
          <StatCard label="待確認" value={stats?.pendingOrders ?? 0} accent onClick={() => setLocation("/orders")} />
          <StatCard label="總金額" value={`$${(stats?.totalRevenue ?? 0).toLocaleString()}`} />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div><h2 className="text-sm font-semibold text-foreground">老闆今日重點</h2><p className="text-xs text-muted-foreground">毛利沿用訂單定格快照，不重算即時成本。</p></div>
            <button type="button" onClick={() => setLocation("/orders")} className="text-xs font-medium text-primary">處理訂單 ›</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OwnerMetricCard label="今日訂單" value={String(orderCounts.today)} />
            <OwnerMetricCard label="本週訂單" value={String(orderCounts.thisWeek)} />
            <OwnerMetricCard label="已定格毛利小計" value={profitSummary ? `NT$${Number(profitSummary.capturedProfitSubtotalDisplayTwd).toLocaleString()}` : "讀取中"} />
            <OwnerMetricCard label="待確認訂單" value={String(stats?.pendingOrders ?? 0)} accent={(stats?.pendingOrders ?? 0) > 0} />
            <OwnerMetricCard label="毛利待補拍" value={profitSummary ? String(profitSummary.pendingOrderCount) : "讀取中"} accent={(profitSummary?.pendingOrderCount ?? 0) > 0} />
            <OwnerMetricCard label="尚無快照" value={profitSummary ? String(profitSummary.missingSnapshotOrderCount) : "讀取中"} accent={(profitSummary?.missingSnapshotOrderCount ?? 0) > 0} />
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
          <div className="bg-white rounded-2xl p-4 border border-border">
            <h2 className="text-sm font-semibold text-foreground mb-3">訂單狀態分佈</h2>
            <div className="space-y-2">
              {stats.statusBreakdown.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          {skillVisibility.isVisible("products") && (
            <ActionCard
              label="管理商品"
              desc="新增、編輯商品"
              icon="📦"
              onClick={() => setLocation("/products")}
            />
          )}
          {skillVisibility.isVisible("orders") && (
            <ActionCard
              label="查看訂單"
              desc="管理所有訂單"
              icon="📋"
              onClick={() => setLocation("/orders")}
            />
          )}
          <ActionCard
            label="店鋪設定"
            desc="名稱、簡介"
            icon="⚙"
            onClick={() => setLocation("/settings")}
          />
          {skillVisibility.isVisible("logistics") && (
            <ActionCard
              label="物流匯入"
              desc="上傳 7-11 / 全家 Excel"
              icon="🚚"
              onClick={() => setLocation("/logistics/import")}
            />
          )}
          {skillVisibility.isVisible("logistics") && (
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
          )}
          {skillVisibility.isVisible("guide") && (
            <ActionCard
              label="使用說明"
              desc="如何開始接單"
              icon="📖"
              onClick={() => setLocation("/guide")}
            />
          )}
        </div>

        {/* Recent orders */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">低庫存提醒</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                庫存 ≤ {LOW_STOCK_THRESHOLD}（建議值，可調）；未設定庫存不追蹤。
              </p>
            </div>
            <button type="button" onClick={() => setLocation("/products")} className="text-xs font-medium text-primary">
              管理商品 ›
            </button>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">目前沒有低庫存商品</p>
          ) : (
            <div className="mt-3 space-y-2">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium text-amber-950">{product.name}</span>
                  <span className="shrink-0 text-sm font-bold text-amber-800">剩 {product.inventory}</span>
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="text-xs text-muted-foreground">另有 {lowStockProducts.length - 5} 件，請到商品頁查看。</p>
              )}
            </div>
          )}
        </section>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">最近 10 筆訂單</h2>
            <button
              onClick={() => setLocation("/orders")}
              className="text-xs text-primary font-medium"
            >
              查看全部
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-border text-center">
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
                <div key={o.id} className="bg-white rounded-2xl p-4 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">{o.buyerName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{o.productName}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">x{o.quantity}</span>
                    <span className="text-sm font-semibold text-foreground">${Number(o.totalPrice).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <BottomNav active="dashboard" />
    </div>
  );
}

function OwnerMetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? "border-amber-200 bg-amber-50" : "border-border bg-white"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ? "text-amber-800" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function StatCard({ label, value, accent, onClick }: { label: string; value: string | number; accent?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-3 border ${accent ? "bg-primary/10 border-primary/20" : "bg-white border-border"} ${onClick ? "cursor-pointer active:opacity-75 transition-opacity" : ""}`}
    >
      <div className={`text-xs mb-1 ${accent ? "text-primary" : "text-muted-foreground"}`}>{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ActionCard({ label, desc, icon, badge, onClick }: { label: string; desc: string; icon: string; badge?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-4 border border-border text-left active:bg-secondary transition-colors relative"
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 max-w-[45%] truncate">
          {badge}
        </span>
      )}
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-foreground text-sm">{label}</div>
      <div className={`text-xs mt-0.5 ${badge ? "text-red-600" : "text-muted-foreground"}`}>{desc}</div>
    </button>
  );
}

export function BottomNav({ active }: { active: "dashboard" | "products" | "orders" | "settings" }) {
  const [, setLocation] = useLocation();
  const skillVisibility = useDailySkillVisibility();
  const items = [
    { key: "dashboard", label: "首頁", path: "/dashboard", icon: "○", surface: "dashboard" as const },
    { key: "products", label: "商品", path: "/products", icon: "◻", surface: "products" as const },
    { key: "orders", label: "訂單", path: "/orders", icon: "≡", surface: "orders" as const },
    { key: "settings", label: "設定", path: "/settings", icon: "⊙", surface: "settings" as const },
  ].filter((item) => skillVisibility.isVisible(item.surface));
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-border px-2 pb-safe">
      <div className="flex">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => setLocation(item.path)}
            className={`flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${
              active === item.key ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <span className="text-lg leading-none mb-0.5">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
