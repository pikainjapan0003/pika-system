import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useCreateMerchantOrder,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetClose,
} from "@/components/ui/sheet";

interface Props {
  storeId: number;
  open: boolean;
  onClose: () => void;
}

const INPUT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const LABEL = "block text-xs text-muted-foreground mb-1 font-medium";
const ERR = "text-xs text-destructive mt-1";

export function CreateOrderDialog({ storeId, open, onClose }: Props) {
  const qc = useQueryClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = useListProducts(storeId, { query: { enabled: open && !!storeId } as any });
  const createOrder = useCreateMerchantOrder();

  const [productId, setProductId] = useState<number | "">("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeProducts = (products ?? []).filter((p) => p.isActive);
  const selectedProduct = activeProducts.find((p) => p.id === productId);
  const unitPrice = selectedProduct ? Number(selectedProduct.price) : 0;
  const totalPreview = unitPrice * quantity;
  const isPending = createOrder.isPending;

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const resetForm = () => {
    setProductId("");
    setBuyerName("");
    setBuyerPhone("");
    setQuantity(1);
    setPickupMethod("");
    setNotes("");
    setFieldErrors({});
    setSubmitError(null);
  };

  const handleClose = () => {
    if (isPending) return;
    resetForm();
    onClose();
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!productId) errs.productId = "請選擇商品";
    if (!buyerName.trim()) errs.buyerName = "請輸入買家姓名";
    if (!buyerPhone.trim()) errs.buyerPhone = "請輸入電話";
    if (!quantity || quantity < 1 || !Number.isInteger(quantity)) errs.quantity = "數量至少為 1";
    if (!pickupMethod.trim()) errs.pickupMethod = "請輸入取貨方式";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitError(null);
    try {
      await createOrder.mutateAsync({
        storeId,
        data: {
          productId: productId as number,
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          quantity,
          pickupMethod: pickupMethod.trim(),
          notes: notes.trim() || null,
          specValues: {},
        },
      });
      toast({ title: "已新增訂單", description: "訂單狀態為待確認" });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
      resetForm();
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setSubmitError(e?.data?.error ?? "新增訂單失敗，請稍後再試");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="bottom"
        className="max-w-[480px] mx-auto rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: "92dvh" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header — built-in X is absolute right-4 top-4; pr-12 avoids overlap */}
        <div className="flex items-center px-5 pt-4 pb-3 border-b border-border shrink-0 pr-12">
          <h2 className="text-base font-bold text-foreground">新增訂單</h2>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-secondary/20">

          {/* 商品 */}
          <FormSection>
            <SectionHeading>商品</SectionHeading>
            <div>
              <label className={LABEL}>商品 *</label>
              <select
                className={`${INPUT} appearance-none`}
                value={productId === "" ? "" : String(productId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setProductId(v === "" ? "" : Number(v));
                  clearFieldError("productId");
                }}
              >
                <option value="">請選擇商品</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}（NT${Number(p.price).toLocaleString()}）
                  </option>
                ))}
              </select>
              {fieldErrors.productId && <p className={ERR}>{fieldErrors.productId}</p>}
            </div>

            {selectedProduct && (
              <div className="bg-primary/5 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">金額預覽</span>
                <span className="text-sm font-semibold text-primary">
                  NT${unitPrice.toLocaleString()} × {quantity}{" "}
                  = <strong>NT${totalPreview.toLocaleString()}</strong>
                </span>
              </div>
            )}
          </FormSection>

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

          {/* API error */}
          {submitError && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-xl">
              {submitError}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground/60 text-center pb-1">
            訂單新增後預設為「待確認」狀態。不代表已通知買家或確認付款。
          </p>
        </div>

        {/* Footer buttons */}
        <div className="shrink-0 px-5 py-4 border-t border-border bg-white space-y-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {isPending ? "建立中…" : "建立訂單"}
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
