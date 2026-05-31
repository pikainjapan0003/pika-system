import { useLocation } from "wouter";
import { useGetMyStore, useGetStoreStats, useListOrders } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { STATUS_LABELS, STATUS_COLORS } from "../lib/orderStatus";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: store } = useGetMyStore();
  const storeId = store?.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = useGetStoreStats(storeId!, { query: { enabled: !!storeId } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = useListOrders(storeId!, { query: { enabled: !!storeId } as any });

  const recentOrders = orders ? [...orders].reverse().slice(0, 5) : [];

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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="總訂單" value={stats?.totalOrders ?? 0} />
          <StatCard label="待確認" value={stats?.pendingOrders ?? 0} accent onClick={() => setLocation("/orders")} />
          <StatCard label="總金額" value={`$${(stats?.totalRevenue ?? 0).toLocaleString()}`} />
        </div>

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
            label="使用說明"
            desc="如何開始接單"
            icon="📖"
            onClick={() => setLocation("/guide")}
          />
        </div>

        {/* Recent orders */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">最新訂單</h2>
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

function ActionCard({ label, desc, icon, onClick }: { label: string; desc: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-4 border border-border text-left active:bg-secondary transition-colors"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-foreground text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </button>
  );
}

export function BottomNav({ active }: { active: "dashboard" | "products" | "orders" | "settings" }) {
  const [, setLocation] = useLocation();
  const items = [
    { key: "dashboard", label: "首頁", path: "/dashboard", icon: "○" },
    { key: "products", label: "商品", path: "/products", icon: "◻" },
    { key: "orders", label: "訂單", path: "/orders", icon: "≡" },
    { key: "settings", label: "設定", path: "/settings", icon: "⊙" },
  ];
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
