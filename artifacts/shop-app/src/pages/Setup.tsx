import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateStore, useGetMyStore, getGetMyStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const createStore = useCreateStore();
  const { data: store, isLoading: storeLoading } = useGetMyStore();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (store) setLocation("/settings");
  }, [store, setLocation]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(val));
    }
  };

  function toSlug(s: string) {
    return s
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");
  }

  if (storeLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !slug.trim()) {
      setError("請填寫店鋪名稱與網址代碼");
      return;
    }
    try {
      await createStore.mutateAsync({ data: { name: name.trim(), slug: slug.trim(), description: description.trim() || undefined } });
      qc.invalidateQueries({ queryKey: getGetMyStoreQueryKey() });
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err?.data?.error || "建立失敗，請稍後再試");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">畫</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">建立您的店鋪</h1>
          <p className="text-muted-foreground text-sm mt-1">設定完成後即可開始新增商品</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">店鋪名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="例：小美代購"
              className="w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">網址代碼</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(toSlug(e.target.value))}
                placeholder="xiao-mei-shop"
                className="flex-1 h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">只能包含英文、數字和連字號</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">店鋪簡介（選填）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="簡單介紹您的店鋪..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base resize-none"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={createStore.isPending}
            className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60 active:opacity-90 transition-opacity"
          >
            {createStore.isPending ? "建立中..." : "建立店鋪"}
          </button>
        </form>
      </div>
    </div>
  );
}
