import { useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useListProducts, useUpdateProduct, useDeleteProduct, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";

const ONBOARDING_STEPS = [
  { n: "1", text: "建立商品，設定名稱、售價與庫存" },
  { n: "2", text: "複製商品專屬下單連結，傳給買家" },
  { n: "3", text: "訂單自動進來，在「訂單管理」確認並更新狀態" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-border px-3 py-3 text-center">
      <p className="text-base font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function ProductsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, isLoading } = useListProducts(storeId!, { query: { enabled: !!storeId } as any });
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleActive = async (p: any) => {
    await updateProduct.mutateAsync({
      storeId: storeId!,
      productId: p.id,
      data: { isActive: !p.isActive },
    });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
  };

  const copyLink = (shareToken: string, id: number) => {
    if (!navigator.clipboard) return;
    const url = `${origin}${basePath}/p/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => { setCopiedId(null); setOpenMenuId(null); }, 1500);
    }).catch(() => {});
  };

  const previewProduct = (shareToken: string) => {
    const url = `${origin}${basePath}/p/${shareToken}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (productId: number) => {
    if (!confirm("確定要刪除這個商品嗎？")) return;
    await deleteProduct.mutateAsync({ storeId: storeId!, productId });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
  };

  const totalCount = products?.length ?? 0;
  const activeCount = products?.filter((p) => p.isActive).length ?? 0;
  const avgPrice =
    totalCount > 0
      ? Math.round(products!.reduce((sum, p) => sum + Number(p.price), 0) / totalCount)
      : 0;

  const filteredProducts = (products ?? [])
    .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    .filter((p) => {
      if (activeFilter === "active") return p.isActive;
      if (activeFilter === "inactive") return !p.isActive;
      return true;
    });

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">

      {/* Header */}
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-foreground">商品</h1>
        <p className="text-xs text-muted-foreground mt-0.5">管理商品、定價與規格</p>
      </header>

      {/* Backdrop — closes open menu when clicking outside */}
      {openMenuId !== null && (
        <div
          className="fixed inset-0 z-[15]"
          onClick={() => setOpenMenuId(null)}
        />
      )}

      <div className="px-5 py-5 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !products || products.length === 0 ? (

          /* ── Empty / onboarding ──────────────────────────── */
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-4">📦</div>
              <p className="text-foreground font-semibold text-base">還沒有商品</p>
              <p className="text-muted-foreground text-sm mt-1 mb-6">開始接單只需要三步</p>
              <div className="text-left space-y-3 mb-7">
                {ONBOARDING_STEPS.map((s) => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {s.n}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setLocation("/products/new")}
                className="h-11 px-8 bg-primary text-white text-sm font-semibold rounded-xl"
              >
                建立第一個商品
              </button>
            </div>
          </div>

        ) : (
          <>
            {/* ── Search ───────────────────────────────────── */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋商品名稱"
              className="w-full h-11 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
            />

            {/* ── Filter bar ───────────────────────────────── */}
            <div className="flex gap-2">
              {(["all", "active", "inactive"] as const).map((f) => {
                const labels: Record<typeof f, string> = {
                  all: "全部",
                  active: "開放下單",
                  inactive: "已關閉",
                };
                const isSelected = activeFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={`h-8 px-3 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>

            {/* ── Stats ────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="總商品" value={totalCount} />
              <StatCard label="開放下單" value={activeCount} />
              <StatCard label="平均售價" value={`NT$${avgPrice.toLocaleString()}`} />
            </div>

            {/* ── Product list ─────────────────────────────── */}
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">找不到符合條件的商品</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map((p) => (
                  /* Outer relative wrapper for dropdown positioning */
                  <div key={p.id} className="relative">

                    {/* Card — no overflow-hidden so dropdown can float out */}
                    <div
                      onClick={() => { setOpenMenuId(null); setLocation(`/products/${p.id}/edit`); }}
                      className="bg-white rounded-2xl border border-border cursor-pointer active:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 p-4">
                        {/* Image */}
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 text-xl">
                            📦
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm line-clamp-2">{p.name}</p>
                          <p className="text-primary font-bold text-sm mt-0.5">
                            NT$ {Number(p.price).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            庫存：{p.inventory ?? "不限"} · {p.isActive ? "開放下單" : "已關閉"}
                          </p>
                        </div>

                        {/* Right: isActive switch + ⋯ menu button — fixed width prevents content squeeze */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 w-[80px] justify-end">
                          {/* isActive switch */}
                          <div
                            onClick={(e) => { e.stopPropagation(); void toggleActive(p); }}
                            className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${
                              p.isActive ? "bg-primary" : "bg-gray-200"
                            }`}
                          >
                            <div
                              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                p.isActive ? "translate-x-5" : "translate-x-0.5"
                              }`}
                            />
                          </div>

                          {/* ⋯ more button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === p.id ? null : p.id);
                            }}
                            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors z-[16] relative"
                          >
                            ⋯
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Dropdown menu */}
                    {openMenuId === p.id && (
                      <div className="absolute right-0 top-full mt-1 z-[20] bg-white rounded-xl border border-border shadow-lg min-w-[152px] overflow-hidden">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(p.shareToken, p.id);
                          }}
                          className="w-full px-4 py-3 text-sm text-left text-foreground hover:bg-secondary/50 transition-colors"
                        >
                          {copiedId === p.id ? "✓ 已複製" : "複製下單連結"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            previewProduct(p.shareToken);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-4 py-3 text-sm text-left text-foreground hover:bg-secondary/50 transition-colors"
                        >
                          預覽公開頁
                        </button>
                        <div className="border-t border-border/50" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            void handleDelete(p.id);
                          }}
                          className="w-full px-4 py-3 text-sm text-left text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          刪除商品
                        </button>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB: + 新增 */}
      <button
        onClick={() => setLocation("/products/new")}
        className="fixed bottom-28 right-5 w-12 h-12 bg-primary text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-20"
        aria-label="新增商品"
      >
        +
      </button>

      <BottomNav active="products" />
    </div>
  );
}
