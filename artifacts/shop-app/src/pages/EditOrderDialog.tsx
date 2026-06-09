import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOrder,
  getListOrdersQueryKey,
  type Order,
  PaymentMethod,
  PaymentStatus,
  ShippingMethod,
  ShippingStatus,
} from "@workspace/api-client-react";
import { isFamilyMartMethod } from "@/lib/cvs711";

const PICKUP_METHOD_OPTIONS = [
  { value: "自取", label: "自取" },
  { value: "7-11 取貨（先付款）", label: "7-11 取貨（先付款）" },
  { value: "7-11 貨到付款", label: "7-11 貨到付款" },
  { value: "全家取貨（先付款）", label: "全家取貨（先付款）" },
  { value: "全家貨到付款", label: "全家貨到付款" },
  { value: "黑貓宅急便", label: "黑貓宅急便" },
  { value: "郵局宅配", label: "郵局宅配" },
  { value: "其他", label: "其他" },
] as const;

type FulfillmentCategory = "self_pickup" | "cvs_711" | "cvs_family" | "home_black_cat" | "home_post" | "other";

function getFulfillmentCategory(method: string): FulfillmentCategory {
  const m = method.trim();
  if (!m) return "other";
  if (m === "自取" || m === "面交") return "self_pickup";
  if (m.startsWith("7-11") || m.includes("711") || m.includes("統一")) return "cvs_711";
  if (m.startsWith("全家")) return "cvs_family";
  if (m.includes("黑貓") || m.includes("宅急便")) return "home_black_cat";
  if (m.includes("郵局")) return "home_post";
  if (m === "宅配") return "home_black_cat";
  return "other";
}

import {
  User,
  Package,
  MessageSquare,
  CreditCard,
  Truck,
  BadgeMinus,
  Calculator,
  Phone,
  MapPin,
  DollarSign,
  Hash,
  FileText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetClose,
} from "@/components/ui/sheet";

interface CvsStoreResult {
  provider: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone?: string | null;
}

// Local augmentation: generated Order may lag behind DB schema on these fields.
type EditableOrder = Order & {
  discountAmount?: number | null;
  discountNote?: string | null;
};

interface Props {
  order: EditableOrder | null;
  storeId: number;
  open: boolean;
  onClose: () => void;
}

const INPUT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const SELECT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer";
const LABEL = "block text-xs text-foreground/80 mb-1 font-semibold";
const ERR = "text-xs text-destructive mt-1";

export function EditOrderDialog({ order, storeId, open, onClose }: Props) {
  const qc = useQueryClient();
  const updateOrder = useUpdateOrder();

  // Buyer / order core
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [paidAmountStr, setPaidAmountStr] = useState<string>("");
  const [paymentNote, setPaymentNote] = useState<string>("");
  const [discountAmountStr, setDiscountAmountStr] = useState<string>("0");
  const [discountNote, setDiscountNote] = useState<string>("");

  // Logistics
  const [shippingMethod, setShippingMethod] = useState<string>("");
  const [shippingStatus, setShippingStatus] = useState<string>("not_shipped");
  const [shippingFeeStr, setShippingFeeStr] = useState<string>("");
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [storeCode, setStoreCode] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [trackingCode, setTrackingCode] = useState<string>("");
  const [trackingProvider, setTrackingProvider] = useState<string>("");
  const [shippingNote, setShippingNote] = useState<string>("");
  const [internalNote, setInternalNote] = useState<string>("");

  // CVS snapshot state
  const [cvsStoreAddress, setCvsStoreAddress] = useState<string>("");
  const [cvsStorePhone, setCvsStorePhone] = useState<string>("");
  const [storeSelectedBy, setStoreSelectedBy] = useState<string>("");
  // CVS store picker
  const [cvsPickerProvider, setCvsPickerProvider] = useState<"seven" | "family">("seven");
  const [cvsSearchQuery, setCvsSearchQuery] = useState<string>("");
  const [cvsSearchStatus, setCvsSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cvsSearchResults, setCvsSearchResults] = useState<CvsStoreResult[]>([]);
  const [cvsSearchError, setCvsSearchError] = useState<string>("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setBuyerName(order.buyerName);
      setBuyerPhone(order.buyerPhone);
      setQuantity(order.quantity);
      setPickupMethod(order.pickupMethod);
      setNotes(order.notes ?? "");
      // Payment
      setPaymentMethod(order.paymentMethod ?? "");
      setPaymentStatus(order.paymentStatus ?? "unpaid");
      setPaidAmountStr(order.paidAmount != null ? String(order.paidAmount) : "");
      setPaymentNote(order.paymentNote ?? "");
      setDiscountAmountStr(String(order.discountAmount ?? 0));
      setDiscountNote(order.discountNote ?? "");
      // Logistics
      setShippingMethod(order.shippingMethod ?? "");
      setShippingStatus(order.shippingStatus ?? "not_shipped");
      setShippingFeeStr(order.shippingFee != null ? String(order.shippingFee) : "");
      setRecipientName(order.recipientName ?? "");
      setRecipientPhone(order.recipientPhone ?? "");
      setRecipientAddress(order.recipientAddress ?? "");
      setStoreCode(order.storeCode ?? "");
      setStoreName(order.storeName ?? "");
      setTrackingCode(order.trackingCode ?? "");
      setTrackingProvider(order.trackingProvider ?? "");
      setShippingNote(order.shippingNote ?? "");
      setInternalNote(order.internalNote ?? "");
      setCvsStoreAddress(order.cvsStoreAddress ?? "");
      setCvsStorePhone(order.cvsStorePhone ?? "");
      setStoreSelectedBy(order.storeSelectedBy ?? "");
      setCvsPickerProvider(isFamilyMartMethod(order.pickupMethod) ? "family" : "seven");
      setCvsSearchQuery("");
      setCvsSearchStatus("idle");
      setCvsSearchResults([]);
      setCvsSearchError("");
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [order]);

  const unitPrice = order ? Number(order.unitPrice ?? 0) : 0;
  const totalPreview = unitPrice * quantity;
  const isPending = updateOrder.isPending;

  // 金額預覽 / 驗證共用的當前輸入值（與後端公式保持一致）
  const itemSubtotal = totalPreview;
  const shippingFeePreview = (() => {
    if (shippingFeeStr.trim() === "") return Number(order?.shippingFee ?? 0);
    const v = parseFloat(shippingFeeStr);
    return isNaN(v) || v < 0 ? 0 : v;
  })();
  const discountAmountPreview = (() => {
    if (discountAmountStr.trim() === "") return 0;
    const v = parseFloat(discountAmountStr);
    return isNaN(v) || v < 0 ? 0 : v;
  })();
  const paidAmountPreview = (() => {
    if (paidAmountStr.trim() === "") return Number(order?.paidAmount ?? 0);
    const v = parseFloat(paidAmountStr);
    return isNaN(v) || v < 0 ? 0 : v;
  })();
  const orderTotalPreview = Math.max(itemSubtotal + shippingFeePreview - discountAmountPreview, 0);
  const remainingAmountPreview = Math.max(orderTotalPreview - paidAmountPreview, 0);

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const fulfillmentCat = getFulfillmentCategory(pickupMethod);
  const isCvs = fulfillmentCat === "cvs_711" || fulfillmentCat === "cvs_family";
  const isHome = fulfillmentCat === "home_black_cat" || fulfillmentCat === "home_post";

  const handlePickupMethodChange = (value: string) => {
    setPickupMethod(value);
    clearFieldError("pickupMethod");
    const cat = getFulfillmentCategory(value);
    setShippingMethod(
      cat === "self_pickup" ? ShippingMethod.self_pickup :
      (cat === "cvs_711" || cat === "cvs_family") ? ShippingMethod.convenience_store :
      (cat === "home_black_cat" || cat === "home_post") ? ShippingMethod.home_delivery :
      ShippingMethod.other
    );
    if (cat === "cvs_family") setCvsPickerProvider("family");
    else if (cat === "cvs_711") setCvsPickerProvider("seven");
    // Clear incompatible fields on switch
    if (cat === "self_pickup" || cat === "home_black_cat" || cat === "home_post") {
      setStoreCode("");
      setStoreName("");
      setCvsStoreAddress("");
      setCvsStorePhone("");
      setStoreSelectedBy("");
      setCvsSearchQuery("");
      setCvsSearchStatus("idle");
      setCvsSearchResults([]);
      setCvsSearchError("");
    }
    if (cat === "self_pickup" || cat === "cvs_711" || cat === "cvs_family") {
      setRecipientAddress("");
      setRecipientName("");
      setRecipientPhone("");
      setTrackingCode("");
      setTrackingProvider("");
    }
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleCvsSearch = async () => {
    const q = cvsSearchQuery.trim();
    if (!q) return;
    setCvsSearchStatus("loading");
    setCvsSearchError("");
    try {
      const qs = new URLSearchParams({ provider: cvsPickerProvider, q, limit: "20" });
      const resp = await fetch(`/api/cvs/stores?${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json() as { stores: CvsStoreResult[] };
      setCvsSearchResults(json.stores ?? []);
      setCvsSearchStatus("success");
    } catch {
      setCvsSearchStatus("error");
      setCvsSearchError("搜尋失敗，請稍後再試");
      setCvsSearchResults([]);
    }
  };

  const handleCvsStoreSelect = (store: CvsStoreResult) => {
    setStoreCode(store.storeId);
    setStoreName(store.storeName);
    setCvsStoreAddress(store.storeAddress);
    setCvsStorePhone(store.storePhone ?? "");
    setStoreSelectedBy("admin");
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!buyerName.trim()) errs.buyerName = "請輸入買家姓名";
    if (!buyerPhone.trim()) errs.buyerPhone = "請輸入電話";
    if (!quantity || quantity < 1 || !Number.isInteger(quantity)) errs.quantity = "數量至少為 1";
    if (!pickupMethod.trim()) errs.pickupMethod = "請輸入取貨方式";
    if (paidAmountStr.trim() !== "") {
      const pa = parseFloat(paidAmountStr);
      if (isNaN(pa) || pa < 0) errs.paidAmount = "已收金額不可為負數";
    }
    if (shippingFeeStr.trim() !== "") {
      const sf = parseFloat(shippingFeeStr);
      if (isNaN(sf) || sf < 0) errs.shippingFee = "運費不可為負數";
    }
    {
      const da = discountAmountStr.trim() === "" ? 0 : parseFloat(discountAmountStr);
      if (isNaN(da) || da < 0) {
        errs.discountAmount = "折讓金額不可為負數";
      } else if (!Number.isInteger(da)) {
        errs.discountAmount = "折讓金額必須為整數";
      } else if (da > itemSubtotal + shippingFeePreview) {
        errs.discountAmount = "折讓金額不可超過商品小計加運費";
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!order || !validate()) return;
    setSubmitError(null);

    const paidAmount = paidAmountStr.trim() === "" ? null : parseFloat(paidAmountStr);
    const shippingFee = shippingFeeStr.trim() === "" ? undefined : parseFloat(shippingFeeStr);
    const discountAmount = discountAmountStr.trim() === "" ? 0 : parseInt(discountAmountStr, 10);

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
          // Payment
          paymentMethod: (paymentMethod || null) as PaymentMethod,
          paymentStatus: paymentStatus as PaymentStatus,
          paidAmount,
          paymentNote: paymentNote.trim() || null,
          discountAmount,
          discountNote: discountNote.trim() || null,
          // Logistics
          shippingMethod: (shippingMethod || null) as ShippingMethod,
          shippingStatus: shippingStatus as ShippingStatus,
          shippingFee,
          recipientName: recipientName.trim() || null,
          recipientPhone: recipientPhone.trim() || null,
          recipientAddress: recipientAddress.trim() || null,
          storeCode: storeCode.trim() || null,
          storeName: storeName.trim() || null,
          cvsStoreAddress: cvsStoreAddress.trim() || null,
          cvsStorePhone: cvsStorePhone.trim() || null,
          storeSelectedBy: storeSelectedBy ? (storeSelectedBy as 'customer' | 'admin' | 'system') : undefined,
          trackingCode: trackingCode.trim() || null,
          trackingProvider: trackingProvider.trim() || null,
          shippingNote: shippingNote.trim() || null,
          internalNote: internalNote.trim() || null,
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-secondary/20">

          {/* 買家資訊 */}
          <div className="space-y-1.5">
            <SectionTitle>買家資訊</SectionTitle>
            <FormSection>
              <div>
                <FieldLabel icon={User}>買家姓名 *</FieldLabel>
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
                <FieldLabel icon={Phone}>買家電話 *</FieldLabel>
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
          </div>

          {/* 數量 */}
          <div className="space-y-1.5">
            <SectionTitle>數量</SectionTitle>
            <FormSection>
              <div>
                <FieldLabel icon={Hash}>數量 *</FieldLabel>
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
            </FormSection>
          </div>

          {/* 付款資訊 */}
          <div className="space-y-1.5">
            <SectionTitle>付款資訊</SectionTitle>
            <FormSection>
              <p className="text-[11px] text-muted-foreground/70">店家手動記錄，尚未串接金流</p>
              <div>
                <FieldLabel icon={CreditCard}>付款狀態</FieldLabel>
                <select
                  className={SELECT}
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                >
                  <option value={PaymentStatus.unpaid}>未付款</option>
                  <option value={PaymentStatus.pending}>待確認</option>
                  <option value={PaymentStatus.partially_paid}>部分付款</option>
                  <option value={PaymentStatus.paid}>已付款</option>
                  <option value={PaymentStatus.refunded}>已退款</option>
                  <option value={PaymentStatus.failed}>付款失敗</option>
                </select>
              </div>
              <div>
                <FieldLabel icon={Wallet}>付款方式</FieldLabel>
                <select
                  className={SELECT}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">未設定</option>
                  <option value={PaymentMethod.cash}>現金</option>
                  <option value={PaymentMethod.bank_transfer}>銀行轉帳</option>
                  <option value={PaymentMethod.line_pay}>LINE Pay</option>
                  <option value={PaymentMethod.other}>其他</option>
                </select>
              </div>
              <div>
                <FieldLabel icon={DollarSign}>已收金額（選填，留空代表未記錄）</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  placeholder="例如：200"
                  value={paidAmountStr}
                  onChange={(e) => { setPaidAmountStr(e.target.value); clearFieldError("paidAmount"); }}
                />
                {fieldErrors.paidAmount && <p className={ERR}>{fieldErrors.paidAmount}</p>}
              </div>
              <div>
                <FieldLabel icon={FileText}>付款備註（後台可見，選填）</FieldLabel>
                <textarea
                  className={`${INPUT} h-auto pt-2 pb-2 resize-none`}
                  rows={2}
                  placeholder="例如：已轉帳 NT$200，2024/06/01"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                />
              </div>
            </FormSection>
          </div>

          {/* 物流資訊 */}
          <div className="space-y-2">
            <SectionTitle>物流資訊</SectionTitle>
            {/* 基本物流：取貨方式 / 出貨狀態 / 運費 */}
            <FormSection>
              <p className="text-[11px] text-muted-foreground/70">店家手動記錄，尚未串接物流</p>
              <div>
                <FieldLabel icon={Truck}>取貨方式 *</FieldLabel>
                <select
                  className={SELECT}
                  value={pickupMethod}
                  onChange={(e) => handlePickupMethodChange(e.target.value)}
                >
                  <option value="">請選擇取貨方式</option>
                  {!PICKUP_METHOD_OPTIONS.some((o) => o.value === pickupMethod) && pickupMethod && (
                    <option value={pickupMethod}>{pickupMethod}</option>
                  )}
                  {PICKUP_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {fieldErrors.pickupMethod && <p className={ERR}>{fieldErrors.pickupMethod}</p>}
              </div>
              <div>
                <FieldLabel icon={Truck}>出貨狀態</FieldLabel>
                <select
                  className={SELECT}
                  value={shippingStatus}
                  onChange={(e) => setShippingStatus(e.target.value)}
                >
                  <option value={ShippingStatus.not_shipped}>未出貨</option>
                  <option value={ShippingStatus.preparing}>備貨中</option>
                  <option value={ShippingStatus.shipped}>已出貨</option>
                  <option value={ShippingStatus.arrived}>已到貨</option>
                  <option value={ShippingStatus.picked_up}>已取貨</option>
                  <option value={ShippingStatus.returned}>已退回</option>
                  <option value={ShippingStatus.cancelled}>已取消</option>
                </select>
              </div>
              <div>
                <FieldLabel icon={DollarSign}>運費（選填，留空保留原值）</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  placeholder="例如：60"
                  value={shippingFeeStr}
                  onChange={(e) => { setShippingFeeStr(e.target.value); clearFieldError("shippingFee"); }}
                />
                {fieldErrors.shippingFee && <p className={ERR}>{fieldErrors.shippingFee}</p>}
              </div>
            </FormSection>
            {/* 超商取貨門市：7-11 / 全家 */}
            {isCvs && (
              <div className="bg-white rounded-2xl border border-primary/20 px-4 py-3 space-y-3">
                <SectionHeading icon={MapPin}>超商取貨門市</SectionHeading>
                <div>
                  <FieldLabel icon={Hash}>超商店號（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="超商門市店號"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel icon={MapPin}>超商店名（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="超商門市名稱"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                  />
                </div>
                {/* CVS Store Picker */}
                <div>
                  <FieldLabel icon={MapPin}>超商門市搜尋（選填）</FieldLabel>
                  <p className="text-[11px] text-muted-foreground/60 mb-1.5">
                    搜尋 {cvsPickerProvider === "family" ? "全家" : "7-11"} 門市
                  </p>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="text"
                      className={`${INPUT} flex-1`}
                      placeholder="輸入門市名稱或地址關鍵字"
                      value={cvsSearchQuery}
                      onChange={(e) => setCvsSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && cvsSearchStatus !== "loading") { e.preventDefault(); void handleCvsSearch(); } }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleCvsSearch()}
                      disabled={!cvsSearchQuery.trim() || cvsSearchStatus === "loading"}
                      className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50 shrink-0"
                    >
                      {cvsSearchStatus === "loading" ? "搜尋中…" : "搜尋"}
                    </button>
                  </div>
                  {cvsSearchStatus === "idle" && (
                    <p className="text-[11px] text-muted-foreground/60 text-center py-1">尚未搜尋</p>
                  )}
                  {cvsSearchStatus === "error" && (
                    <p className="text-xs text-destructive py-1">{cvsSearchError}</p>
                  )}
                  {cvsSearchStatus === "success" && cvsSearchResults.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60 text-center py-1">查無符合門市，請換關鍵字再試</p>
                  )}
                  {cvsSearchStatus === "success" && cvsSearchResults.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                      {cvsSearchResults.map((s) => (
                        <div
                          key={`${s.provider}-${s.storeId}`}
                          className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-foreground">{s.storeName}</div>
                            <div className="text-[11px] text-muted-foreground">{s.storeAddress}</div>
                            {s.storePhone && <div className="text-[11px] text-muted-foreground">{s.storePhone}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCvsStoreSelect(s)}
                            className="shrink-0 h-7 px-2.5 rounded-lg bg-primary text-white text-[11px] font-medium"
                          >
                            選擇
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {cvsStoreAddress && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
                    <div className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide mb-1">已選門市</div>
                    <div className="text-xs font-medium text-foreground">{storeName || storeCode}</div>
                    <div className="text-[11px] text-muted-foreground">{cvsStoreAddress}</div>
                    {cvsStorePhone && <div className="text-[11px] text-muted-foreground">{cvsStorePhone}</div>}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      門市資料可能因超商更新而異動，實際資訊以超商公告為準。
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* 宅配收件人資訊：黑貓 / 郵局 */}
            {isHome && (
              <div className="bg-white rounded-2xl border border-primary/20 px-4 py-3 space-y-3">
                <SectionHeading icon={User}>收件人資訊</SectionHeading>
                <div>
                  <FieldLabel icon={User}>收件人（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="收件人姓名"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel icon={Phone}>收件電話（選填）</FieldLabel>
                  <input
                    type="tel"
                    className={INPUT}
                    placeholder="收件人電話"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel icon={MapPin}>收件地址（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="完整收件地址"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 包裹追蹤 */}
          {isHome && (
            <div className="space-y-1.5">
              <SectionTitle>包裹追蹤</SectionTitle>
              <FormSection>
                <div>
                  <FieldLabel icon={Truck}>物流商（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="例如：黑貓宅急便"
                    value={trackingProvider}
                    onChange={(e) => setTrackingProvider(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel icon={Hash}>物流追蹤碼（選填）</FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="例如：TC123456789TW"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                  />
                </div>
              </FormSection>
            </div>
          )}

          {/* 訂單折讓 */}
          <div className="space-y-1.5">
            <SectionTitle>訂單折讓</SectionTitle>
            <div className="bg-primary/5 rounded-2xl border border-primary/30 px-4 py-3 space-y-3">
              <div>
                <FieldLabel icon={BadgeMinus}>折讓金額（NT$）</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  placeholder="例如：50"
                  value={discountAmountStr}
                  onChange={(e) => { setDiscountAmountStr(e.target.value); clearFieldError("discountAmount"); }}
                />
                {fieldErrors.discountAmount && <p className={ERR}>{fieldErrors.discountAmount}</p>}
              </div>
              <div>
                <FieldLabel icon={MessageSquare}>折讓備註（選填）</FieldLabel>
                <input
                  type="text"
                  className={INPUT}
                  placeholder="例如：老客戶折讓、商品瑕疵補償、滿額優惠"
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 金額預覽 */}
          <div className="space-y-1.5">
            <SectionTitle>金額預覽</SectionTitle>
          <FormSection>
            <div className="bg-primary/5 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">預估總額</span>
              <span className="text-sm font-semibold text-primary">
                NT${unitPrice.toLocaleString()} × {quantity}{" "}
                = <strong>NT${totalPreview.toLocaleString()}</strong>
              </span>
            </div>
            <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs text-muted-foreground">商品小計</span>
                <span className="text-sm text-foreground font-medium">NT$ {itemSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs text-muted-foreground">運費</span>
                <span className="text-sm text-foreground font-medium">NT$ {shippingFeePreview.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs text-muted-foreground">折讓</span>
                <span className={`text-sm font-medium ${discountAmountPreview > 0 ? "text-destructive/80" : "text-foreground"}`}>
                  {discountAmountPreview > 0 ? `-NT$ ${discountAmountPreview.toLocaleString()}` : `NT$ 0`}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs text-muted-foreground">訂單總額</span>
                <span className="text-sm font-semibold text-primary">NT$ {orderTotalPreview.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs text-muted-foreground">已收金額</span>
                <span className="text-sm text-foreground font-medium">NT$ {paidAmountPreview.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <span className="text-xs font-semibold text-foreground/80">待收金額</span>
                <span className="text-sm font-bold text-primary">NT$ {remainingAmountPreview.toLocaleString()}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              單價與正式金額由系統計算，此處僅供參考；實際結果以儲存後的訂單資料為準。
            </p>
          </FormSection>
          </div>

          {/* 備註 */}
          <div className="space-y-1.5">
            <SectionTitle>備註</SectionTitle>
            <FormSection>
              <div>
                <FieldLabel icon={MessageSquare}>買家備註</FieldLabel>
                <textarea
                  className={`${INPUT} h-auto pt-2 pb-2 resize-none`}
                  rows={2}
                  placeholder="選填備註"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel icon={FileText}>內部備註（後台可見，選填）</FieldLabel>
                <textarea
                  className={`${INPUT} h-auto pt-2 pb-2 resize-none`}
                  rows={2}
                  placeholder="僅後台可見的備註"
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                />
              </div>
            </FormSection>
          </div>

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

function SectionHeading({ children, icon: Icon }: { children: string; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </span>
      )}
      <span className="text-sm font-bold text-foreground">{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xl font-bold text-foreground">{children}</h3>
  );
}

function FieldLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {Icon && (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </span>
      )}
      <span className="text-sm font-semibold text-foreground">{children}</span>
    </div>
  );
}
