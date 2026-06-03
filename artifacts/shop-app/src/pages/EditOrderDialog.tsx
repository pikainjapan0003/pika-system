import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOrder,
  getListOrdersQueryKey,
  type Order,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetClose,
} from "@/components/ui/sheet";

interface Props {
  order: Order | null;
  storeId: number;
  open: boolean;
  onClose: () => void;
}

const INPUT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const LABEL = "block text-xs text-muted-foreground mb-1 font-medium";
const ERR = "text-xs text-destructive mt-1";

export function EditOrderDialog({ order, storeId, open, onClose }: Props) {
  const qc = useQueryClient();
  const updateOrder = useUpdateOrder();

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setBuyerName(order.buyerName);
      setBuyerPhone(order.buyerPhone);
      setQuantity(order.quantity);
      setPickupMethod(order.pickupMethod);
      setNotes(order.notes ?? "");
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [order]);

  const unitPrice = order ? Number(order.unitPrice ?? 0) : 0;
  const totalPreview = unitPrice * quantity;
  const isPending = updateOrder.isPending;

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!buyerName.trim()) errs.buyerName = "請輸入買家姓名";
    if (!buyerPhone.trim()) errs.buyerPhone = "請輸入電話";
    if (!quantity || quantity < 1 || !Number.isInteger(quantity)) errs.quantity = "數量至少為 1";
    if (!pickupMethod.trim()) errs.pickupMethod = "請輸入取貨方式";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!order || !validate()) return;
    setSubmitError(null);
    try {
      await updateOrder.mutateAsync({
        orderId: order.id,
        data: {
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          quantity,
          pickupMethod: pickupMethod.trim(),
          notes: notes.trim() || null,
          specValues: order.specValues as Record<string, unknown>,
        },
      });
      toast({ title: "已更新訂單" });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
      onClose();
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { error?: string } };
      if (e?.status === 422) {
        setSubmitError("此訂單已結束，無法編輯");
      } else {
        setSubmitError("更新訂單失敗，請稍後再試");
      }
    }
  };

  if (!order) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="bottom"
        className="max-w-[480px] mx-auto rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: "92dvh" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center px-5 pt-4 pb-3 border-b border-border shrink-0 pr-12">
          <div>
            <h2 className="text-base font-bold text-foreground">編輯訂單</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">訂單 #{order.id}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-secondary/20">

          {/* 買家資訊 */}
          <FormSection>
            <SectionHeading>買家資訊</SectionHeading>
            <div>
              <label className={LABEL}>買家姓名 *</label>
              <input
                type="text"
                className={INPUT}
                placeholder="請輸入買家姓名"
                value={buyerName}
                onChange={(e) => { setBuyerName(e.target.value); clearFieldError("buyerName"); }}
              />
              {fieldErrors.buyerName && <p className={ERR}>{fieldErrors.buyerName}</p>}
            </div>
            <div>
              <label className={LABEL}>買家電話 *</label>
              <input
                type="tel"
                className={INPUT}
                placeholder="請輸入電話"
                value={buyerPhone}
                onChange={(e) => { setBuyerPhone(e.target.value); clearFieldError("buyerPhone"); }}
              />
              {fieldErrors.buyerPhone && <p className={ERR}>{fieldErrors.buyerPhone}</p>}
            </div>
          </FormSection>

          {/* 數量與取貨 */}
          <FormSection>
            <SectionHeading>數量與取貨</SectionHeading>
            <div>
              <label className={LABEL}>數量 *</label>
              <input
                type="number"
                min={1}
                step={1}
                className={INPUT}
                value={quantity}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setQuantity(isNaN(v) ? 1 : Math.max(1, v));
                  clearFieldError("quantity");
                }}
              />
              {fieldErrors.quantity && <p className={ERR}>{fieldErrors.quantity}</p>}
            </div>
            <div>
              <label className={LABEL}>取貨方式 *</label>
              <input
                type="text"
                className={INPUT}
                placeholder="例如：自取、宅配、7-11 取貨"
                value={pickupMethod}
                onChange={(e) => { setPickupMethod(e.target.value); clearFieldError("pickupMethod"); }}
              />
              {fieldErrors.pickupMethod && <p className={ERR}>{fieldErrors.pickupMethod}</p>}
            </div>
          </FormSection>

          {/* 備註 */}
          <FormSection>
            <SectionHeading>備註</SectionHeading>
            <div>
              <label className={LABEL}>備註（選填）</label>
              <textarea
                className={`${INPUT} h-auto pt-2 pb-2 resize-none`}
                rows={2}
                placeholder="選填備註"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormSection>

          {/* 金額預覽 */}
          <FormSection>
            <SectionHeading>金額預覽</SectionHeading>
            <div className="bg-primary/5 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">預估總額</span>
              <span className="text-sm font-semibold text-primary">
                NT${unitPrice.toLocaleString()} × {quantity}{" "}
                = <strong>NT${totalPreview.toLocaleString()}</strong>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              單價與正式總金額由系統計算，此處僅供參考。
            </p>
          </FormSection>

          {submitError && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-xl">
              {submitError}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground/60 text-center pb-1">
            編輯訂單不代表已通知買家或確認付款。
          </p>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-border bg-white space-y-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {isPending ? "儲存中…" : "儲存變更"}
          </button>
          <SheetClose asChild>
            <button
              type="button"
              disabled={isPending}
              className="w-full h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground disabled:opacity-50"
            >
              取消
            </button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FormSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-border px-4 py-3 space-y-3">
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide">
      {children}
    </div>
  );
}
