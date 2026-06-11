import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useCreateMerchantOrder,
  getListOrdersQueryKey,
  ShippingMethod,
} from "@workspace/api-client-react";
import { isFamilyMartMethod, isSevenElevenMethod, getShippingFee } from "@/lib/cvs711";
import { combineRecipientAddress } from "@/lib/taiwanZipcodes";
import { RecipientAddressFields } from "@/components/RecipientAddressFields";
import sevenElevenLogo from "@/assets/logistics/seven-eleven-logo-official.png";
import familymartLogo from "@/assets/logistics/familymart-logo-official.png";
import blackcatLogo from "@/assets/logistics/blackcat-logo-official.svg";
import postofficeLogo from "@/assets/logistics/postoffice-logo.svg";
import {
  User,
  Package,
  MessageSquare,
  Bike,
  Truck,
  Phone,
  Hash,
  type LucideIcon,
} from "lucide-react";
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
const SELECT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer";
const ERR = "text-xs text-destructive mt-1";

// 與 EditOrderDialog 完全相同的取貨方式卡片選項（文案 / 順序 / 運費標示一致）
const SHIPPING_CARD_OPTIONS: Array<{ value: string; label: string; sub?: string; fee: string }> = [
  { value: "自取",                   label: "面交 / 自取",                          fee: "免運"     },
  { value: "7-11 取貨（先付款）",     label: "7-11",     sub: "取貨（先付款）",      fee: "+ NT$60"  },
  { value: "7-11 貨到付款",          label: "7-11",     sub: "貨到付款",            fee: "+ NT$60"  },
  { value: "全家取貨（先付款）",      label: "全家",     sub: "取貨（先付款）",      fee: "+ NT$60"  },
  { value: "全家貨到付款",           label: "全家",     sub: "貨到付款",            fee: "+ NT$60"  },
  { value: "黑貓宅急便",             label: "黑貓宅急便",                           fee: "+ NT$100" },
  { value: "郵局宅配",               label: "郵局宅配",                             fee: "+ NT$80"  },
];

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

interface CvsStoreResult {
  provider: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone?: string | null;
}

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

  // Step 7H-4: 收件資訊（買家不一定是收件人）
  const [sameAsBuyer, setSameAsBuyer] = useState(true);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  // 宅配收件地址（黑貓 / 郵局）— 與買家端相同的結構化地址欄位
  const [addrCity, setAddrCity] = useState("");
  const [addrDistrict, setAddrDistrict] = useState("");
  const [addrZip, setAddrZip] = useState("");
  const [addrLine, setAddrLine] = useState("");

  // 超商門市 snapshot（與 EditOrderDialog 相同欄位）
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [cvsStoreAddress, setCvsStoreAddress] = useState("");
  const [cvsStorePhone, setCvsStorePhone] = useState("");
  // CVS store picker
  const [cvsPickerProvider, setCvsPickerProvider] = useState<"seven" | "family">("seven");
  const [cvsSearchQuery, setCvsSearchQuery] = useState("");
  const [cvsSearchStatus, setCvsSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cvsSearchResults, setCvsSearchResults] = useState<CvsStoreResult[]>([]);
  const [cvsSearchError, setCvsSearchError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeProducts = (products ?? []).filter((p) => p.isActive);
  const selectedProduct = activeProducts.find((p) => p.id === productId);
  const unitPrice = selectedProduct ? Number(selectedProduct.price) : 0;
  const totalPreview = unitPrice * quantity;
  const isPending = createOrder.isPending;

  const fulfillmentCat = getFulfillmentCategory(pickupMethod);

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const handleCvsReset = () => {
    setStoreCode("");
    setStoreName("");
    setCvsStoreAddress("");
    setCvsStorePhone("");
    setCvsSearchQuery("");
    setCvsSearchStatus("idle");
    setCvsSearchResults([]);
    setCvsSearchError("");
  };

  const resetForm = () => {
    setProductId("");
    setBuyerName("");
    setBuyerPhone("");
    setQuantity(1);
    setPickupMethod("");
    setNotes("");
    setSameAsBuyer(true);
    setRecipientName("");
    setRecipientPhone("");
    setAddrCity("");
    setAddrDistrict("");
    setAddrZip("");
    setAddrLine("");
    handleCvsReset();
    setFieldErrors({});
    setSubmitError(null);
  };

  const handleClose = () => {
    if (isPending) return;
    resetForm();
    onClose();
  };

  // 與 EditOrderDialog 相同：切換取貨方式時清除不相容欄位
  const handlePickupMethodChange = (value: string) => {
    setPickupMethod(value);
    clearFieldError("pickupMethod");
    clearFieldError("cvsStore");
    const cat = getFulfillmentCategory(value);
    if (cat === "cvs_family") setCvsPickerProvider("family");
    else if (cat === "cvs_711") setCvsPickerProvider("seven");
    if (cat === "self_pickup" || cat === "home_black_cat" || cat === "home_post") {
      handleCvsReset();
    }
    if (cat === "self_pickup" || cat === "cvs_711" || cat === "cvs_family") {
      setAddrCity("");
      setAddrDistrict("");
      setAddrZip("");
      setAddrLine("");
      clearFieldError("recipientAddress");
    }
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
    clearFieldError("cvsStore");
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!productId) errs.productId = "請選擇商品";
    if (!buyerName.trim()) errs.buyerName = "請輸入買家姓名";
    if (!buyerPhone.trim()) errs.buyerPhone = "請輸入電話";
    if (!quantity || quantity < 1 || !Number.isInteger(quantity)) errs.quantity = "數量至少為 1";
    if (!pickupMethod.trim()) errs.pickupMethod = "請選擇取貨方式";
    const cat = getFulfillmentCategory(pickupMethod);
    if (cat === "cvs_family" && !storeCode) errs.cvsStore = "請先選擇全家門市";
    if (cat === "cvs_711" && !storeCode) errs.cvsStore = "請先選擇 7-11 門市";
    if (!sameAsBuyer) {
      if (!recipientName.trim()) errs.recipientName = "請輸入收件人";
      if (!recipientPhone.trim()) errs.recipientPhone = "請輸入收件電話";
    }
    if ((cat === "home_black_cat" || cat === "home_post") && (!addrCity || !addrDistrict || !addrLine.trim())) {
      errs.recipientAddress = "請完整填寫收件地址";
    }
    // 面交 / 自取：地點選填，但填了詳細地點就要先選縣市與行政區
    if (cat === "self_pickup" && addrLine.trim() && (!addrCity || !addrDistrict)) {
      errs.recipientAddress = "請先選擇縣市與行政區";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitError(null);
    const cat = getFulfillmentCategory(pickupMethod);
    const isCvs = cat === "cvs_711" || cat === "cvs_family";
    const isHome = cat === "home_black_cat" || cat === "home_post";
    const shippingMethod =
      cat === "self_pickup" ? ShippingMethod.self_pickup :
      isCvs ? ShippingMethod.convenience_store :
      isHome ? ShippingMethod.home_delivery :
      ShippingMethod.other;
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
          shippingMethod,
          recipientName: sameAsBuyer ? buyerName.trim() : recipientName.trim(),
          recipientPhone: sameAsBuyer ? buyerPhone.trim() : recipientPhone.trim(),
          recipientAddress: isHome
            ? combineRecipientAddress(addrZip, addrCity, addrDistrict, addrLine)
            : (cat === "self_pickup" && addrCity && addrDistrict)
              ? combineRecipientAddress(addrZip, addrCity, addrDistrict, addrLine)
              : null,
          storeCode: isCvs ? (storeCode || null) : null,
          storeName: isCvs ? (storeName || null) : null,
          cvsStoreAddress: isCvs ? (cvsStoreAddress || null) : null,
          cvsStorePhone: isCvs ? (cvsStorePhone || null) : null,
          ...(isCvs && storeCode ? { storeSelectedBy: "admin" as const } : {}),
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-secondary/20">

          {/* 商品 */}
          <div className="space-y-1.5">
            <SectionTitle>商品</SectionTitle>
            <FormSection>
              <div>
                <FieldLabel icon={Package}>商品 *</FieldLabel>
                <select
                  className={SELECT}
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
            </FormSection>
          </div>

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

          {/* 收件資訊（Step 7H-4：買家不一定是收件人） */}
          <div className="space-y-1.5">
            <SectionTitle>收件資訊</SectionTitle>
            <FormSection>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sameAsBuyer}
                  onChange={(e) => {
                    setSameAsBuyer(e.target.checked);
                    clearFieldError("recipientName");
                    clearFieldError("recipientPhone");
                    if (!e.target.checked) {
                      setRecipientName(buyerName);
                      setRecipientPhone(buyerPhone);
                    }
                  }}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-foreground">同買家資訊</span>
              </label>
              <div>
                <FieldLabel icon={User}>收件人 *</FieldLabel>
                <input
                  type="text"
                  className={`${INPUT} ${sameAsBuyer ? "bg-muted/30 cursor-default" : ""}`}
                  placeholder="請輸入收件人姓名"
                  value={sameAsBuyer ? buyerName : recipientName}
                  readOnly={sameAsBuyer}
                  onChange={(e) => { setRecipientName(e.target.value); clearFieldError("recipientName"); }}
                />
                {fieldErrors.recipientName && <p className={ERR}>{fieldErrors.recipientName}</p>}
              </div>
              <div>
                <FieldLabel icon={Phone}>收件電話 *</FieldLabel>
                <input
                  type="tel"
                  className={`${INPUT} ${sameAsBuyer ? "bg-muted/30 cursor-default" : ""}`}
                  placeholder="請輸入收件電話"
                  value={sameAsBuyer ? buyerPhone : recipientPhone}
                  readOnly={sameAsBuyer}
                  onChange={(e) => { setRecipientPhone(e.target.value); clearFieldError("recipientPhone"); }}
                />
                {fieldErrors.recipientPhone && <p className={ERR}>{fieldErrors.recipientPhone}</p>}
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

          {/* 物流資訊（與編輯訂單相同的取貨方式卡片 + 門市選擇） */}
          <div className="space-y-2">
            <SectionTitle>物流資訊</SectionTitle>
            <div>
              <FieldLabel icon={Truck}>取貨方式 *</FieldLabel>
              <div className="space-y-3 mt-1">
                {SHIPPING_CARD_OPTIONS.map((opt) => {
                  const isSelected = pickupMethod === opt.value;
                  const cat = getFulfillmentCategory(opt.value);
                  return (
                    <div key={opt.value}>
                      <button
                        type="button"
                        onClick={() => handlePickupMethodChange(opt.value)}
                        className={`w-full flex items-center gap-3 min-h-[64px] px-4 py-3 rounded-2xl border-2 transition-colors text-left shadow-sm ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-white border-border hover:border-primary/40 hover:bg-primary/5"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "border-primary" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <PickupMethodLogo method={opt.value} />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-semibold leading-snug ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {opt.label}
                          </span>
                          {opt.sub && (
                            <span className={`block text-xs leading-snug ${isSelected ? "text-primary/80" : "text-muted-foreground"}`}>
                              {opt.sub}
                            </span>
                          )}
                        </span>
                        <span className={`text-sm font-semibold shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                          {opt.fee}
                        </span>
                      </button>
                      {isSelected && (
                        <div className="mt-2">
                          {(isSevenElevenMethod(opt.value) || isFamilyMartMethod(opt.value)) && (
                            <div className={`rounded-2xl px-4 py-3 space-y-2 border ${cvsStoreAddress ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}>
                              {cvsStoreAddress ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-600 shrink-0">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-xs font-semibold text-green-700">已選取門市</span>
                                  </div>
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-foreground">{storeName || storeCode}</span>
                                    <button type="button" onClick={handleCvsReset} className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg">重選</button>
                                  </div>
                                  <div className="text-xs text-muted-foreground">{cvsStoreAddress}</div>
                                  <div className="text-xs text-muted-foreground/70">門市編號：{storeCode}</div>
                                  {cvsStorePhone && <div className="text-xs text-muted-foreground/70">電話：{cvsStorePhone}</div>}
                                  <div className="text-xs text-muted-foreground/50">門市資料可能因超商更新而異動，實際資訊以超商公告為準。</div>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold text-foreground">{isFamilyMartMethod(opt.value) ? "全家門市" : "7-11 門市"}</p>
                                  <p className="text-xs text-muted-foreground">請選擇取貨門市</p>
                                  <div className="flex gap-1.5">
                                    <input type="text" className={`${INPUT} flex-1`} placeholder="輸入門市名稱或地址關鍵字" value={cvsSearchQuery} onChange={(e) => setCvsSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cvsSearchStatus !== "loading") { e.preventDefault(); void handleCvsSearch(); } }} />
                                    <button type="button" onClick={() => void handleCvsSearch()} disabled={!cvsSearchQuery.trim() || cvsSearchStatus === "loading"} className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50 shrink-0">{cvsSearchStatus === "loading" ? "搜尋中…" : "搜尋"}</button>
                                  </div>
                                  {cvsSearchStatus === "idle" && <p className="text-[11px] text-muted-foreground/60 text-center py-1">尚未搜尋</p>}
                                  {cvsSearchStatus === "error" && <p className="text-xs text-destructive py-1">{cvsSearchError}</p>}
                                  {cvsSearchStatus === "success" && cvsSearchResults.length === 0 && <p className="text-[11px] text-muted-foreground/60 text-center py-1">查無符合門市，請換關鍵字再試</p>}
                                  {cvsSearchStatus === "success" && cvsSearchResults.length > 0 && (
                                    <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                                      {cvsSearchResults.map((s) => (
                                        <div key={`${s.provider}-${s.storeId}`} className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-foreground">{s.storeName}</div>
                                            <div className="text-[11px] text-muted-foreground">{s.storeAddress}</div>
                                            {s.storePhone && <div className="text-[11px] text-muted-foreground">{s.storePhone}</div>}
                                          </div>
                                          <button type="button" onClick={() => handleCvsStoreSelect(s)} className="shrink-0 h-7 px-2.5 rounded-lg bg-primary text-white text-[11px] font-medium">選擇</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {(cat === "home_black_cat" || cat === "home_post") && (
                            <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                              <p className="text-sm font-semibold text-foreground">
                                {cat === "home_black_cat" ? "黑貓宅急便收件資訊" : "郵局收件資訊"}
                              </p>
                              <p className="text-[11px] text-muted-foreground">收件人與收件電話請在上方「收件資訊」填寫。</p>
                              <RecipientAddressFields
                                city={addrCity}
                                district={addrDistrict}
                                zip={addrZip}
                                addressLine={addrLine}
                                required
                                onCityChange={(c) => { setAddrCity(c); setAddrDistrict(""); setAddrZip(""); clearFieldError("recipientAddress"); }}
                                onDistrictChange={(d, z) => { setAddrDistrict(d); setAddrZip(z); clearFieldError("recipientAddress"); }}
                                onAddressLineChange={(l) => { setAddrLine(l); clearFieldError("recipientAddress"); }}
                              />
                              {fieldErrors.recipientAddress && <p className={ERR}>{fieldErrors.recipientAddress}</p>}
                            </div>
                          )}
                          {cat === "self_pickup" && (
                            <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                              <p className="text-sm font-semibold text-foreground">
                                {pickupMethod === "面交" ? "面交地點資訊（選填）" : "自取地點資訊（選填）"}
                              </p>
                              <RecipientAddressFields
                                city={addrCity}
                                district={addrDistrict}
                                zip={addrZip}
                                addressLine={addrLine}
                                addressLineLabel="詳細地點"
                                addressLinePlaceholder="例如：台北車站東三門、店面地址、約定地點"
                                onCityChange={(c) => { setAddrCity(c); setAddrDistrict(""); setAddrZip(""); clearFieldError("recipientAddress"); }}
                                onDistrictChange={(d, z) => { setAddrDistrict(d); setAddrZip(z); clearFieldError("recipientAddress"); }}
                                onAddressLineChange={(l) => { setAddrLine(l); clearFieldError("recipientAddress"); }}
                              />
                              {fieldErrors.recipientAddress && <p className={ERR}>{fieldErrors.recipientAddress}</p>}
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">面交 / 自取備註（選填）</p>
                                <textarea
                                  value={notes}
                                  onChange={(e) => setNotes(e.target.value)}
                                  placeholder="例如：可面交時間（週末下午）"
                                  rows={3}
                                  className={`${INPUT} h-auto resize-none py-3`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {fieldErrors.pickupMethod && <p className={ERR}>{fieldErrors.pickupMethod}</p>}
              {fieldErrors.cvsStore && <p className={ERR}>{fieldErrors.cvsStore}</p>}
            </div>
          </div>

          {/* 金額預覽 */}
          {selectedProduct && (
            <div className="space-y-1.5">
              <SectionTitle>金額預覽</SectionTitle>
              <FormSection>
                <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                  <div className="flex items-center justify-between px-3 py-2 gap-2">
                    <span className="text-xs text-muted-foreground">商品小計</span>
                    <span className="text-sm text-foreground font-medium">
                      NT$ {totalPreview.toLocaleString()}（NT${unitPrice.toLocaleString()} × {quantity}）
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 gap-2">
                    <span className="text-xs text-muted-foreground">運費</span>
                    <span className="text-sm text-foreground font-medium">
                      NT$ {getShippingFee(pickupMethod).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <span className="text-xs font-semibold text-foreground/80">訂單總額</span>
                    <span className="text-sm font-bold text-primary">
                      NT$ {(totalPreview + getShippingFee(pickupMethod)).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  單價與正式金額由系統計算，此處僅供參考；實際結果以儲存後的訂單資料為準。
                </p>
              </FormSection>
            </div>
          )}

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
            </FormSection>
          </div>

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

function PickupMethodLogo({ method }: { method: string }) {
  const cat = getFulfillmentCategory(method);
  let inner: ReactNode;
  if (isSevenElevenMethod(method)) {
    inner = <img src={sevenElevenLogo} alt="7-11" className="max-h-8 max-w-[72px] w-auto h-auto object-contain" />;
  } else if (isFamilyMartMethod(method)) {
    inner = <img src={familymartLogo} alt="全家" className="max-h-8 max-w-[72px] w-auto h-auto object-contain" />;
  } else if (cat === "home_black_cat") {
    inner = <img src={blackcatLogo} alt="黑貓" className="max-h-8 max-w-[72px] w-auto h-auto object-contain" />;
  } else if (cat === "home_post") {
    inner = <img src={postofficeLogo} alt="郵局" className="max-h-8 max-w-[72px] w-auto h-auto object-contain" />;
  } else {
    inner = (
      <span className="w-9 h-9 rounded-full bg-secondary/60 inline-flex items-center justify-center">
        <Bike className="w-5 h-5 text-muted-foreground" />
      </span>
    );
  }
  return <span className="w-[76px] h-9 shrink-0 inline-flex items-center justify-center">{inner}</span>;
}
