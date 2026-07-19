import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { parseCvsParamsFromUrl, saveCvsStore } from "@/lib/cvs711";
import { useAuth } from "@clerk/react";

export default function Cvs711ReturnPage() {
  const rawSearch = useSearch();
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(rawSearch);
      const returnPath = params.get("returnPath") ?? "/";
      const source = params.get("source") as "customer" | "admin" | null;
      const orderId = params.get("orderId");
      const shareToken = params.get("shareToken");

      const store = parseCvsParamsFromUrl(params);

      if (!store || !store.storeId) {
        setErrorMsg("門市資料不完整，請重新選擇門市");
        setStatus("error");
        return;
      }

      if (!store.storeAddress) {
        // Allow proceed but the address may be empty; UI shows a warning
        store.storeAddress = "";
      }

      if (source === "admin" && orderId) {
        // Admin flow: update order CVS data via API
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
            setErrorMsg(data?.error ?? "更新門市資料失敗，請稍後再試");
            setStatus("error");
            return;
          }
        } catch {
          setErrorMsg("更新門市資料失敗，請確認網路連線");
          setStatus("error");
          return;
        }
      } else {
        // Customer flow: save to localStorage with shareToken or generic key
        const storageKey = shareToken ?? "pending";
        saveCvsStore(storageKey, store);
      }

      setLocation(returnPath, { replace: true });
    })();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <p className="font-medium text-foreground">{errorMsg}</p>
          <button
            onClick={() => window.history.back()}
            className="w-full h-11 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
