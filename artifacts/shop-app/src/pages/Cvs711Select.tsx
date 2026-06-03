import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { saveCvsStore } from "@/lib/cvs711";

interface CvsStoreResult {
  provider: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string | null;
  city: string | null;
  district: string | null;
  businessHours: string | null;
  deliveryStatus: string | null;
  sourceUpdatedAt: string | null;
}

const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

export default function Cvs711SelectPage() {
  const rawSearch = useSearch();
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();

  const params = new URLSearchParams(rawSearch);
  const source = (params.get("source") ?? "customer") as "customer" | "admin";
  const orderId = params.get("orderId");
  const returnTo = params.get("returnTo") ?? "/";
  const shareToken = params.get("shareToken");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CvsStoreResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Emap import state
  const [emapQuery, setEmapQuery] = useState("");
  const [emapLoading, setEmapLoading] = useState(false);
  const [emapSuccess, setEmapSuccess] = useState<string | null>(null);
  const [emapError, setEmapError] = useState<string | null>(null);

  // Load initial results (first 20 stores)
  useEffect(() => {
    doSearch("");
    inputRef.current?.focus();
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(q: string) {
    setIsLoading(true);
    setApiError(false);
    setHasSearched(true);
    try {
      const qs = new URLSearchParams({ provider: "seven", q, limit: "20" });
      const res = await fetch(`/api/cvs/stores?${qs}`);
      if (!res.ok) {
        setApiError(true);
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(data.stores ?? []);
    } catch {
      setApiError(true);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query.trim());
  };

  const handleUseTestStore = () => {
    const testStore: CvsStoreResult = {
      provider: "seven",
      storeId: "284754",
      storeName: "懷民門市",
      storeAddress: "新北市板橋區民治街111號",
      storePhone: null,
      city: "新北市",
      district: "板橋區",
      businessHours: "00:00~23:59",
      deliveryStatus: "正常配送",
      sourceUpdatedAt: null,
    };
    handleSelectStore(testStore);
  };

  const handleSelectStore = async (store: CvsStoreResult) => {
    setSelectingId(store.storeId);
    setSelectError(null);

    const storeData = {
      storeId: store.storeId,
      storeName: store.storeName,
      storeAddress: store.storeAddress,
      storePhone: store.storePhone,
    };

    if (source === "admin" && orderId) {
      // Admin flow: call PATCH /api/orders/:orderId/cvs
      try {
        const token = await getToken();
        const res = await fetch(`/api/orders/${orderId}/cvs`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            cvsStoreId: store.storeId,
            cvsStoreName: store.storeName,
            cvsStoreAddress: store.storeAddress,
            cvsStorePhone: store.storePhone ?? null,
            storeSelectedBy: "admin",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSelectError(data?.error ?? "更新門市失敗，請稍後再試");
          setSelectingId(null);
          return;
        }
      } catch {
        setSelectError("網路錯誤，請確認連線後再試");
        setSelectingId(null);
        return;
      }

      setLocation(returnTo, { replace: true });
    } else {
      // Customer flow: save to localStorage and return
      const storageKey = shareToken ?? "pending";
      saveCvsStore(storageKey, storeData);
      setLocation(returnTo, { replace: true });
    }
  };

  const handleEmapImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = emapQuery.trim();
    if (!q) return;
    setEmapLoading(true);
    setEmapSuccess(null);
    setEmapError(null);
    try {
      const res = await fetch("/api/cvs/711/import-from-emap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmapError(data?.error ?? "查詢 7-11 電子地圖失敗，請改用 LeMai 門市搜尋或稍後再試。");
        return;
      }
      const imported = data.store;
      setEmapSuccess(`已匯入 7-11 ${imported.storeName}`);
      // Refresh search with the imported store name so it appears in results
      setQuery(imported.storeName);
      doSearch(imported.storeName);
    } catch {
      setEmapError("查詢 7-11 電子地圖失敗，請改用 LeMai 門市搜尋或稍後再試。");
    } finally {
      setEmapLoading(false);
    }
  };

  const formatUpdatedAt = (iso: string | null): string => {
    if (!iso) return "未記錄";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">
      {/* Header */}
      <div className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setLocation(returnTo, { replace: true })}
            className="text-muted-foreground text-sm"
          >
            ←
          </button>
          <h1 className="text-base font-bold text-foreground">選擇 7-11 門市</h1>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="輸入門市名稱、店號或地址"
            className="flex-1 h-10 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
          >
            {isLoading ? "…" : "搜尋"}
          </button>
        </form>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-700 leading-relaxed">
            目前 LeMai 使用自建門市資料協助快速登記門市。此功能用於訂單門市資料登記，不會建立正式 7-11 物流單。
          </p>
        </div>

        {/* Emap import block */}
        <div className="bg-white rounded-2xl border border-border px-4 py-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">
            從 7-11 電子地圖查詢門市
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            輸入門市名稱後，可嘗試從 7-11 電子地圖查詢並匯入 LeMai 門市資料庫。此功能只用於門市資料登記，不會建立正式物流單。
          </p>
          <form onSubmit={handleEmapImport} className="flex gap-2">
            <input
              type="text"
              value={emapQuery}
              onChange={(e) => { setEmapQuery(e.target.value); setEmapSuccess(null); setEmapError(null); }}
              placeholder="輸入門市名稱，例如：懷民"
              className="flex-1 h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={emapLoading || !emapQuery.trim()}
              className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-xs font-semibold border border-primary/30 disabled:opacity-50"
            >
              {emapLoading ? "查詢中…" : "查詢並匯入"}
            </button>
          </form>
          {emapSuccess && (
            <p className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">{emapSuccess}</p>
          )}
          {emapError && (
            <p className="text-xs text-destructive bg-destructive/5 px-3 py-1.5 rounded-lg">{emapError}</p>
          )}
        </div>

        {/* Error */}
        {selectError && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {selectError}
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : apiError ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">門市查詢暫時無法使用，請稍後再試。</p>
          </div>
        ) : hasSearched && results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              找不到符合的 7-11 門市，請換個關鍵字或開啟官方電子地圖查詢。
            </p>
            <button
              type="button"
              onClick={handleUseTestStore}
              className="text-xs text-primary font-medium border border-primary/30 px-3 py-1.5 rounded-lg"
            >
              測試用：使用懷民門市
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {results.length > 0 && (
              <p className="text-xs text-muted-foreground px-1">找到 {results.length} 間門市</p>
            )}
            {results.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                isSelecting={selectingId === store.storeId}
                onSelect={() => handleSelectStore(store)}
                formatUpdatedAt={formatUpdatedAt}
              />
            ))}
          </div>
        )}

        {/* Auxiliary button */}
        <div className="pt-2 border-t border-border/40">
          <button
            type="button"
            onClick={() => window.open("https://emap.pcsc.com.tw/mobilemap/default.aspx", "_blank")}
            className="w-full h-10 rounded-xl border border-border bg-white text-xs font-medium text-muted-foreground"
          >
            開啟 7-11 官方電子地圖（僅供查詢參考）
          </button>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
            官方地圖僅供查詢，不會自動回寫門市資料
          </p>
        </div>
      </div>
    </div>
  );
}

function StoreCard({
  store,
  isSelecting,
  onSelect,
  formatUpdatedAt,
}: {
  store: CvsStoreResult;
  isSelecting: boolean;
  onSelect: () => void;
  formatUpdatedAt: (iso: string | null) => string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">7-11 {store.storeName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{store.storeAddress}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-muted-foreground/70">門市編號：{store.storeId}</span>
            {store.businessHours && (
              <span className="text-xs text-muted-foreground/70">營業時間：{store.businessHours}</span>
            )}
          </div>
          {store.deliveryStatus && (
            <div className="text-xs text-muted-foreground/70">配送狀態：{store.deliveryStatus}</div>
          )}
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            資料更新：{formatUpdatedAt(store.sourceUpdatedAt)}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        disabled={isSelecting}
        className="w-full h-9 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
      >
        {isSelecting ? "登記中…" : "選擇此門市"}
      </button>
    </div>
  );
}
