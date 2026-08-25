import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  loadCvsStore,
  parseCvsParamsFromUrl,
  saveCvsStore,
} from "@/lib/cvs711";
import { useAuth } from "@clerk/react";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import { formatActionableError } from "@/lib/actionableError";

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

      if (
        !store?.storeId?.trim() ||
        !store.storeName?.trim() ||
        !store.storeAddress?.trim()
      ) {
        setErrorMsg(
          "門市資料待確認：店號、門市名稱或地址尚未完整回傳，沒有以空白資料儲存。請返回重新選擇門市。",
        );
        setStatus("error");
        return;
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
            setErrorMsg(
              formatActionableError({
                happened: "門市資料沒有更新。",
                reason: data?.error ?? "系統暫時沒有接受門市資料。",
                action: "請返回並重新選擇門市。",
                support: "若仍失敗，請稍後回到訂單頁再試。",
              }),
            );
            setStatus("error");
            return;
          }
        } catch (updateError) {
          setErrorMsg(
            formatActionableError({
              happened: "門市資料沒有更新。",
              reason:
                updateError instanceof Error
                  ? updateError.message
                  : "網路暫時沒有回應。",
              action: "請確認網路連線後返回重選。",
              support: "若仍失敗，請稍後回到訂單頁再試。",
            }),
          );
          setStatus("error");
          return;
        }
      } else {
        // Customer flow: save to localStorage with shareToken or generic key
        const storageKey = shareToken ?? "pending";
        saveCvsStore(storageKey, store);
        const savedStore = loadCvsStore(storageKey);
        if (
          !savedStore ||
          savedStore.storeId !== store.storeId ||
          savedStore.storeName !== store.storeName ||
          savedStore.storeAddress !== store.storeAddress
        ) {
          setErrorMsg(
            "門市資料沒有儲存：瀏覽器儲存空間可能停用或已滿。請允許網站儲存資料後返回重選。",
          );
          setStatus("error");
          return;
        }
      }

      setLocation(returnPath, { replace: true });
    })();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="min-h-[100dvh] bg-background px-5 py-8">
        <SemanticStatePanel
          className="mx-auto max-w-sm"
          state={{
            kind: "pageError",
            title: "門市選擇未完成",
            message: errorMsg,
            retry: {
              label: "返回重新選擇",
              onAction: () => window.history.back(),
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8">
      <SemanticStatePanel
        className="mx-auto max-w-sm"
        state={{
          kind: "loading",
          label: "正在確認門市資料",
          fallbackMessage: "完成後會自動返回上一個流程，請勿關閉此頁。",
        }}
      />
    </div>
  );
}
