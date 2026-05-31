import { useState, useEffect } from "react";
import { useGetMyStore, useUpdateStore, getGetMyStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: store, isLoading } = useGetMyStore();
  const updateStore = useUpdateStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (store) {
      setName(store.name);
      setDescription(store.description ?? "");
    }
  }, [store]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!name.trim()) {
      setError("店鋪名稱不能空白");
      return;
    }
    if (!store) return;
    try {
      await updateStore.mutateAsync({
        storeId: store.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: getGetMyStoreQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.data?.error ?? "儲存失敗，請稍後再試");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">店鋪設定</h1>
      </header>

      <div className="px-5 py-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪名稱
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                網址代碼
              </label>
              <div className="h-12 px-4 rounded-xl border border-input bg-secondary text-muted-foreground flex items-center text-sm">
                {store?.slug}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                網址代碼建立後無法修改
              </p>
            </div>

            <ProductLinkInfo />

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪簡介（選填）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="簡單介紹您的店鋪..."
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={updateStore.isPending}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
            >
              {saved ? "已儲存！" : updateStore.isPending ? "儲存中..." : "儲存設定"}
            </button>
          </form>
        )}
      </div>

      <BottomNav active="settings" />
    </div>
  );
}

function ProductLinkInfo() {
  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-blue-900">商品公開連結說明</p>
      <p className="text-xs text-blue-700 leading-relaxed">
        每個商品都有自己的下單連結，格式如下：
      </p>
      <div className="bg-white border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-xs text-foreground font-mono break-all">
          {origin}{basePath}/p/&#123;商品追蹤碼&#125;
        </p>
      </div>
      <p className="text-xs text-blue-700 leading-relaxed">
        你可以在「商品管理」頁面複製每個商品的下單連結，傳給買家下單。
      </p>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
