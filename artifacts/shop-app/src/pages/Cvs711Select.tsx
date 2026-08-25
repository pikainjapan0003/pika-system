import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { loadCvsStore, saveCvsStore } from "@/lib/cvs711";
import { getCvsStoreFreshness } from "@/lib/cvsStoreFreshness";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import { formatActionableError } from "@/lib/actionableError";

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

type Provider = "seven" | "family";

const PROVIDER_CONFIG: Record<
  Provider,
  { title: string; placeholder: string; prefix: string }
> = {
  seven: {
    title: "選擇 7-11 門市",
    placeholder: "輸入門市名稱、店號或地址",
    prefix: "7-11",
  },
  family: {
    title: "選擇全家門市",
    placeholder: "輸入全家門市名稱、電話或地址",
    prefix: "全家",
  },
};

export default function Cvs711SelectPage() {
  const rawSearch = useSearch();
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();

  const params = new URLSearchParams(rawSearch);
  const source = (params.get("source") ?? "customer") as "customer" | "admin";
  const orderId = params.get("orderId");
  const returnTo = params.get("returnTo") ?? "/";
  const shareToken = params.get("shareToken");
  const providerParam = params.get("provider");
  const provider: Provider = providerParam === "family" ? "family" : "seven";
  const config = PROVIDER_CONFIG[provider];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CvsStoreResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [apiError, setApiError] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    doSearch("");
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(q: string) {
    setIsLoading(true);
    setApiError("");
    setHasSearched(true);
    try {
      const qs = new URLSearchParams({ provider, q, limit: "20" });
      const res = await fetch(`/api/cvs/stores?${qs}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setApiError(
          formatActionableError({
            happened: "門市查詢沒有完成。",
            reason:
              payload?.error ??
              payload?.message ??
              `系統回應狀態 ${res.status}。`,
            action: "請保留目前關鍵字並重新查詢。",
            support: "若仍失敗，請返回上一頁後再試一次。",
          }),
        );
        return;
      }
      const data = await res.json();
      setResults(Array.isArray(data.stores) ? data.stores : []);
    } catch (searchError) {
      setApiError(
        formatActionableError({
          happened: "門市查詢沒有完成。",
          reason:
            searchError instanceof Error
              ? searchError.message
              : "網路或系統暫時沒有回應。",
          action: "請確認網路連線後重新查詢。",
          support: "若仍失敗，請返回上一頁後再試一次。",
        }),
      );
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

    if (
      !store.storeId?.trim() ||
      !store.storeName?.trim() ||
      !store.storeAddress?.trim()
    ) {
      setSelectError(
        "門市資料待確認：店號、門市名稱或地址尚未完整回傳，請改選其他門市或重新查詢。",
      );
      setSelectingId(null);
      return;
    }

    const storeData = {
      provider,
      storeId: store.storeId,
      storeName: store.storeName,
      storeAddress: store.storeAddress,
      storePhone: store.storePhone,
    };

    if (source === "admin" && orderId) {
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
          setSelectError(
            formatActionableError({
              happened: "門市沒有更新。",
              reason: data?.error ?? "系統暫時沒有接受這次選擇。",
              action: "請重新選擇一次。",
              support: "若仍失敗，請返回訂單頁稍後再試。",
            }),
          );
          setSelectingId(null);
          return;
        }
      } catch (selectStoreError) {
        setSelectError(
          formatActionableError({
            happened: "門市沒有更新。",
            reason:
              selectStoreError instanceof Error
                ? selectStoreError.message
                : "網路暫時沒有回應。",
            action: "請確認網路連線後重新選擇。",
            support: "若仍失敗，請返回訂單頁稍後再試。",
          }),
        );
        setSelectingId(null);
        return;
      }

      setLocation(returnTo, { replace: true });
    } else {
      const storageKey = shareToken ?? "pending";
      saveCvsStore(storageKey, storeData);
      const savedStore = loadCvsStore(storageKey);
      if (
        !savedStore ||
        savedStore.storeId !== storeData.storeId ||
        savedStore.storeName !== storeData.storeName ||
        savedStore.storeAddress !== storeData.storeAddress
      ) {
        setSelectError(
          "門市沒有儲存：瀏覽器儲存空間可能停用或已滿。請允許網站儲存資料後重新選擇。",
        );
        setSelectingId(null);
        return;
      }
      setLocation(returnTo, { replace: true });
    }
  };

  const formatUpdatedAt = (iso: string | null): string => {
    if (!iso) return "待確認（來源未提供更新時間）";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime()))
      return "待確認（來源提供的更新時間無效）";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">
      {/* Sticky header */}
      <div className="bg-card border-b border-border px-5 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setLocation(returnTo, { replace: true })}
            className="min-h-11 min-w-11 text-muted-foreground text-sm"
            aria-label="返回上一頁"
          >
            ←
          </button>
          <h1 className="text-base font-bold text-foreground">
            {config.title}
          </h1>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <label htmlFor="cvs-store-query" className="sr-only">
            搜尋{config.prefix}門市
          </label>
          <input
            id="cvs-store-query"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={config.placeholder}
            className="flex-1 min-h-11 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
          >
            {isLoading ? "搜尋中…" : "搜尋"}
          </button>
        </form>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Select error */}
        {selectError && (
          <SemanticStatePanel
            state={{
              kind: "inlineError",
              title: "門市選擇未完成",
              message: selectError,
            }}
          />
        )}

        {/* Results */}
        {!hasSearched || (isLoading && results.length === 0) ? (
          <SemanticStatePanel
            state={{
              kind: "loading",
              label: "正在查詢門市",
              fallbackMessage: "若等待時間過長，請確認網路連線後重新搜尋。",
            }}
          />
        ) : apiError && results.length === 0 ? (
          <SemanticStatePanel
            state={{
              kind: "pageError",
              title: "門市查詢失敗",
              message: apiError,
              retry: {
                label: isLoading ? "重新查詢中…" : "重新查詢",
                onAction: () => void doSearch(query.trim()),
                busy: isLoading,
              },
            }}
          />
        ) : hasSearched && results.length === 0 ? (
          <div className="space-y-3">
            <SemanticStatePanel
              state={{
                kind: "emptyAction",
                title: `找不到符合的${config.prefix}門市`,
                reason: query.trim()
                  ? "目前關鍵字沒有結果。可清除條件顯示全部門市，再縮小範圍。"
                  : "門市來源目前沒有可顯示資料，請重新載入一次。",
                action: {
                  label: query.trim() ? "清除條件並顯示全部" : "重新載入全部",
                  onAction: () => {
                    setQuery("");
                    void doSearch("");
                  },
                },
              }}
            />
            {provider === "seven" && (
              <button
                type="button"
                onClick={handleUseTestStore}
                disabled={selectingId !== null}
                className="min-h-11 w-full rounded-xl border border-primary/30 px-3 text-xs font-medium text-primary disabled:opacity-60"
              >
                測試用：使用懷民門市
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {isLoading && (
              <SemanticStatePanel
                state={{
                  kind: "refreshing",
                  label: "正在更新門市結果",
                  lastUpdatedLabel: "目前先保留上一批查詢結果。",
                  content: null,
                }}
              />
            )}
            {apiError && (
              <SemanticStatePanel
                state={{
                  kind: "inlineError",
                  title: "最新查詢未完成",
                  message: apiError,
                  action: {
                    label: "重新查詢",
                    onAction: () => void doSearch(query.trim()),
                    busy: isLoading,
                  },
                }}
              />
            )}
            {results.length > 0 && (
              <p className="text-xs text-muted-foreground px-1 tabular-nums lining-nums">
                找到 {results.length} 間門市
              </p>
            )}
            {results.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                providerPrefix={config.prefix}
                isSelecting={selectingId === store.storeId}
                selectionInProgress={selectingId !== null}
                onSelect={() => handleSelectStore(store)}
                formatUpdatedAt={formatUpdatedAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StoreCard({
  store,
  providerPrefix,
  isSelecting,
  selectionInProgress,
  onSelect,
  formatUpdatedAt,
}: {
  store: CvsStoreResult;
  providerPrefix: string;
  isSelecting: boolean;
  selectionInProgress: boolean;
  onSelect: () => void;
  formatUpdatedAt: (iso: string | null) => string;
}) {
  const freshness = getCvsStoreFreshness(store.sourceUpdatedAt);
  const hasRequiredStoreData = Boolean(
    store.storeId?.trim() &&
    store.storeName?.trim() &&
    store.storeAddress?.trim(),
  );

  return (
    <div className="bg-card rounded-2xl border border-border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {providerPrefix} {store.storeName || "門市名稱待確認（來源未提供）"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {store.storeAddress || "門市地址待確認（來源未提供）"}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-muted-foreground/70">
              門市編號：
              {store.storeId || "待確認（來源未提供）"}
            </span>
            {store.businessHours && (
              <span className="text-xs text-muted-foreground/70">
                營業時間：{store.businessHours}
              </span>
            )}
          </div>
          {store.deliveryStatus && (
            <div className="text-xs text-muted-foreground/70">
              配送狀態：{store.deliveryStatus}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            資料更新：{formatUpdatedAt(store.sourceUpdatedAt)}
          </div>
          {freshness.label && (
            <div
              className={
                freshness.level === "verify_first"
                  ? "text-xs font-semibold text-destructive mt-1"
                  : "text-xs font-medium text-accent mt-1"
              }
            >
              {freshness.label}
            </div>
          )}
          {!hasRequiredStoreData && (
            <div className="text-xs font-bold text-accent mt-1" role="status">
              資料待確認：店號、名稱或地址不完整，暫時無法選取。
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        disabled={selectionInProgress || !hasRequiredStoreData}
        aria-busy={isSelecting || undefined}
        className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 transition-opacity"
      >
        {isSelecting
          ? "登記中…"
          : hasRequiredStoreData
            ? "選擇此門市"
            : "門市資料待確認"}
      </button>
    </div>
  );
}
