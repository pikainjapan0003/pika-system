import { useRef, useState } from "react";
import { useAuth } from "@clerk/react";

/** The existing order summary remains the source of displayed, persisted status. */
export function FamilyMartTrackingPanel({ storeId, orderId, trackingCode, onSaved }: {
  storeId: number;
  orderId: number;
  trackingCode?: string | null;
  onSaved: () => Promise<unknown>;
}) {
  const { getToken } = useAuth();
  const [code, setCode] = useState(trackingCode ?? "");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  async function sync() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const token = await getToken();
      if (!token) { setMessage("請先以指定店主帳號登入。"); return; }
      const response = await fetch(`/api/stores/${storeId}/orders/${orderId}/logistics/familymart`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trackingCode: code.trim() }),
      });
      const result = await response.json();
      setMessage(result.message ?? (response.ok ? "貨態已保存。" : "查詢未完成，未自動重試。"));
      // Both success and a recorded query failure must refresh the persisted summary.
      await onSaved();
    } catch {
      setMessage("連線未完成。請重新讀取訂單確認已保存狀態；未自動重送查詢。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="mt-2 rounded-xl border p-3 text-xs" onClick={(event) => event.stopPropagation()}>
      <summary className="cursor-pointer font-medium">全家貨態查詢</summary>
      <p className="my-2 text-muted-foreground">只讀查詢已授權的測試單號，保存貨態；不建立寄件單。</p>
      <label className="block">
        全家單號
        <input aria-label="全家測試單號" className="mt-1 w-full rounded border bg-background p-2"
          value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric"
          maxLength={20} disabled={busy} />
      </label>
      <button type="button" disabled={busy || !/^\d{8,20}$/.test(code.trim())}
        className="mt-2 rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        onClick={() => void sync()}>
        {busy ? "查詢中…" : "查詢並保存貨態"}
      </button>
      {message && <p role="status" className="mt-2">{message}</p>}
    </details>
  );
}
