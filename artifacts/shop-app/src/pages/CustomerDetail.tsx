import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { maskAddress, maskName, maskPhone } from "@workspace/privacy";
import { useLocation } from "wouter";
import { BottomNav } from "./Dashboard";
import { recordServerAuditEvent } from "@/lib/serverAudit";

interface CustomerRecord {
  id: number;
  storeId: number;
  code: string;
  name: string;
  phone: string | null;
  tier: "general" | "vip" | "wholesale" | "partner";
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  notes: string | null;
}

interface CustomerOrderRecord {
  id: number;
  productName: string;
  quantity: number;
  status: string;
  createdAt: string;
  profit: {
    status: "captured" | "exempt" | "pending" | "missing";
    label: string;
    amountTwd: string | null;
    scope: "unit" | "order";
  };
}

const inputClass = "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm";

export default function CustomerDetailPage({ customerId }: { customerId: number }) {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [orders, setOrders] = useState<CustomerOrderRecord[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cvsDraft, setCvsDraft] = useState({ id: "", name: "", address: "", phone: "" });

  const load = async () => {
    if (!store?.id) return;
    const token = await getToken();
    const response = await fetch(`/api/stores/${store.id}/customers/${customerId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("無法讀取客戶詳情");
    const payload = await response.json() as { customer: CustomerRecord; orders: CustomerOrderRecord[] };
    setCustomer(payload.customer);
    setOrders(payload.orders);
    setCvsDraft({
      id: payload.customer.cvsStoreId ?? "",
      name: payload.customer.cvsStoreName ?? "",
      address: payload.customer.cvsStoreAddress ?? "",
      phone: payload.customer.cvsStorePhone ?? "",
    });
  };

  useEffect(() => {
    void load().catch((caught) => setError((caught as Error).message));
  }, [store?.id, customerId]);

  const reveal = async () => {
    if (!customer || !store?.id) return;
    try {
      await recordServerAuditEvent({
        storeId: store.id,
        action: "reveal_customer_pii",
        target: `customer:${customer.id}`,
        getToken,
      });
      setRevealed(true);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const saveCvs = async () => {
    if (!store?.id || !customer) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(`/api/stores/${store.id}/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          code: customer.code,
          name: customer.name,
          phone: customer.phone,
          tier: customer.tier,
          cvsStoreId: cvsDraft.id || null,
          cvsStoreName: cvsDraft.name || null,
          cvsStoreAddress: cvsDraft.address || null,
          cvsStorePhone: cvsDraft.phone || null,
          notes: customer.notes,
        }),
      });
      if (!response.ok) throw new Error("常用門市儲存失敗");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!customer && !error) return <div className="min-h-[100dvh] bg-background flex items-center justify-center">載入中…</div>;

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <button type="button" onClick={() => setLocation("/customers")} className="text-sm font-medium text-primary">‹ 返回客戶列表</button>
        <h1 className="mt-2 text-lg font-bold">客戶詳情</h1>
      </header>
      <main className="space-y-4 p-5">
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-destructive">{error}</p>}
        {customer && (
          <>
            <section className="space-y-2 rounded-2xl border border-border bg-white p-4">
              <p className="text-xs text-muted-foreground">{customer.code}</p>
              <h2 className="font-semibold">{revealed ? customer.name : maskName(customer.name)}</h2>
              <p className="text-sm text-muted-foreground">{customer.phone ? (revealed ? customer.phone : maskPhone(customer.phone)) : "未留電話"}</p>
              <p className="text-sm">等級：{{ general: "一般", vip: "VIP", wholesale: "批發", partner: "夥伴" }[customer.tier]}</p>
              {customer.notes && <p className="text-sm text-muted-foreground">備註：{customer.notes}</p>}
              {!revealed && <button type="button" onClick={() => void reveal()} className="min-h-11 rounded-xl border border-border px-4 text-sm">顯示完整</button>}
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
              <div><h2 className="font-semibold">常用門市</h2><p className="text-xs text-muted-foreground">後台建單選擇此客戶時會自動帶入；手動選擇仍優先。</p></div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="門市代碼" value={cvsDraft.id} onChange={(event) => setCvsDraft({ ...cvsDraft, id: event.target.value })} />
                <input className={inputClass} placeholder="門市名稱" value={cvsDraft.name} onChange={(event) => setCvsDraft({ ...cvsDraft, name: event.target.value })} />
              </div>
              <input className={inputClass} placeholder="門市地址" value={cvsDraft.address} onChange={(event) => setCvsDraft({ ...cvsDraft, address: event.target.value })} />
              <input className={inputClass} placeholder="門市電話" value={cvsDraft.phone} onChange={(event) => setCvsDraft({ ...cvsDraft, phone: event.target.value })} />
              {customer.cvsStoreAddress && <p className="text-xs text-muted-foreground">目前：{revealed ? customer.cvsStoreAddress : maskAddress(customer.cvsStoreAddress)}</p>}
              <button type="button" disabled={saving} onClick={() => void saveCvs()} className="min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50">{saving ? "儲存中…" : "儲存常用門市"}</button>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">訂單歷史</h2>
              {orders.map((order) => (
                <article key={order.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex justify-between gap-3"><p className="font-medium">#{order.id} · {order.productName}</p><p className="text-xs text-muted-foreground">{order.quantity} 件</p></div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("zh-TW")}</p>
                  <p className={`mt-2 text-sm font-semibold ${order.profit.amountTwd === null ? "text-amber-700" : "text-foreground"}`}>
                    {order.profit.label}{order.profit.amountTwd === null ? "" : `：NT$${order.profit.amountTwd}${order.profit.scope === "unit" ? "／件" : ""}`}
                  </p>
                </article>
              ))}
              {orders.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">這位客戶尚無綁定訂單</p>}
            </section>
          </>
        )}
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
