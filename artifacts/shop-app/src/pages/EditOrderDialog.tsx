import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
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
import {
  isFamilyMartMethod,
  isSevenElevenMethod,
  getShippingFee,
} from "@/lib/cvs711";
import { formatShippingFeeLabel } from "@workspace/shipping";
import {
  combineRecipientAddress,
  parseRecipientAddress,
} from "@/lib/taiwanZipcodes";
import { normalizeTrackingProvider } from "@/lib/logisticsProviders";
import { RecipientAddressFields } from "@/components/RecipientAddressFields";
import { ManualTrackingSyncPanel } from "@/components/ManualTrackingSyncPanel";
import sevenElevenLogo from "@/assets/logistics/seven-eleven-logo-official.png";
import familymartLogo from "@/assets/logistics/familymart-logo-official.png";
import blackcatLogo from "@/assets/logistics/blackcat-logo-official.svg";
import postofficeLogo from "@/assets/logistics/postoffice-logo.svg";
import { calculateMoneyPreview } from "@/lib/moneyPreview";

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

type FulfillmentCategory =
  | "self_pickup"
  | "cvs_711"
  | "cvs_family"
  | "home_black_cat"
  | "home_post"
  | "other";

// 寫入 canonical provider code（Step 7H-C）：不再寫中文 trackingProvider
function deriveTrackingProvider(method: string): string | null {
  switch (getFulfillmentCategory(method)) {
    case "cvs_711":
      return "711";
    case "cvs_family":
      return "familymart";
    case "home_black_cat":
      return "tcat";
    case "home_post":
      return "postoffice";
    default:
      return null;
  }
}

function getFulfillmentCategory(method: string): FulfillmentCategory {
  const m = method.trim();
  if (!m) return "other";
  if (m === "自取" || m === "面交") return "self_pickup";
  if (m.startsWith("7-11") || m.includes("711") || m.includes("統一"))
    return "cvs_711";
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
  Bike,
  Clock,
  Search,
  Hourglass,
  AlertTriangle,
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
  Mail,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";

const SHIPPING_CARD_OPTIONS: Array<{
  value: string;
  label: string;
  sub?: string;
}> = [
  { value: "自取", label: "面交 / 自取" },
  { value: "7-11 取貨（先付款）", label: "7-11", sub: "取貨（先付款）" },
  { value: "7-11 貨到付款", label: "7-11", sub: "貨到付款" },
  { value: "全家取貨（先付款）", label: "全家", sub: "取貨（先付款）" },
  { value: "全家貨到付款", label: "全家", sub: "貨到付款" },
  { value: "黑貓宅急便", label: "黑貓宅急便" },
  { value: "郵局宅配", label: "郵局宅配" },
];

interface CvsStoreResult {
  provider: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone?: string | null;
}

// Local augmentation: generated Order may lag behind DB schema on these fields.
interface ShipmentTrackingSummary {
  id: number;
  trackingCode: string;
  trackingProvider: string;
  sourceType: string;
  trackingStatus: string;
  latestEventStatus: string | null;
  latestEventDescription: string | null;
  latestEventAt: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  failureCount: number;
  checkError: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

type EditableOrder = Order & {
  discountAmount?: number | null;
  discountNote?: string | null;
  shipmentTracking?: ShipmentTrackingSummary | null;
};

const TRACKING_STATUS_LABELS: Record<string, string> = {
  pending: "待查詢",
  checking: "查詢中",
  active: "運送中",
  delivered: "已完成",
  failed: "查詢失敗",
  inactive: "已停用",
};

const TRACKING_SOURCE_LABELS: Record<string, string> = {
  file_import: "Excel 匯入",
  manual: "手動輸入",
  agent: "Agent 自動",
};

function formatTrackingTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  // Step 7H-4: 收件資訊同買家
  const [sameAsBuyer, setSameAsBuyer] = useState<boolean>(true);
  // 收件地址（黑貓 / 郵局）：與買家端相同的結構化欄位
  const [addrCity, setAddrCity] = useState<string>("");
  const [addrDistrict, setAddrDistrict] = useState<string>("");
  const [addrZip, setAddrZip] = useState<string>("");
  const [addrLine, setAddrLine] = useState<string>("");
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
  const [cvsPickerProvider, setCvsPickerProvider] = useState<
    "seven" | "family"
  >("seven");
  const [cvsSearchQuery, setCvsSearchQuery] = useState<string>("");
  const [cvsSearchStatus, setCvsSearchStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [cvsSearchResults, setCvsSearchResults] = useState<CvsStoreResult[]>(
    [],
  );
  const [cvsSearchError, setCvsSearchError] = useState<string>("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [trackingCopied, setTrackingCopied] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    latestStatusText: string | null;
    latestEventAt: string | null;
  } | null>(null);
  const { getToken } = useAuth();

  const handleCopyTrackingCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setTrackingCopied(true);
      setTimeout(() => setTrackingCopied(false), 1500);
    } catch {
      toast({
        title: "複製失敗",
        description: "瀏覽器不支援剪貼簿",
        variant: "destructive",
      });
    }
  };

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
      setPaidAmountStr(
        order.paidAmount != null ? String(order.paidAmount) : "",
      );
      setPaymentNote(order.paymentNote ?? "");
      setDiscountAmountStr(String(order.discountAmount ?? 0));
      setDiscountNote(order.discountNote ?? "");
      // Logistics
      setShippingMethod(order.shippingMethod ?? "");
      setShippingStatus(order.shippingStatus ?? "not_shipped");
      setShippingFeeStr(
        order.shippingFee != null ? String(order.shippingFee) : "",
      );
      setRecipientName(order.recipientName ?? "");
      setRecipientPhone(order.recipientPhone ?? "");
      // 收件資訊與買家相同（或皆空）→ 預設勾選「同買家資訊」
      setSameAsBuyer(
        (!order.recipientName && !order.recipientPhone) ||
          (order.recipientName === order.buyerName &&
            order.recipientPhone === order.buyerPhone),
      );
      {
        // 回填收件地址：可解析 → 結構化欄位；不可解析（舊自由輸入）→ 全文放詳細地址
        const parsed = parseRecipientAddress(order.recipientAddress);
        if (parsed) {
          setAddrCity(parsed.city);
          setAddrDistrict(parsed.district);
          setAddrZip(parsed.zip);
          setAddrLine(parsed.line);
        } else {
          setAddrCity("");
          setAddrDistrict("");
          setAddrZip("");
          setAddrLine(order.recipientAddress ?? "");
        }
      }
      setStoreCode(order.storeCode ?? "");
      setStoreName(order.storeName ?? "");
      setTrackingCode(order.trackingCode ?? "");
      setTrackingProvider(order.trackingProvider ?? "");
      setShippingNote(order.shippingNote ?? "");
      setInternalNote(order.internalNote ?? "");
      setCvsStoreAddress(order.cvsStoreAddress ?? "");
      setCvsStorePhone(order.cvsStorePhone ?? "");
      setStoreSelectedBy(order.storeSelectedBy ?? "");
      setCvsPickerProvider(
        isFamilyMartMethod(order.pickupMethod) ? "family" : "seven",
      );
      setCvsSearchQuery("");
      setCvsSearchStatus("idle");
      setCvsSearchResults([]);
      setCvsSearchError("");
      setFieldErrors({});
      setSubmitError(null);
      setPreviewResult(null);
    }
  }, [order]);

  const isPending = updateOrder.isPending;

  // 金額預覽 / 驗證共用的當前輸入值（與後端公式保持一致）
  const moneyPreview = calculateMoneyPreview({
    lines: [{ unitPrice: order?.unitPrice ?? 0, quantity }],
    shippingFee:
      shippingFeeStr.trim() === "" ? (order?.shippingFee ?? 0) : shippingFeeStr,
    discountAmount: discountAmountStr,
    paidAmount:
      paidAmountStr.trim() === "" ? (order?.paidAmount ?? 0) : paidAmountStr,
  });

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });

  const fulfillmentCat = getFulfillmentCategory(pickupMethod);
  const isCvs = fulfillmentCat === "cvs_711" || fulfillmentCat === "cvs_family";
  const isHome =
    fulfillmentCat === "home_black_cat" || fulfillmentCat === "home_post";

  const handlePickupMethodChange = (value: string) => {
    setPickupMethod(value);
    clearFieldError("pickupMethod");
    const cat = getFulfillmentCategory(value);
    setShippingMethod(
      cat === "self_pickup"
        ? ShippingMethod.self_pickup
        : cat === "cvs_711" || cat === "cvs_family"
          ? ShippingMethod.convenience_store
          : cat === "home_black_cat" || cat === "home_post"
            ? ShippingMethod.home_delivery
            : ShippingMethod.other,
    );
    if (cat === "cvs_family") setCvsPickerProvider("family");
    else if (cat === "cvs_711") setCvsPickerProvider("seven");
    // Step 7H-3: 切換取貨方式時，運費跟著同步為對應費率（仍可手動再修改）
    setShippingFeeStr(String(getShippingFee(value)));
    clearFieldError("shippingFee");
    // Clear incompatible fields on switch
    if (
      cat === "self_pickup" ||
      cat === "home_black_cat" ||
      cat === "home_post"
    ) {
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
      setAddrCity("");
      setAddrDistrict("");
      setAddrZip("");
      setAddrLine("");
      clearFieldError("recipientAddress");
      setTrackingCode("");
      setTrackingProvider("");
    }
  };

  const handleCvsReset = () => {
    setStoreCode("");
    setStoreName("");
    setCvsStoreAddress("");
    setCvsStorePhone("");
    setStoreSelectedBy("");
    setCvsSearchQuery("");
    setCvsSearchStatus("idle");
    setCvsSearchResults([]);
    setCvsSearchError("");
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
      const qs = new URLSearchParams({
        provider: cvsPickerProvider,
        q,
        limit: "20",
      });
      const resp = await fetch(`/api/cvs/stores?${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { stores: CvsStoreResult[] };
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
    if (!quantity || quantity < 1 || !Number.isInteger(quantity))
      errs.quantity = "數量至少為 1";
    if (!pickupMethod.trim()) errs.pickupMethod = "請輸入取貨方式";
    if (!sameAsBuyer) {
      if (!recipientName.trim()) errs.recipientName = "請輸入收件人";
      if (!recipientPhone.trim()) errs.recipientPhone = "請輸入收件電話";
    }
    if (isHome) {
      // 全空（沿用舊資料可為空）允許；填了一部分就必須填完整
      const anyFilled = !!(addrCity || addrDistrict || addrLine.trim());
      if (anyFilled && (!addrCity || !addrDistrict || !addrLine.trim())) {
        errs.recipientAddress = "請完整填寫收件地址";
      }
    }
    // 面交 / 自取：地點選填，但填了詳細地點就要先選縣市與行政區
    if (
      getFulfillmentCategory(pickupMethod) === "self_pickup" &&
      addrLine.trim() &&
      (!addrCity || !addrDistrict)
    ) {
      errs.recipientAddress = "請先選擇縣市與行政區";
    }
    if (paidAmountStr.trim() !== "") {
      const pa = parseFloat(paidAmountStr);
      if (isNaN(pa) || pa < 0) errs.paidAmount = "已收金額不可為負數";
    }
    if (shippingFeeStr.trim() !== "") {
      const sf = parseFloat(shippingFeeStr);
      if (isNaN(sf) || sf < 0) errs.shippingFee = "運費不可為負數";
    }
    {
      const da =
        discountAmountStr.trim() === "" ? 0 : parseFloat(discountAmountStr);
      if (isNaN(da) || da < 0) {
        errs.discountAmount = "折讓金額不可為負數";
      } else if (!Number.isInteger(da)) {
        errs.discountAmount = "折讓金額必須為整數";
      } else if (moneyPreview.discountExceedsGross) {
        errs.discountAmount = "折讓金額不可超過商品小計加運費";
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!order || !validate()) return;
    setSubmitError(null);

    const paidAmount =
      paidAmountStr.trim() === "" ? null : parseFloat(paidAmountStr);
    const shippingFee =
      shippingFeeStr.trim() === "" ? undefined : parseFloat(shippingFeeStr);
    const discountAmount =
      discountAmountStr.trim() === "" ? 0 : parseInt(discountAmountStr, 10);

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
          recipientName:
            (sameAsBuyer ? buyerName.trim() : recipientName.trim()) || null,
          recipientPhone:
            (sameAsBuyer ? buyerPhone.trim() : recipientPhone.trim()) || null,
          recipientAddress:
            addrCity && addrDistrict && addrLine.trim()
              ? combineRecipientAddress(
                  addrZip,
                  addrCity,
                  addrDistrict,
                  addrLine,
                )
              : addrLine.trim() || null,
          storeCode: storeCode.trim() || null,
          storeName: storeName.trim() || null,
          cvsStoreAddress: cvsStoreAddress.trim() || null,
          cvsStorePhone: cvsStorePhone.trim() || null,
          storeSelectedBy: storeSelectedBy
            ? (storeSelectedBy as "customer" | "admin" | "system")
            : undefined,
          trackingCode: trackingCode.trim() || null,
          // Step 7H-C：舊值先 normalize 成 canonical（如 "7-11" → "711"）；
          // 認不得的值保留原樣送出（不默默轉 other，留給 7H-D 人工處理）
          trackingProvider: trackingProvider.trim()
            ? (normalizeTrackingProvider(trackingProvider) ??
              trackingProvider.trim())
            : trackingCode.trim()
              ? deriveTrackingProvider(pickupMethod)
              : null,
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
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="max-w-[480px] mx-auto rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: "92dvh" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center px-5 pt-4 pb-3 border-b border-border shrink-0 pr-12">
          <div>
            <h2 className="text-base font-bold text-foreground">編輯訂單</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              訂單 #{order.id}
            </p>
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
                  onChange={(e) => {
                    setBuyerName(e.target.value);
                    clearFieldError("buyerName");
                  }}
                />
                {fieldErrors.buyerName && (
                  <p className={ERR}>{fieldErrors.buyerName}</p>
                )}
              </div>
              <div>
                <FieldLabel icon={Phone}>買家電話 *</FieldLabel>
                <input
                  type="tel"
                  className={INPUT}
                  placeholder="請輸入電話"
                  value={buyerPhone}
                  onChange={(e) => {
                    setBuyerPhone(e.target.value);
                    clearFieldError("buyerPhone");
                  }}
                />
                {fieldErrors.buyerPhone && (
                  <p className={ERR}>{fieldErrors.buyerPhone}</p>
                )}
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
                      setRecipientName(recipientName || buyerName);
                      setRecipientPhone(recipientPhone || buyerPhone);
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
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    clearFieldError("recipientName");
                  }}
                />
                {fieldErrors.recipientName && (
                  <p className={ERR}>{fieldErrors.recipientName}</p>
                )}
              </div>
              <div>
                <FieldLabel icon={Phone}>收件電話 *</FieldLabel>
                <input
                  type="tel"
                  className={`${INPUT} ${sameAsBuyer ? "bg-muted/30 cursor-default" : ""}`}
                  placeholder="請輸入收件電話"
                  value={sameAsBuyer ? buyerPhone : recipientPhone}
                  readOnly={sameAsBuyer}
                  onChange={(e) => {
                    setRecipientPhone(e.target.value);
                    clearFieldError("recipientPhone");
                  }}
                />
                {fieldErrors.recipientPhone && (
                  <p className={ERR}>{fieldErrors.recipientPhone}</p>
                )}
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
                {fieldErrors.quantity && (
                  <p className={ERR}>{fieldErrors.quantity}</p>
                )}
              </div>
            </FormSection>
          </div>

          {/* 付款資訊 */}
          <div className="space-y-1.5">
            <SectionTitle>付款資訊</SectionTitle>
            <FormSection>
              <p className="text-[11px] text-muted-foreground/70">
                店家手動記錄，尚未串接金流
              </p>
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
                <FieldLabel icon={DollarSign}>
                  已收金額（選填，留空代表未記錄）
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  placeholder="例如：200"
                  value={paidAmountStr}
                  onChange={(e) => {
                    setPaidAmountStr(e.target.value);
                    clearFieldError("paidAmount");
                  }}
                />
                {fieldErrors.paidAmount && (
                  <p className={ERR}>{fieldErrors.paidAmount}</p>
                )}
              </div>
              <div>
                <FieldLabel icon={FileText}>
                  付款備註（後台可見，選填）
                </FieldLabel>
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
            {/* 取貨方式：buyer-identical cards with inline detail */}
            <div>
              <FieldLabel icon={Truck}>取貨方式 *</FieldLabel>
              <div className="space-y-3 mt-1">
                {SHIPPING_CARD_OPTIONS.map((opt) => {
                  // 「面交 / 自取」卡片同時代表舊值「面交」與「自取」，避免舊資料掉到未知值 fallback
                  const isSelected =
                    pickupMethod === opt.value ||
                    (opt.value === "自取" &&
                      getFulfillmentCategory(pickupMethod) === "self_pickup");
                  const cat = getFulfillmentCategory(opt.value);
                  return (
                    <div key={opt.value}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isSelected) handlePickupMethodChange(opt.value);
                        }}
                        className={`w-full flex items-center gap-3 min-h-[64px] px-4 py-3 rounded-2xl border-2 transition-colors text-left shadow-sm ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-white border-border hover:border-primary/40 hover:bg-primary/5"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "border-primary"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <PickupMethodLogo method={opt.value} />
                        <span className="flex-1 min-w-0">
                          <span
                            className={`block text-sm font-semibold leading-snug ${isSelected ? "text-primary" : "text-foreground"}`}
                          >
                            {opt.label}
                          </span>
                          {opt.sub && (
                            <span
                              className={`block text-xs leading-snug ${isSelected ? "text-primary/80" : "text-muted-foreground"}`}
                            >
                              {opt.sub}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-sm font-semibold shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                        >
                          {formatShippingFeeLabel(opt.value)}
                        </span>
                      </button>
                      {isSelected && (
                        <div className="mt-2">
                          {isSevenElevenMethod(opt.value) && (
                            <div
                              className={`rounded-2xl px-4 py-3 space-y-2 border ${cvsStoreAddress ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}
                            >
                              {cvsStoreAddress ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                      className="w-3.5 h-3.5 text-green-600 shrink-0"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span className="text-xs font-semibold text-green-700">
                                      已選取門市
                                    </span>
                                  </div>
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                      {storeName || storeCode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleCvsReset}
                                      className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                    >
                                      重選
                                    </button>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {cvsStoreAddress}
                                  </div>
                                  <div className="text-xs text-muted-foreground/70">
                                    門市編號：{storeCode}
                                  </div>
                                  {cvsStorePhone && (
                                    <div className="text-xs text-muted-foreground/70">
                                      電話：{cvsStorePhone}
                                    </div>
                                  )}
                                  <div className="text-xs text-muted-foreground/50">
                                    門市資料可能因超商更新而異動，實際資訊以超商公告為準。
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold text-foreground">
                                    7-11 門市
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    請選擇取貨門市
                                  </p>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      className={`${INPUT} flex-1`}
                                      placeholder="輸入門市名稱或地址關鍵字"
                                      value={cvsSearchQuery}
                                      onChange={(e) =>
                                        setCvsSearchQuery(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" &&
                                          cvsSearchStatus !== "loading"
                                        ) {
                                          e.preventDefault();
                                          void handleCvsSearch();
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleCvsSearch()}
                                      disabled={
                                        !cvsSearchQuery.trim() ||
                                        cvsSearchStatus === "loading"
                                      }
                                      className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50 shrink-0"
                                    >
                                      {cvsSearchStatus === "loading"
                                        ? "搜尋中…"
                                        : "搜尋"}
                                    </button>
                                  </div>
                                  {cvsSearchStatus === "idle" && (
                                    <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                                      尚未搜尋
                                    </p>
                                  )}
                                  {cvsSearchStatus === "error" && (
                                    <p className="text-xs text-destructive py-1">
                                      {cvsSearchError}
                                    </p>
                                  )}
                                  {cvsSearchStatus === "success" &&
                                    cvsSearchResults.length === 0 && (
                                      <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                                        查無符合門市，請換關鍵字再試
                                      </p>
                                    )}
                                  {cvsSearchStatus === "success" &&
                                    cvsSearchResults.length > 0 && (
                                      <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                                        {cvsSearchResults.map((s) => (
                                          <div
                                            key={`${s.provider}-${s.storeId}`}
                                            className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium text-foreground">
                                                {s.storeName}
                                              </div>
                                              <div className="text-[11px] text-muted-foreground">
                                                {s.storeAddress}
                                              </div>
                                              {s.storePhone && (
                                                <div className="text-[11px] text-muted-foreground">
                                                  {s.storePhone}
                                                </div>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCvsStoreSelect(s)
                                              }
                                              className="shrink-0 h-7 px-2.5 rounded-lg bg-primary text-white text-[11px] font-medium"
                                            >
                                              選擇
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          )}
                          {isFamilyMartMethod(opt.value) && (
                            <div
                              className={`rounded-2xl px-4 py-3 space-y-2 border ${cvsStoreAddress ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}
                            >
                              {cvsStoreAddress ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                      className="w-3.5 h-3.5 text-green-600 shrink-0"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span className="text-xs font-semibold text-green-700">
                                      已選取門市
                                    </span>
                                  </div>
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                      {storeName || storeCode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleCvsReset}
                                      className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                    >
                                      重選
                                    </button>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {cvsStoreAddress}
                                  </div>
                                  <div className="text-xs text-muted-foreground/70">
                                    門市編號：{storeCode}
                                  </div>
                                  {cvsStorePhone && (
                                    <div className="text-xs text-muted-foreground/70">
                                      電話：{cvsStorePhone}
                                    </div>
                                  )}
                                  <div className="text-xs text-muted-foreground/50">
                                    門市資料可能因超商更新而異動，實際資訊以超商公告為準。
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold text-foreground">
                                    全家門市
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    請選擇取貨門市
                                  </p>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      className={`${INPUT} flex-1`}
                                      placeholder="輸入門市名稱或地址關鍵字"
                                      value={cvsSearchQuery}
                                      onChange={(e) =>
                                        setCvsSearchQuery(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" &&
                                          cvsSearchStatus !== "loading"
                                        ) {
                                          e.preventDefault();
                                          void handleCvsSearch();
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleCvsSearch()}
                                      disabled={
                                        !cvsSearchQuery.trim() ||
                                        cvsSearchStatus === "loading"
                                      }
                                      className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50 shrink-0"
                                    >
                                      {cvsSearchStatus === "loading"
                                        ? "搜尋中…"
                                        : "搜尋"}
                                    </button>
                                  </div>
                                  {cvsSearchStatus === "idle" && (
                                    <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                                      尚未搜尋
                                    </p>
                                  )}
                                  {cvsSearchStatus === "error" && (
                                    <p className="text-xs text-destructive py-1">
                                      {cvsSearchError}
                                    </p>
                                  )}
                                  {cvsSearchStatus === "success" &&
                                    cvsSearchResults.length === 0 && (
                                      <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                                        查無符合門市，請換關鍵字再試
                                      </p>
                                    )}
                                  {cvsSearchStatus === "success" &&
                                    cvsSearchResults.length > 0 && (
                                      <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                                        {cvsSearchResults.map((s) => (
                                          <div
                                            key={`${s.provider}-${s.storeId}`}
                                            className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium text-foreground">
                                                {s.storeName}
                                              </div>
                                              <div className="text-[11px] text-muted-foreground">
                                                {s.storeAddress}
                                              </div>
                                              {s.storePhone && (
                                                <div className="text-[11px] text-muted-foreground">
                                                  {s.storePhone}
                                                </div>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCvsStoreSelect(s)
                                              }
                                              className="shrink-0 h-7 px-2.5 rounded-lg bg-primary text-white text-[11px] font-medium"
                                            >
                                              選擇
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          )}
                          {(cat === "home_black_cat" ||
                            cat === "home_post") && (
                            <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                              <p className="text-sm font-semibold text-foreground">
                                {cat === "home_black_cat"
                                  ? "黑貓宅急便收件資訊"
                                  : "郵局收件資訊"}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                收件人與收件電話請在上方「收件資訊」填寫。
                              </p>
                              <RecipientAddressFields
                                city={addrCity}
                                district={addrDistrict}
                                zip={addrZip}
                                addressLine={addrLine}
                                onCityChange={(c) => {
                                  setAddrCity(c);
                                  setAddrDistrict("");
                                  setAddrZip("");
                                  clearFieldError("recipientAddress");
                                }}
                                onDistrictChange={(d, z) => {
                                  setAddrDistrict(d);
                                  setAddrZip(z);
                                  clearFieldError("recipientAddress");
                                }}
                                onAddressLineChange={(l) => {
                                  setAddrLine(l);
                                  clearFieldError("recipientAddress");
                                }}
                              />
                              {fieldErrors.recipientAddress && (
                                <p className={ERR}>
                                  {fieldErrors.recipientAddress}
                                </p>
                              )}
                            </div>
                          )}
                          {cat === "self_pickup" && (
                            <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                              <p className="text-sm font-semibold text-foreground">
                                {pickupMethod === "面交"
                                  ? "面交地點資訊（選填）"
                                  : "自取地點資訊（選填）"}
                              </p>
                              <RecipientAddressFields
                                city={addrCity}
                                district={addrDistrict}
                                zip={addrZip}
                                addressLine={addrLine}
                                addressLineLabel="詳細地點"
                                addressLinePlaceholder="例如：台北車站東三門、店面地址、約定地點"
                                onCityChange={(c) => {
                                  setAddrCity(c);
                                  setAddrDistrict("");
                                  setAddrZip("");
                                  clearFieldError("recipientAddress");
                                }}
                                onDistrictChange={(d, z) => {
                                  setAddrDistrict(d);
                                  setAddrZip(z);
                                  clearFieldError("recipientAddress");
                                }}
                                onAddressLineChange={(l) => {
                                  setAddrLine(l);
                                  clearFieldError("recipientAddress");
                                }}
                              />
                              {fieldErrors.recipientAddress && (
                                <p className={ERR}>
                                  {fieldErrors.recipientAddress}
                                </p>
                              )}
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">
                                  面交 / 自取備註（選填）
                                </p>
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
                {pickupMethod &&
                  !SHIPPING_CARD_OPTIONS.some(
                    (o) => o.value === pickupMethod,
                  ) &&
                  getFulfillmentCategory(pickupMethod) !== "self_pickup" && (
                    <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-primary bg-primary/5">
                      <span className="shrink-0 w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      </span>
                      <span className="flex-1 text-sm font-medium text-primary">
                        {pickupMethod}
                      </span>
                    </div>
                  )}
              </div>
              {fieldErrors.pickupMethod && (
                <p className={ERR}>{fieldErrors.pickupMethod}</p>
              )}
            </div>
            <FormSection>
              <div className="rounded-2xl border border-border bg-white px-4 py-4 space-y-4">
                <p className="text-base font-bold text-foreground">包裹追蹤</p>
                {(() => {
                  const tracking = order?.shipmentTracking ?? null;
                  const displayCode = (
                    tracking?.trackingCode ??
                    order?.trackingCode ??
                    ""
                  ).trim();
                  if (!displayCode) return null;
                  const statusLabel = tracking
                    ? (TRACKING_STATUS_LABELS[tracking.trackingStatus] ??
                      "待查詢")
                    : "待查詢";
                  const eventDescription =
                    tracking?.latestEventDescription?.trim() || null;
                  const sourceLabel = tracking
                    ? (TRACKING_SOURCE_LABELS[tracking.sourceType] ??
                      "物流資料")
                    : "物流資料";
                  // 貨態時間 = 物流商最新事件時間；上次查詢 = 系統最後查詢時間（與訂單列表卡片語意一致）
                  const eventTime = tracking
                    ? formatTrackingTime(tracking.latestEventAt)
                    : null;
                  const lastChecked = tracking
                    ? (formatTrackingTime(tracking.lastCheckedAt) ??
                      formatTrackingTime(tracking.updatedAt))
                    : null;
                  // preview-only fallback：DB 尚無貨態時，用 manual preview 查詢結果暫時顯示（不寫 DB）
                  const previewStatusText = !eventDescription
                    ? (previewResult?.latestStatusText ?? null)
                    : null;
                  const previewEventTime = !eventTime
                    ? formatTrackingTime(previewResult?.latestEventAt ?? null)
                    : null;
                  return (
                    <>
                      <div>
                        <FieldLabel icon={Package}>物流貨號</FieldLabel>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground break-all">
                            {displayCode}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyTrackingCode(displayCode)
                            }
                            className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                          >
                            {trackingCopied ? "已複製" : "複製"}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                        <div>
                          <FieldLabel icon={Search}>目前貨態</FieldLabel>
                          <p className="text-sm text-foreground">
                            {eventDescription ??
                              previewStatusText ??
                              statusLabel}
                          </p>
                        </div>
                        {eventDescription && (
                          <div>
                            <FieldLabel icon={Truck}>系統分類</FieldLabel>
                            <p className="text-sm text-foreground">
                              {statusLabel}
                            </p>
                          </div>
                        )}
                        <div>
                          <FieldLabel icon={FileText}>來源</FieldLabel>
                          <p className="text-sm text-foreground">
                            {sourceLabel}
                          </p>
                        </div>
                        <div>
                          <FieldLabel icon={Clock}>貨態時間</FieldLabel>
                          <p
                            className={`text-sm ${(eventTime ?? previewEventTime) ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {eventTime ?? previewEventTime ?? "尚無貨態時間"}
                          </p>
                        </div>
                        <div>
                          <FieldLabel icon={Clock}>上次查詢</FieldLabel>
                          <p
                            className={`text-sm ${lastChecked ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {lastChecked ?? "尚未查詢"}
                          </p>
                        </div>
                        <div>
                          <FieldLabel icon={Hourglass}>取件期限</FieldLabel>
                          <p className="text-sm text-muted-foreground">
                            尚未取得
                          </p>
                        </div>
                      </div>
                      {tracking?.checkError && (
                        <div>
                          <FieldLabel icon={AlertTriangle}>異常</FieldLabel>
                          <p className="text-sm text-destructive">
                            查詢失敗：{tracking.checkError}
                          </p>
                        </div>
                      )}
                      {/* 郵局 / 黑貓手動貨態同步（Step 7N-J5F-3）。
                        familymart 走既有整批同步、711 半自動不提供。
                        preview / commit API 串接於 J5F-4 / J5F-7 實作。 */}
                      <ManualTrackingSyncPanel
                        storeId={storeId}
                        orderId={order.id}
                        shipmentTracking={tracking}
                        disabled={isPending}
                        onOrderRefresh={() => {
                          qc.invalidateQueries({
                            queryKey: getListOrdersQueryKey(storeId),
                          });
                        }}
                        onPreviewResult={(data) => {
                          setPreviewResult(data);
                          if (data.latestStatusText && order) {
                            qc.setQueryData<Order[]>(
                              getListOrdersQueryKey(storeId),
                              (oldData) => {
                                if (!oldData) return oldData;
                                return oldData.map((o) => {
                                  if (o.id !== order.id) return o;
                                  const eo = o as EditableOrder;
                                  if (!eo.shipmentTracking) return o;
                                  return {
                                    ...eo,
                                    shipmentTracking: {
                                      ...eo.shipmentTracking,
                                      latestEventDescription:
                                        data.latestStatusText ??
                                        eo.shipmentTracking
                                          .latestEventDescription,
                                      latestEventAt:
                                        data.latestEventAt ??
                                        eo.shipmentTracking.latestEventAt,
                                    },
                                  } as Order;
                                });
                              },
                            );
                          }
                        }}
                      />
                    </>
                  );
                })()}
                {!(
                  order?.shipmentTracking?.trackingCode ??
                  order?.trackingCode ??
                  ""
                ).trim() && (
                  <div>
                    <p className="text-sm text-foreground">
                      尚未建立物流追蹤資料
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      可透過物流 Excel 匯入，或在此手動填入物流貨號
                    </p>
                  </div>
                )}
                <div>
                  <FieldLabel icon={Truck}>
                    物流貨號（儲存變更時一併更新）
                  </FieldLabel>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="例如：TC123456789TW"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                  />
                </div>
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
                <FieldLabel icon={DollarSign}>
                  運費（選填，留空保留原值）
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  placeholder="例如：60"
                  value={shippingFeeStr}
                  onChange={(e) => {
                    setShippingFeeStr(e.target.value);
                    clearFieldError("shippingFee");
                  }}
                />
                {fieldErrors.shippingFee && (
                  <p className={ERR}>{fieldErrors.shippingFee}</p>
                )}
              </div>
            </FormSection>
          </div>

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
                  onChange={(e) => {
                    setDiscountAmountStr(e.target.value);
                    clearFieldError("discountAmount");
                  }}
                />
                {fieldErrors.discountAmount && (
                  <p className={ERR}>{fieldErrors.discountAmount}</p>
                )}
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
                  NT${moneyPreview.unitPrice} × {quantity} ={" "}
                  <strong>NT${moneyPreview.itemSubtotal}</strong>
                </span>
              </div>
              <div className="bg-white rounded-xl border border-border/50 divide-y divide-border/40">
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-xs text-muted-foreground">
                    商品小計
                  </span>
                  <span className="text-sm text-foreground font-medium">
                    NT$ {moneyPreview.itemSubtotal}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-xs text-muted-foreground">運費</span>
                  <span className="text-sm text-foreground font-medium">
                    NT$ {moneyPreview.shippingFee}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-xs text-muted-foreground">折讓</span>
                  <span
                    className={`text-sm font-medium ${moneyPreview.hasDiscount ? "text-destructive/80" : "text-foreground"}`}
                  >
                    {moneyPreview.hasDiscount
                      ? `-NT$ ${moneyPreview.discountAmount}`
                      : `NT$ 0`}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-xs text-muted-foreground">
                    訂單總額
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    NT$ {moneyPreview.orderTotal}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-xs text-muted-foreground">
                    已收金額
                  </span>
                  <span className="text-sm text-foreground font-medium">
                    NT$ {moneyPreview.paidAmount}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                  <span className="text-xs font-semibold text-foreground/80">
                    待收金額
                  </span>
                  <span className="text-sm font-bold text-primary">
                    NT$ {moneyPreview.remainingAmount}
                  </span>
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
                <FieldLabel icon={FileText}>
                  內部備註（後台可見，選填）
                </FieldLabel>
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

function SectionHeading({
  children,
  icon: Icon,
}: {
  children: string;
  icon?: LucideIcon;
}) {
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
  return <h3 className="text-xl font-bold text-foreground">{children}</h3>;
}

function FieldLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
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
    inner = (
      <img
        src={sevenElevenLogo}
        alt="7-11"
        className="max-h-8 max-w-[72px] w-auto h-auto object-contain"
      />
    );
  } else if (isFamilyMartMethod(method)) {
    inner = (
      <img
        src={familymartLogo}
        alt="全家"
        className="max-h-8 max-w-[72px] w-auto h-auto object-contain"
      />
    );
  } else if (cat === "home_black_cat") {
    inner = (
      <img
        src={blackcatLogo}
        alt="黑貓"
        className="max-h-8 max-w-[72px] w-auto h-auto object-contain"
      />
    );
  } else if (cat === "home_post") {
    inner = (
      <img
        src={postofficeLogo}
        alt="郵局"
        className="max-h-8 max-w-[72px] w-auto h-auto object-contain"
      />
    );
  } else {
    inner = (
      <span className="w-9 h-9 rounded-full bg-secondary/60 inline-flex items-center justify-center">
        <Bike className="w-5 h-5 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span className="w-[76px] h-9 shrink-0 inline-flex items-center justify-center">
      {inner}
    </span>
  );
}
