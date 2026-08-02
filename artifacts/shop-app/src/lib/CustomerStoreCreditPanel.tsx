import { useEffect, useMemo, useState } from "react";
import { ExactDecimal } from "@workspace/db/transport-cost";
import {
  previewStoreCreditBalance,
  type OwnerStoreCreditMutationType,
} from "./storeCreditPreview.ts";

interface StoreCreditTransaction {
  id: number;
  direction: "credit" | "debit";
  type: "grant" | "adjust" | "spend" | "reversal";
  amount: string;
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
}

interface StoreCreditResponse {
  balance: string;
  transactions: StoreCreditTransaction[];
  total: number;
}

type GetToken = () => Promise<string | null>;

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm";

function displayTwd(value: string): string {
  const rounded = ExactDecimal.from(value).toDecimalPlaces(0);
  const sign = rounded.startsWith("-") ? "-" : "";
  const digits = sign ? rounded.slice(1) : rounded;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
}

function transactionLabel(type: StoreCreditTransaction["type"]): string {
  return (
    {
      grant: "發放",
      adjust: "調整",
      spend: "訂單折抵",
      reversal: "取消回沖",
    }[type] ?? type
  );
}

export function CustomerStoreCreditPanel({
  storeId,
  customerId,
  getToken,
}: {
  storeId: number;
  customerId: number;
  getToken: GetToken;
}) {
  const [data, setData] = useState<StoreCreditResponse | null>(null);
  const [type, setType] = useState<OwnerStoreCreditMutationType>("grant");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const token = await getToken();
    const response = await fetch(
      `/api/stores/${storeId}/customers/${customerId}/store-credit`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!response.ok) throw new Error("無法載入購物金資料");
    setData((await response.json()) as StoreCreditResponse);
  };

  useEffect(() => {
    void load().catch((caught) => setError((caught as Error).message));
  }, [storeId, customerId]);

  const preview = useMemo(() => {
    if (!data || amount.trim() === "") return null;
    try {
      return previewStoreCreditBalance({
        balance: data.balance,
        type,
        amount,
      });
    } catch {
      return null;
    }
  }, [amount, data, type]);

  const previewError = useMemo(() => {
    if (!data || amount.trim() === "") return "";
    try {
      previewStoreCreditBalance({ balance: data.balance, type, amount });
      return "";
    } catch (caught) {
      return (caught as Error).message;
    }
  }, [amount, data, type]);

  const openConfirmation = () => {
    setError("");
    if (!preview || reasonCode.trim() === "") {
      setError(previewError || "請填寫金額與原因代碼");
      return;
    }
    setConfirming(true);
  };

  const confirmMutation = async () => {
    if (!preview) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/stores/${storeId}/customers/${customerId}/store-credit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-confirm-store-credit": "true",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            type,
            amount,
            reasonCode: reasonCode.trim(),
            note: note.trim() || undefined,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "購物金變更失敗");
      }
      setConfirming(false);
      setAmount("");
      setReasonCode("");
      setNote("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">購物金餘額</p>
        <p className="mt-1 text-3xl font-bold">
          NT${data ? displayTwd(data.balance) : "—"}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <h2 className="font-semibold">發放／調整</h2>
        <select
          aria-label="購物金變更類型"
          className={inputClass}
          value={type}
          onChange={(event) =>
            setType(event.target.value as OwnerStoreCreditMutationType)
          }
        >
          <option value="grant">發放（正數）</option>
          <option value="adjust">調整（可正可負）</option>
        </select>
        <input
          aria-label="購物金變更金額"
          className={inputClass}
          inputMode="decimal"
          placeholder={type === "grant" ? "發放金額" : "調整金額，例如 -100"}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <input
          aria-label="購物金原因代碼"
          className={inputClass}
          placeholder="原因代碼（必填）"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
        />
        <input
          aria-label="購物金備註"
          className={inputClass}
          placeholder="備註（選填）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {preview && (
          <p className="rounded-xl bg-muted p-3 text-sm">
            變動前 NT${displayTwd(preview.before.toDecimalPlaces(12))}
            {" → "}
            變動後 NT${displayTwd(preview.after.toDecimalPlaces(12))}
          </p>
        )}
        {previewError && (
          <p className="text-sm text-destructive">{previewError}</p>
        )}
        <button
          type="button"
          disabled={!preview || reasonCode.trim() === ""}
          onClick={openConfirmation}
          className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          預覽並確認
        </button>
      </div>

      {confirming && preview && (
        <div
          role="dialog"
          aria-label="確認購物金變更"
          className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
        >
          <p className="font-semibold">請再次確認</p>
          <p className="text-sm">
            餘額將由 NT${displayTwd(preview.before.toDecimalPlaces(12))} 變更為
            NT${displayTwd(preview.after.toDecimalPlaces(12))}。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-xl border border-border bg-white text-sm"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmMutation()}
              className="min-h-11 rounded-xl bg-primary text-sm font-semibold text-white"
            >
              {saving ? "處理中…" : "確認變更"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2 border-t border-border pt-4">
        <h2 className="font-semibold">最近流水</h2>
        {data?.transactions.map((transaction) => (
          <article
            key={transaction.id}
            className="rounded-xl border border-border p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span>{transactionLabel(transaction.type)}</span>
              <strong>
                {transaction.direction === "credit" ? "+" : "-"}NT$
                {displayTwd(transaction.amount)}
              </strong>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {transaction.reasonCode || "系統事件"}・
              {new Date(transaction.createdAt).toLocaleString("zh-TW")}
            </p>
            {transaction.note && (
              <p className="mt-1 text-xs text-muted-foreground">
                {transaction.note}
              </p>
            )}
          </article>
        ))}
        {data && data.transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">尚無購物金流水</p>
        )}
      </div>
    </section>
  );
}
