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

export default function ProductsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, isLoading } = useListProducts(storeId!, { query: { enabled: !!storeId } as any });
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const copyLink = (shareToken: string, id: number) => {
    if (!navigator.clipboard) return;
    const url = `${origin}${basePath}/p/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  const previewProduct = (shareToken: string) => {
    const url = `${origin}${basePath}/p/${shareToken}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const toggleActive = async (p: any) => {
    await updateProduct.mutateAsync({
      storeId: storeId!,
      productId: p.id,
      data: { isActive: !p.isActive },
    });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
  };

  const handleDelete = async (productId: number) => {
    if (!confirm("確定要刪除這個商品嗎？")) return;
    await deleteProduct.mutateAsync({ storeId: storeId!, productId });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">商品管理</h1>
          <button
            onClick={() => setLocation("/products/new")}
            className="h-9 px-4 bg-primary text-white text-sm font-semibold rounded-xl"
          >
            + 新增
          </button>
        </div>
      </header>

      <div className="px-5 py-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !products || products.length === 0 ? (
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
          <div className="space-y-3">
            {products.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                {/* Product info row */}
                <div className="flex gap-3 p-4">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 text-2xl">
                      📦
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-foreground truncate">{p.name}</div>
                      <div
                        onClick={() => toggleActive(p)}
                        className={`relative flex-shrink-0 w-10 h-5 rounded-full cursor-pointer transition-colors ${p.isActive ? "bg-primary" : "bg-gray-200"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                      </div>
                    </div>
                    <div className="text-primary font-bold mt-0.5">${Number(p.price).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      庫存：{p.inventory ?? "不限"} · {p.isActive ? "開放下單" : "已關閉"}
                    </div>
                  </div>
                </div>

                {/* Action row 1: sharing (primary actions) */}
                <div className="border-t border-border flex">
                  <button
                    onClick={() => copyLink(p.shareToken, p.id)}
                    className="flex-1 py-3 text-xs text-primary font-medium text-center border-r border-border"
                  >
                    {copiedId === p.id ? "已複製連結" : "複製下單連結"}
                  </button>
                  <button
                    onClick={() => previewProduct(p.shareToken)}
                    className="flex-1 py-3 text-xs text-foreground font-medium text-center"
                  >
                    預覽公開頁
                  </button>
                </div>

                {/* Action row 2: management */}
                <div className="border-t border-border flex">
                  <button
                    onClick={() => setLocation(`/products/${p.id}/edit`)}
                    className="flex-1 py-2.5 text-xs text-muted-foreground font-medium text-center border-r border-border"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="flex-1 py-2.5 text-xs text-destructive font-medium text-center"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="products" />
    </div>
  );
}
