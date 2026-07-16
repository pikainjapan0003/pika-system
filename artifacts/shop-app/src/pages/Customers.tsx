import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { maskAddress, maskName, maskPhone } from "@workspace/db/privacy";
import { BottomNav } from "./Dashboard";

interface CustomerRecord {
  id: number;
  storeId: number;
  code: string;
  name: string;
  phone: string;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  notes: string | null;
}

type CustomerDraft = Omit<CustomerRecord, "id" | "storeId">;

const blankDraft: CustomerDraft = {
  code: "",
  name: "",
  phone: "",
  cvsStoreId: null,
  cvsStoreName: null,
  cvsStoreAddress: null,
  cvsStorePhone: null,
  notes: null,
};

const inputClass = "w-full h-10 px-3 rounded-xl border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function CustomersPage() {
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [draft, setDraft] = useState<CustomerDraft>(blankDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/stores/${store.id}/customers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("無法讀取客戶資料");
      setCustomers(await response.json() as CustomerRecord[]);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCustomers(); }, [store?.id]);

  const save = async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const url = editingId
        ? `/api/stores/${store.id}/customers/${editingId}`
        : `/api/stores/${store.id}/customers`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(draft),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "儲存失敗");
      setDraft(blankDraft);
      setEditingId(null);
      await loadCustomers();
    } catch (caught) {
      setError((caught as Error).message);
      setLoading(false);
    }
  };

  const reveal = (customer: CustomerRecord) => {
    console.info("[privacy-audit] reveal_customer_pii", {
      customerId: customer.id,
      storeId: customer.storeId,
      occurredAt: new Date().toISOString(),
    });
    setRevealed((current) => new Set(current).add(customer.id));
  };

  const edit = (customer: CustomerRecord) => {
    setEditingId(customer.id);
    setDraft({
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      cvsStoreId: customer.cvsStoreId,
      cvsStoreName: customer.cvsStoreName,
      cvsStoreAddress: customer.cvsStoreAddress,
      cvsStorePhone: customer.cvsStorePhone,
      notes: customer.notes,
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold">客戶管理</h1>
        <p className="text-xs text-muted-foreground mt-1">預設遮罩；顯示完整資料會留下瀏覽器稽核紀錄。</p>
      </header>

      <main className="p-5 space-y-4">
        <section className="bg-white border border-border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold">{editingId ? "編輯客戶" : "新增客戶"}</h2>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="客戶代號 *" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
            <input className={inputClass} placeholder="姓名 *" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <input className={inputClass} placeholder="手機 *" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="常用門市代碼" value={draft.cvsStoreId ?? ""} onChange={(event) => setDraft({ ...draft, cvsStoreId: event.target.value || null })} />
            <input className={inputClass} placeholder="常用門市名稱" value={draft.cvsStoreName ?? ""} onChange={(event) => setDraft({ ...draft, cvsStoreName: event.target.value || null })} />
          </div>
          <input className={inputClass} placeholder="常用門市地址" value={draft.cvsStoreAddress ?? ""} onChange={(event) => setDraft({ ...draft, cvsStoreAddress: event.target.value || null })} />
          <input className={inputClass} placeholder="備註" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} />
          <div className="flex gap-2">
            <button type="button" disabled={loading} onClick={() => void save()} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold">儲存</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(blankDraft); }} className="h-11 px-4 rounded-xl border border-border">取消</button>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </section>

        <section className="space-y-3">
          {customers.map((customer) => {
            const isRevealed = revealed.has(customer.id);
            return (
              <article key={customer.id} className="bg-white border border-border rounded-2xl p-4 space-y-2">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">{customer.code} · {isRevealed ? customer.name : maskName(customer.name)}</p>
                    <p className="text-sm text-muted-foreground">{isRevealed ? customer.phone : maskPhone(customer.phone)}</p>
                  </div>
                  <button type="button" onClick={() => edit(customer)} className="text-sm text-primary">編輯</button>
                </div>
                {customer.cvsStoreName && <p className="text-sm">常用門市：{customer.cvsStoreName}</p>}
                {customer.cvsStoreAddress && <p className="text-xs text-muted-foreground">{isRevealed ? customer.cvsStoreAddress : maskAddress(customer.cvsStoreAddress)}</p>}
                {!isRevealed && <button type="button" onClick={() => reveal(customer)} className="h-11 px-4 rounded-xl border border-border text-sm">顯示完整</button>}
              </article>
            );
          })}
          {!loading && customers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">尚無客戶資料</p>}
        </section>
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
