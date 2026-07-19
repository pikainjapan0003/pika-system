import { useState, useEffect } from "react";
import {
  getCart,
  updateCartQty,
  removeFromCart,
  clearCart,
  cartTotalQty,
} from "@/lib/cartStorage";
import type { BuyerCartItem } from "@/lib/cartStorage";
import {
  isStorePickupMethod,
  isFamilyMartMethod,
  isSevenElevenMethod,
  getPickupProvider,
  getShippingFee,
  openCvsStoreMap,
  loadCvsStore,
  clearCvsStore,
} from "@/lib/cvs711";
import type { CvsStore } from "@/lib/cvs711";
import { TAIWAN_ZIPCODE_REGIONS, getDistricts } from "@/lib/taiwanZipcodes";
import { RecipientAddressFields } from "@/components/RecipientAddressFields";
import { applyBrandColor, DEFAULT_BRAND_PRIMARY_COLOR } from "@/lib/brandColor";
import { formatActionableError } from "@/lib/actionableError";
import sevenElevenLogo from "@/assets/logistics/seven-eleven-logo-official.png";
import familymartLogo from "@/assets/logistics/familymart-logo-official.png";
import blackcatLogo from "@/assets/logistics/blackcat-logo-official.svg";
import postofficeLogo from "@/assets/logistics/postoffice-logo.svg";
import { calculateMoneyPreview } from "@/lib/moneyPreview";

interface CartOrderItem {
  productId: number;
  shareToken: string;
  productName: string;
  productImageUrl?: string | null;
  specValues: Record<string, string>;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface CartOrderResult {
  publicToken: string;
  pickupMethod: string;
  createdAt: string;
  shippingFee: number;
  totalPrice: number;
  items: CartOrderItem[];
}

const CART_CVS_KEY = "buyer-cart";
const CART_CVS_METHOD_KEY = "buyer-cart-cvs-method";

type PickupMethod =
  | "7-11 取貨（先付款）"
  | "7-11 貨到付款"
  | "全家取貨（先付款）"
  | "全家貨到付款"
  | "黑貓宅急便"
  | "郵局"
  | "面交";

const ALL_PICKUP_METHODS: PickupMethod[] = [
  "7-11 取貨（先付款）",
  "7-11 貨到付款",
  "全家取貨（先付款）",
  "全家貨到付款",
  "黑貓宅急便",
  "郵局",
  "面交",
];

function isPickupMethodEnabled(method: string, item: BuyerCartItem): boolean {
  if (method.startsWith("7-11") || method.startsWith("全家"))
    return item.shippingCvsEnabled !== false;
  if (method === "黑貓宅急便") return item.shippingBlackCatEnabled !== false;
  if (method === "郵局") return item.shippingPostOfficeEnabled !== false;
  if (method === "面交") return item.shippingSelfPickupEnabled !== false;
  return true;
}

function isHomeDeliveryMethod(m: string) {
  return m === "黑貓宅急便" || m === "郵局";
}
function isMeetupMethod(m: string) {
  return m === "面交";
}

function pickupMethodGroup(method: PickupMethod): "超商取貨" | "宅配" | "面交" {
  if (method.startsWith("7-11") || method.startsWith("全家")) return "超商取貨";
  if (isHomeDeliveryMethod(method)) return "宅配";
  return "面交";
}
function getShippingFeeLabel(m: string): string {
  const fee = getShippingFee(m);
  return fee === 0 ? "免運" : `+ NT$${fee}`;
}

function formatSpecSummary(specValues: Record<string, string>): string {
  const entries = Object.entries(specValues);
  if (entries.length === 0) return "";
  if (entries.length === 1) return entries[0][1];
  return entries.map(([, v]) => v).join(" / ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CartItemCard({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: BuyerCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const specSummary = formatSpecSummary(item.specValues);
  const lineTotal = item.unitPrice * item.quantity;

  return (
    <div className="bg-white rounded-2xl border border-border p-3 flex gap-3">
      {/* Product image */}
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
        {item.productImageUrl ? (
          <img
            src={item.productImageUrl}
            alt={item.productName}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            無圖
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {item.productName}
            </p>
            {specSummary && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {specSummary}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              NT$ {item.unitPrice.toLocaleString()} / 件
            </p>
          </div>
          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded-lg"
            aria-label="刪除"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Qty stepper + subtotal */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateQty(Math.max(1, item.quantity - 1))}
              className="w-8 h-8 rounded-lg border border-input bg-white text-foreground font-bold flex items-center justify-center text-base leading-none"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-semibold text-foreground">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQty(item.quantity + 1)}
              className="w-8 h-8 rounded-lg border border-input bg-white text-foreground font-bold flex items-center justify-center text-base leading-none"
            >
              +
            </button>
          </div>
          <p className="text-sm font-bold text-primary">
            NT$ {lineTotal.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={`text-foreground text-right break-all ${bold ? "font-bold" : ""} ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function SuccessPage({ order }: { order: CartOrderResult }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(order.publicToken)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const orderTotal = order.totalPrice + order.shippingFee;

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-10 max-w-[480px] mx-auto">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          ✓
        </div>
        <h1 className="text-xl font-bold text-foreground">下單成功！</h1>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          您的訂單已收到，商家確認後會與您聯繫。
        </p>
      </div>

      {/* Order summary card */}
      <div className="bg-white rounded-2xl p-4 border border-border space-y-3 mb-3">
        <SummaryRow label="追蹤碼" value={order.publicToken} mono />
        <SummaryRow label="取貨方式" value={order.pickupMethod} />
        <SummaryRow label="下單時間" value={formatDate(order.createdAt)} />
      </div>

      {/* Items list */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">
            商品明細
          </span>
        </div>
        <div className="divide-y divide-border">
          {order.items.map((item, idx) => {
            const specSummary = formatSpecSummary(item.specValues);
            return (
              <div key={idx} className="px-4 py-3 flex items-start gap-3">
                {item.productImageUrl && (
                  <img
                    src={item.productImageUrl}
                    alt={item.productName}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {item.productName}
                  </div>
                  {specSummary && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {specSummary}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    × {item.quantity}
                  </div>
                </div>
                <div className="text-sm font-semibold text-foreground shrink-0">
                  NT$ {item.subtotal.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-border space-y-1.5">
          {order.shippingFee > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">運費</span>
              <span className="text-foreground">
                NT$ {order.shippingFee.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">訂單總額</span>
            <span className="font-bold text-primary text-base">
              NT$ {orderTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={handleCopy}
        className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground mb-2"
      >
        {copied ? "已複製！" : "複製追蹤碼"}
      </button>
      <a
        href={`/track/${order.publicToken}`}
        className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-medium flex items-center justify-center"
      >
        查看訂單狀態
      </a>
      <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
        請截圖保留此頁面作為訂購憑證
      </p>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
const selectClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";

export default function PublicCartPage() {
  const [cartItems, setCartItems] = useState<BuyerCartItem[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentLast5, setPaymentLast5] = useState("");
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [cvsStore, setCvsStore] = useState<CvsStore | null>(null);
  const [shippingCity, setShippingCity] = useState("");
  const [shippingDistrict, setShippingDistrict] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingAddressLine, setShippingAddressLine] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<CartOrderResult | null>(
    null,
  );
  const availablePickupMethods = ALL_PICKUP_METHODS.filter((method) =>
    cartItems.every((item) => isPickupMethodEnabled(method, item)),
  );

  useEffect(() => {
    applyBrandColor(DEFAULT_BRAND_PRIMARY_COLOR);
    setCartItems(getCart());
    const stored = loadCvsStore(CART_CVS_KEY);
    if (stored) setCvsStore(stored);
    try {
      const savedMethod = localStorage.getItem(CART_CVS_METHOD_KEY);
      if (savedMethod && isStorePickupMethod(savedMethod))
        setPickupMethod(savedMethod);
    } catch {}
  }, []);

  useEffect(() => {
    if (
      pickupMethod &&
      !availablePickupMethods.includes(pickupMethod as PickupMethod)
    )
      setPickupMethod("");
  }, [availablePickupMethods, pickupMethod]);

  useEffect(() => {
    if (!isStorePickupMethod(pickupMethod)) {
      if (pickupMethod !== "") setCvsStore(null);
    } else {
      const stored = loadCvsStore(CART_CVS_KEY);
      const expectedProvider = getPickupProvider(pickupMethod);
      if (
        stored &&
        (stored.provider === expectedProvider ||
          (!stored.provider && expectedProvider === "seven"))
      ) {
        setCvsStore(stored);
      } else {
        setCvsStore(null);
      }
    }
  }, [pickupMethod]);

  const needsCvsStore = isStorePickupMethod(pickupMethod);
  const shippingFee = getShippingFee(pickupMethod);
  const moneyPreview = calculateMoneyPreview({
    lines: cartItems.map((item) => ({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    shippingFee,
  });
  const availableDistricts = getDistricts(shippingCity);

  const handleUpdateQty = (itemKey: string, qty: number) => {
    if (qty < 1) return;
    setCartItems(updateCartQty(itemKey, qty));
  };

  const handleRemove = (itemKey: string) => {
    setCartItems(removeFromCart(itemKey));
  };

  const handleShippingCityChange = (city: string) => {
    setShippingCity(city);
    setShippingDistrict("");
    setShippingZip("");
  };

  const handleShippingDistrictChange = (district: string) => {
    setShippingDistrict(district);
    const cityData = TAIWAN_ZIPCODE_REGIONS.find(
      (r) => r.city === shippingCity,
    );
    const distData = cityData?.districts.find((d) => d.district === district);
    setShippingZip(distData?.zip ?? "");
  };

  const handleSelectStore = () => {
    try {
      localStorage.setItem(CART_CVS_METHOD_KEY, pickupMethod);
    } catch {}
    const basePath =
      (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
    openCvsStoreMap({
      provider: getPickupProvider(pickupMethod),
      returnPath: `${basePath}/cart`,
      source: "customer",
      shareToken: CART_CVS_KEY,
    });
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (cartItems.length === 0) {
      setFormError("購物車是空的");
      return;
    }
    if (!buyerName.trim() || !buyerPhone.trim() || !pickupMethod) {
      setFormError("請填寫姓名、電話和取貨方式");
      return;
    }
    if (needsCvsStore && !cvsStore) {
      const label = isFamilyMartMethod(pickupMethod) ? "全家門市" : "7-11 門市";
      setFormError(`請先選擇${label}`);
      return;
    }
    if (isHomeDeliveryMethod(pickupMethod)) {
      if (
        !shippingCity ||
        !shippingDistrict ||
        !shippingZip ||
        !shippingAddressLine.trim()
      ) {
        setFormError("請完整填寫收件地址");
        return;
      }
    }
    if (
      isMeetupMethod(pickupMethod) &&
      shippingAddressLine.trim() &&
      (!shippingCity || !shippingDistrict)
    ) {
      setFormError("請先選擇縣市與行政區");
      return;
    }

    setIsSubmitting(true);
    try {
      const recipientAddressPayload = isHomeDeliveryMethod(pickupMethod)
        ? `${shippingZip} ${shippingCity}${shippingDistrict}${shippingAddressLine.trim()}`
        : isMeetupMethod(pickupMethod) && shippingCity && shippingDistrict
          ? `${shippingZip} ${shippingCity}${shippingDistrict}${shippingAddressLine.trim()}`.trim()
          : undefined;

      const payload = {
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        pickupMethod,
        notes: notes.trim() || undefined,
        ...(paymentLast5.trim() ? { paymentLast5: paymentLast5.trim() } : {}),
        recipientName: buyerName.trim(),
        recipientPhone: buyerPhone.trim(),
        ...(recipientAddressPayload
          ? { recipientAddress: recipientAddressPayload }
          : {}),
        ...(cvsStore && needsCvsStore
          ? {
              cvsStoreId: cvsStore.storeId,
              cvsStoreName: cvsStore.storeName,
              cvsStoreAddress: cvsStore.storeAddress,
              cvsStorePhone: cvsStore.storePhone ?? null,
            }
          : {}),
        items: cartItems.map((item) => ({
          shareToken: item.shareToken,
          specValues:
            Object.keys(item.specValues).length > 0
              ? item.specValues
              : undefined,
          quantity: item.quantity,
        })),
      };

      const resp = await fetch("/api/cart/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.message || errData?.error || "下單失敗");
      }
      const order = (await resp.json()) as CartOrderResult;

      clearCart();
      if (needsCvsStore) {
        clearCvsStore(CART_CVS_KEY);
        try {
          localStorage.removeItem(CART_CVS_METHOD_KEY);
        } catch {}
      }
      setSubmittedOrder(order);
      setCartItems([]);
    } catch (err: any) {
      setFormError(
        formatActionableError({
          happened: "購物車訂單沒有送出。",
          reason: err?.message || "網路或系統暫時沒有回應。",
          action: "請確認欄位與網路後再試；購物車內容仍會保留。",
          support: "若仍失敗，請截圖並聯絡店家。",
        }),
      );
      setIsSubmitting(false);
    }
  };

  if (submittedOrder) {
    return <SuccessPage order={submittedOrder} />;
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto">
        <div className="bg-white px-5 py-4 flex items-center gap-3 border-b border-border">
          <button
            onClick={() => window.history.back()}
            className="text-primary font-medium text-sm"
          >
            ← 返回
          </button>
          <h1 className="text-base font-bold text-foreground flex-1">購物車</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 px-5">
          <div className="text-5xl mb-4">🛒</div>
          <p className="text-muted-foreground text-base">購物車是空的</p>
          <p className="text-muted-foreground text-sm mt-1">
            快去挑選喜歡的商品吧！
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">
      {/* Header */}
      <div className="bg-white px-5 py-4 flex items-center gap-3 border-b border-border sticky top-0 z-10">
        <button
          onClick={() => window.history.back()}
          className="text-primary font-medium text-sm"
        >
          ← 繼續選購
        </button>
        <h1 className="text-base font-bold text-foreground flex-1">購物車</h1>
        <span className="text-sm text-muted-foreground">
          {cartTotalQty(cartItems)} 件
        </span>
      </div>

      {/* Cart items */}
      <div className="px-4 pt-4 space-y-3">
        {cartItems.map((item) => (
          <CartItemCard
            key={item.itemKey}
            item={item}
            onUpdateQty={(qty) => handleUpdateQty(item.itemKey, qty)}
            onRemove={() => handleRemove(item.itemKey)}
          />
        ))}
      </div>

      {/* Checkout form */}
      <form onSubmit={handleCheckout} className="px-4 pt-5 space-y-4">
        <div className="text-base font-bold text-foreground">填寫取貨資訊</div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            姓名 *
          </label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="請輸入您的姓名"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            電話 *
          </label>
          <input
            type="tel"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
            placeholder="09xx-xxx-xxx"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            付款末五碼（選填）
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            pattern="[0-9]{5}"
            value={paymentLast5}
            onChange={(e) =>
              setPaymentLast5(e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            placeholder="請填 5 位數字"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            僅供人工對帳，不會自動判定付款。
          </p>
        </div>

        {/* Pickup method */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            取貨方式 *
          </label>
          <div className="space-y-4">
            {availablePickupMethods.map((m, index) => {
              const isSelected = pickupMethod === m;
              const groupLabel = pickupMethodGroup(m);
              const previousGroup =
                index > 0
                  ? pickupMethodGroup(availablePickupMethods[index - 1])
                  : null;
              return (
                <div key={m}>
                  {groupLabel !== previousGroup && (
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      {groupLabel}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickupMethod(m)}
                    className={`w-full flex items-center gap-4 px-5 py-5 min-h-[72px] rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-white border-border hover:border-primary/40"
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
                    {/* Horizontal logos get a wider container; square icons stay compact */}
                    {isSevenElevenMethod(m) ||
                    isFamilyMartMethod(m) ||
                    m === "黑貓宅急便" ? (
                      <div className="w-[88px] h-10 flex items-center justify-center shrink-0">
                        {isSevenElevenMethod(m) ? (
                          <img
                            src={sevenElevenLogo}
                            alt="7-ELEVEN"
                            className="max-w-full h-auto max-h-10 object-contain"
                          />
                        ) : isFamilyMartMethod(m) ? (
                          <img
                            src={familymartLogo}
                            alt="全家"
                            className="max-w-full h-auto max-h-10 object-contain"
                          />
                        ) : (
                          <img
                            src={blackcatLogo}
                            alt="黑貓"
                            className="max-w-full h-auto max-h-10 object-contain"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center shrink-0">
                        {m === "郵局" ? (
                          <img
                            src={postofficeLogo}
                            alt="郵局"
                            className="w-11 h-11 object-contain"
                          />
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-9 h-9 text-muted-foreground"
                          >
                            <path d="M7.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM1.5 19.125a7.5 7.5 0 0 1 15 0v.003c0 .278-.034.551-.098.815a.75.75 0 0 1-.364.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63A6.75 6.75 0 0 1 1.5 19.128Z" />
                          </svg>
                        )}
                      </div>
                    )}
                    <span
                      className={`text-sm font-semibold flex-1 ${isSelected ? "text-primary" : "text-foreground"}`}
                    >
                      {m}
                    </span>
                    <span
                      className={`text-sm font-semibold shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {getShippingFeeLabel(m)}
                    </span>
                  </button>

                  {isSelected && (
                    <div className="mt-2">
                      {/* CVS store — 7-11 */}
                      {isSevenElevenMethod(m) && (
                        <div
                          className={`rounded-2xl px-4 py-4 space-y-3 border ${cvsStore ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}
                        >
                          {cvsStore ? (
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
                                  {cvsStore.storeName}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleSelectStore}
                                  className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                >
                                  重選
                                </button>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cvsStore.storeAddress}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground mb-2">
                                請選擇取貨門市
                              </p>
                              <button
                                type="button"
                                onClick={handleSelectStore}
                                className="w-full h-10 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                              >
                                選擇 7-11 門市
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* CVS store — 全家 */}
                      {isFamilyMartMethod(m) && (
                        <div
                          className={`rounded-2xl px-4 py-4 space-y-3 border ${cvsStore ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}
                        >
                          {cvsStore ? (
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
                                  {cvsStore.storeName}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleSelectStore}
                                  className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                >
                                  重選
                                </button>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cvsStore.storeAddress}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground mb-2">
                                請選擇取貨門市
                              </p>
                              <button
                                type="button"
                                onClick={handleSelectStore}
                                className="w-full h-10 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                              >
                                選擇全家門市
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Home delivery */}
                      {isHomeDeliveryMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-4 space-y-4">
                          <p className="text-sm font-semibold text-foreground">
                            {m === "黑貓宅急便"
                              ? "黑貓宅急便收件資訊"
                              : "郵局收件資訊"}
                          </p>
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              縣市 *
                            </label>
                            <select
                              value={shippingCity}
                              onChange={(e) =>
                                handleShippingCityChange(e.target.value)
                              }
                              className={selectClass}
                            >
                              <option value="">請選擇縣市</option>
                              {TAIWAN_ZIPCODE_REGIONS.map((r) => (
                                <option key={r.city} value={r.city}>
                                  {r.city}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              行政區 *
                            </label>
                            <select
                              value={shippingDistrict}
                              onChange={(e) =>
                                handleShippingDistrictChange(e.target.value)
                              }
                              disabled={!shippingCity}
                              className={`${selectClass} disabled:opacity-50`}
                            >
                              <option value="">請選擇行政區</option>
                              {availableDistricts.map((d) => (
                                <option key={d.district} value={d.district}>
                                  {d.district}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              郵遞區號
                            </label>
                            <input
                              type="text"
                              value={shippingZip}
                              readOnly
                              placeholder="選行政區後自動帶入"
                              className={`${inputClass} bg-muted/30 cursor-default`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              詳細地址 *
                            </label>
                            <input
                              type="text"
                              value={shippingAddressLine}
                              onChange={(e) =>
                                setShippingAddressLine(e.target.value)
                              }
                              placeholder="路名、門牌號、樓層"
                              className={inputClass}
                            />
                          </div>
                        </div>
                      )}

                      {/* 面交 */}
                      {isMeetupMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-4 space-y-4">
                          <p className="text-sm font-semibold text-foreground">
                            面交地點資訊（選填）
                          </p>
                          <RecipientAddressFields
                            city={shippingCity}
                            district={shippingDistrict}
                            zip={shippingZip}
                            addressLine={shippingAddressLine}
                            addressLineLabel="詳細地點"
                            addressLinePlaceholder="例如：台北車站東三門"
                            onCityChange={handleShippingCityChange}
                            onDistrictChange={(d, z) => {
                              setShippingDistrict(d);
                              setShippingZip(z);
                            }}
                            onAddressLineChange={setShippingAddressLine}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        {!isHomeDeliveryMethod(pickupMethod) &&
          !isMeetupMethod(pickupMethod) && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                備註（選填）
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="有任何特殊需求請填寫..."
                rows={3}
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>
          )}

        {/* Price summary */}
        {pickupMethod && (
          <div className="bg-secondary/40 rounded-2xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>商品小計</span>
              <span>NT$ {moneyPreview.itemSubtotal}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>運費</span>
              <span>{shippingFee === 0 ? "免費" : `NT$ ${shippingFee}`}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/50">
              <span>訂單總額</span>
              <span className="text-primary">
                NT$ {moneyPreview.orderTotal}
              </span>
            </div>
          </div>
        )}

        {formError && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            <span className="whitespace-pre-line">{formError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || cartItems.length === 0}
          className="w-full h-12 bg-primary text-white font-bold rounded-xl text-base disabled:opacity-60 sticky bottom-4"
        >
          {isSubmitting
            ? "送出中..."
            : pickupMethod
              ? `確認下單 · NT$ ${moneyPreview.orderTotal}`
              : "確認下單"}
        </button>
      </form>
    </div>
  );
}
