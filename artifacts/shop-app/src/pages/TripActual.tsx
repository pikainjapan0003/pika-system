import { useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground";

type Category = { id: number; name: string };
type Entry = {
  id: number;
  categoryId: number | null;
  categoryName?: string | null;
  customLabel?: string | null;
  currency: string;
  originalAmount: string;
  occurredOn?: string | null;
  photoUrl?: string | null;
  status: string;
};
type Summary = { categories: Category[]; entries: Entry[]; exchangeRate: string | null };

export default function TripActualPage({ tripId }: { tripId: number }) {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [currency, setCurrency] = useState<"JPY" | "TWD">("TWD");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request(path: string, init?: RequestInit) {
    const token = await getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "無法完成操作");
    return payload;
  }

  async function load() {
    if (!store?.id) return;
    setLoading(true);
    try {
      setSummary(
        (await request(`/api/stores/${store.id}/trips/${tripId}/operating-summary?mode=ACTUAL`)) as Summary,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法載入實際成本");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [store?.id, tripId]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("收據照片必須是圖片");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
  }

  async function uploadPhoto() {
    if (!photoFile || !store?.id) return null;
    const token = await getToken();
    const form = new FormData();
    form.append("image", photoFile);
    const response = await fetch(`/api/stores/${store.id}/products/image`, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json();
    if (!response.ok || typeof payload.imageUrl !== "string") throw new Error("收據上傳失敗");
    return payload.imageUrl as string;
  }

  async function save() {
    if (!store?.id || !summary) return;
    if (!amount.trim() || (!categoryId && !customLabel.trim())) {
      setError("請填寫金額與類別或自訂項目");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const photoUrl = await uploadPhoto();
      await request(`/api/stores/${store.id}/trips/${tripId}/cost-entries`, {
        method: "POST",
        body: JSON.stringify({
          mode: "ACTUAL",
          categoryId: categoryId ? categoryId : null,
          customLabel: categoryId ? null : customLabel.trim(),
          currency,
          originalAmount: amount.trim(),
          occurredOn: occurredOn || null,
          photoUrl,
        }),
      });
      setAmount("");
      setCustomLabel("");
      setPhotoFile(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview("");
      await load();
      setMessage("實際費用已新增");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-3">
          <button type="button" className="min-h-11 text-sm text-primary" onClick={() => setLocation("/trips")}>返回</button>
          <h1 className="flex-1 text-center text-lg font-bold">行程成本｜實際</h1>
          <div className="w-12" />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] space-y-4 px-5 py-5">
        {loading && <p className="text-center text-sm text-muted-foreground">載入中…</p>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        {summary && <>
          <section className="space-y-2 rounded-2xl border border-border bg-white p-4">
            <h2 className="font-bold">新增發票／收據</h2>
            <label className="block text-sm">類別
              <select aria-label="實際費用類別" className={`${inputClass} mt-1`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">自訂項目</option>
                {summary.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            {!categoryId && <label className="block text-sm">自訂項目<input aria-label="自訂項目名稱" className={`${inputClass} mt-1`} value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} /></label>}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">金額<input aria-label="實際費用金額" className={`${inputClass} mt-1`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
              <label className="block text-sm">幣別<select aria-label="實際費用幣別" className={`${inputClass} mt-1`} value={currency} onChange={(event) => setCurrency(event.target.value as "JPY" | "TWD")}><option value="TWD">TWD</option><option value="JPY">JPY</option></select></label>
            </div>
            <label className="block text-sm">日期<input aria-label="實際費用日期" type="date" className={`${inputClass} mt-1`} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label>
            <label className="block text-sm">收據照片（選填）<input aria-label="收據照片" type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label>
            {photoPreview ? <img src={photoPreview} alt="收據預覽" className="max-h-40 rounded-xl object-contain" /> : <p className="text-xs text-muted-foreground">沒有照片會標示「無單據」</p>}
            <button type="button" className="min-h-11 w-full rounded-xl bg-primary font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>新增實際費用</button>
          </section>
          <section className="space-y-2 rounded-2xl border border-border bg-white p-4">
            <h2 className="font-bold">已記錄費用</h2>
            {summary.entries.length === 0 && <p className="text-sm text-muted-foreground">尚無實際費用</p>}
            {summary.entries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0"><span>{entry.categoryName ?? entry.customLabel ?? "自訂項目"}</span><span>{entry.currency} {entry.originalAmount}{entry.photoUrl ? "" : " · 無單據"}</span></div>)}
          </section>
        </>}
      </main>
      <BottomNav />
    </div>
  );
}
