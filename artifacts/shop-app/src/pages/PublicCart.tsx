import { useState, useEffect, useRef, useCallback } from "react";
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
import { loadMotion, motionEnabled, PIKA_EASE } from "@/lib/motion";
import { SemanticStatePanel } from "@/components/SemanticStatePanel";
import { exactDecimal } from "@/components/charts/exactChart";
import { trimAmountForDisplay } from "@/lib/operatingCostDisplay";

interface CartOrderItem {
  productName: string | null;
  productImageUrl: string | null;
  specValues: Record<string, string>;
  quantity: number | null;
  subtotal: unknown;
}

interface CartOrderResult {
  publicToken?: string | null;
  pickupMethod?: string | null;
  createdAt?: string | null;
  shippingFee?: unknown;
  totalPrice?: unknown;
  items?: unknown;
}

const CART_CVS_KEY = "buyer-cart";
const CART_CVS_METHOD_KEY = "buyer-cart-cvs-method";

type PickupMethod =
  | "7-11 賣貨便"
  | "7-11 取貨（先付款）"
  | "7-11 貨到付款"
  | "全家取貨（先付款）"
  | "全家貨到付款"
  | "黑貓宅急便"
  | "郵局"
  | "面交";

const ALL_PICKUP_METHODS: PickupMethod[] = [
  "7-11 賣貨便",
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

function normalizeCartOrderItem(value: unknown): CartOrderItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const rawItem = value as Record<string, unknown>;
  const rawSpecValues = rawItem.specValues;
  const specValues =
    typeof rawSpecValues === "object" &&
    rawSpecValues !== null &&
    !Array.isArray(rawSpecValues)
      ? Object.fromEntries(
          Object.entries(rawSpecValues).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && entry[1].trim().length > 0,
          ),
        )
      : {};

  return {
    productName:
      typeof rawItem.productName === "string" && rawItem.productName.trim()
        ? rawItem.productName
        : null,
    productImageUrl:
      typeof rawItem.productImageUrl === "string" &&
      rawItem.productImageUrl.trim()
        ? rawItem.productImageUrl
        : null,
    specValues,
    quantity:
      typeof rawItem.quantity === "number" &&
      Number.isSafeInteger(rawItem.quantity) &&
      rawItem.quantity > 0
        ? rawItem.quantity
        : null,
    subtotal: rawItem.subtotal,
  };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "待確認（下單時間未完整回傳）";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "待確認（下單時間格式無效）";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeExactAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const decimal = exactDecimal(normalized);
  return decimal !== null && !decimal.isNegative() ? normalized : null;
}

function formatExactAmountForDisplay(value: unknown): string | null {
  const normalized = normalizeExactAmount(value);
  if (normalized === null) return null;
  const decimal = exactDecimal(normalized);
  if (decimal === null) return null;
  const trimmed = trimAmountForDisplay(decimal.toDecimalPlaces(3));
  const [integerPart, fractionPart] = trimmed.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractionPart === undefined
    ? groupedInteger
    : `${groupedInteger}.${fractionPart}`;
}

function addExactAmounts(...values: unknown[]): string | null {
  let total = exactDecimal("0");
  if (total === null) return null;
  for (const value of values) {
    const normalized = normalizeExactAmount(value);
    if (normalized === null) return null;
    const decimal = exactDecimal(normalized);
    if (decimal === null) return null;
    total = total.add(decimal);
  }
  return total.toDecimalPlaces(12);
}

function isExactZero(value: string | null): boolean {
  if (value === null) return false;
  const decimal = exactDecimal(value);
  const zero = exactDecimal("0");
  return decimal !== null && zero !== null && decimal.equals(zero);
}

function multiplyExactAmount(amount: unknown, quantity: number): string | null {
  const normalized = normalizeExactAmount(amount);
  if (normalized === null || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return null;
  }
  const amountDecimal = exactDecimal(normalized);
  const quantityDecimal = exactDecimal(String(quantity));
  if (amountDecimal === null || quantityDecimal === null) return null;
  return amountDecimal.multiply(quantityDecimal).toDecimalPlaces(12);
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
  const unitPriceDisplay = formatExactAmountForDisplay(item.unitPrice);
  const lineTotalDisplay = formatExactAmountForDisplay(
    multiplyExactAmount(item.unitPrice, item.quantity),
  );

  return (
    <div className="bg-card rounded-2xl border border-border p-3 flex gap-3">
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
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums lining-nums">
              {unitPriceDisplay === null
                ? "單價待確認（商品未提供有效金額）"
                : "NT$ " + unitPriceDisplay + " / 件"}
            </p>
          </div>
          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded-lg"
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
              className="min-w-11 min-h-11 rounded-lg border border-input bg-background text-foreground font-bold flex items-center justify-center text-base leading-none"
              aria-label={`將 ${item.productName} 數量減少一件`}
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold text-foreground tabular-nums lining-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQty(item.quantity + 1)}
              className="min-w-11 min-h-11 rounded-lg border border-input bg-background text-foreground font-bold flex items-center justify-center text-base leading-none"
              aria-label={`將 ${item.productName} 數量增加一件`}
            >
              +
            </button>
          </div>
          <p className="text-sm font-bold text-primary tabular-nums lining-nums">
            {lineTotalDisplay === null
              ? "小計待確認"
              : "NT$ " + lineTotalDisplay}
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
        className={`text-foreground text-right break-all tabular-nums lining-nums ${bold ? "font-bold" : ""} ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function SuccessPage({ order }: { order: CartOrderResult }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const publicToken = order.publicToken?.trim() || null;
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems
    .map(normalizeCartOrderItem)
    .filter((item): item is CartOrderItem => item !== null);
  const malformedItemCount = rawItems.length - items.length;
  const shippingFee = normalizeExactAmount(order.shippingFee);
  const shippingFeeDisplay = formatExactAmountForDisplay(shippingFee);
  const orderTotalDisplay = formatExactAmountForDisplay(
    addExactAmounts(order.totalPrice, order.shippingFee),
  );

  const handleCopy = () => {
    setCopyError("");
    if (!publicToken) {
      setCopyError("系統未回傳訂單查詢碼，請聯絡店家確認。");
      return;
    }
    if (!navigator.clipboard) {
      setCopyError("瀏覽器不支援複製，請長按訂單查詢碼手動複製。");
      return;
    }
    navigator.clipboard
      .writeText(publicToken)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setCopyError("複製失敗，請長按訂單查詢碼手動複製。");
      });
  };

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-10 max-w-[480px] mx-auto">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-3xl animate-cs-pulse-once">
          ✓
        </div>
        <h1 className="text-xl font-bold text-foreground">下單成功！</h1>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          您的訂單已收到，商家確認後會與您聯繫。
        </p>
      </div>

      {/* Order summary card */}
      <div className="bg-card rounded-2xl p-4 border border-border space-y-3 mb-3">
        <SummaryRow
          label="追蹤碼"
          value={publicToken ?? "待確認（系統未回傳訂單查詢碼）"}
          mono
        />
        <SummaryRow
          label="取貨方式"
          value={order.pickupMethod || "待確認（系統未回傳取貨方式）"}
        />
        <SummaryRow label="下單時間" value={formatDate(order.createdAt)} />
      </div>

      {/* Items list */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">
            商品明細
          </span>
        </div>
        {rawItems.length === 0 ? (
          <SemanticStatePanel
            className="border-0"
            state={{
              kind: "pending",
              title: "商品明細待確認",
              reason:
                "訂單已建立，但系統尚未回傳商品明細，沒有以空白或 0 代替。",
            }}
          />
        ) : (
          <div className="divide-y divide-border">
            {malformedItemCount > 0 && (
              <SemanticStatePanel
                className="border-0"
                state={{
                  kind: "pending",
                  title: "部分商品明細待確認",
                  reason: `系統有 ${malformedItemCount} 筆商品資料格式不完整，已先顯示其餘可確認內容，沒有以空白或 0 代替。`,
                }}
              />
            )}
            {items.map((item, idx) => {
              const specSummary = formatSpecSummary(item.specValues);
              const subtotalDisplay = formatExactAmountForDisplay(
                item.subtotal,
              );
              return (
                <div key={idx} className="px-4 py-3 flex items-start gap-3">
                  {item.productImageUrl && (
                    <img
                      src={item.productImageUrl}
                      alt={item.productName ?? "商品圖片"}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {item.productName ?? "待確認（商品名稱未回傳）"}
                    </div>
                    {specSummary && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {specSummary}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5 tabular-nums lining-nums">
                      {item.quantity === null
                        ? "數量待確認（系統未回傳有效數量）"
                        : "× " + item.quantity}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-foreground shrink-0 tabular-nums lining-nums">
                    {subtotalDisplay === null
                      ? "小計待確認"
                      : "NT$ " + subtotalDisplay}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">運費</span>
            <span className="text-foreground tabular-nums lining-nums">
              {shippingFeeDisplay === null
                ? "待確認（系統未回傳有效運費）"
                : isExactZero(shippingFee)
                  ? "免費"
                  : "NT$ " + shippingFeeDisplay}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">訂單總額</span>
            <span className="font-bold text-primary text-base tabular-nums lining-nums">
              {orderTotalDisplay === null
                ? "待確認"
                : "NT$ " + orderTotalDisplay}
            </span>
          </div>
          {orderTotalDisplay === null && (
            <p className="text-xs text-accent" role="status">
              原因：商品合計或運費尚未完整回傳，沒有以 0 代替。
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={!publicToken}
        className="w-full h-11 rounded-xl border border-border bg-card text-sm font-medium text-foreground mb-2"
      >
        {!publicToken ? "訂單查詢碼待確認" : copied ? "已複製！" : "複製追蹤碼"}
      </button>
      {publicToken ? (
        <a
          href={`/track/${publicToken}`}
          className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-medium flex items-center justify-center"
        >
          查看訂單狀態
        </a>
      ) : (
        <SemanticStatePanel
          state={{
            kind: "pending",
            title: "查詢連結待確認",
            reason: "系統未回傳訂單查詢碼，請先保留此頁並聯絡店家。",
          }}
        />
      )}
      {copyError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          複製未完成：{copyError}
        </p>
      )}
      <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
        請截圖保留此頁面作為訂購憑證
      </p>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
const selectClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";

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
  const [cartLoadState, setCartLoadState] = useState<"loading" | "ready">(
    "loading",
  );
  const [cartLoadError, setCartLoadError] = useState("");
  const [pickupMethodNotice, setPickupMethodNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<CartOrderResult | null>(
    null,
  );
  const availablePickupMethods = ALL_PICKUP_METHODS.filter((method) =>
    cartItems.every((item) => isPickupMethodEnabled(method, item)),
  );

  // ② ScrollTrigger 長頁區塊進場：捲到才播（低調、一次；只當延後播放的觸發器）
  const pageRef = useRef<HTMLDivElement>(null);
  const loadCartState = useCallback(() => {
    setCartLoadState("loading");
    setCartLoadError("");
    try {
      applyBrandColor(DEFAULT_BRAND_PRIMARY_COLOR);
      setCartItems(getCart());
      setCvsStore(loadCvsStore(CART_CVS_KEY));
      try {
        const savedMethod =
          typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(CART_CVS_METHOD_KEY);
        if (savedMethod && isStorePickupMethod(savedMethod)) {
          setPickupMethod(savedMethod);
        }
      } catch {
        setPickupMethodNotice("先前的取貨方式無法讀取，請在本頁重新選擇。");
      }
    } catch (loadError) {
      setCartLoadError(
        formatActionableError({
          happened: "購物車內容暫時無法載入。",
          reason:
            loadError instanceof Error
              ? loadError.message
              : "瀏覽器儲存空間沒有回應。",
          action: "請重新載入一次；商品不會以空白內容代替。",
          support: "若仍失敗，請返回商品頁重新加入購物車。",
        }),
      );
    } finally {
      setCartLoadState("ready");
    }
  }, []);
  useEffect(() => {
    const root = pageRef.current;
    if (!root || !motionEnabled()) return;
    let killTriggers: (() => void) | undefined;
    void loadMotion().then(({ gsap, ScrollTrigger }) => {
      if (!gsap || !ScrollTrigger) return;
      const blocks = Array.from(
        root.querySelectorAll<HTMLElement>("[data-reveal-block]"),
      );
      const triggers = blocks.map((block) =>
        ScrollTrigger.create({
          trigger: block,
          start: "top 88%",
          once: true,
          onEnter: () => {
            gsap.fromTo(
              block,
              { opacity: 0.001, y: 8 },
              { opacity: 1, y: 0, duration: 0.24, ease: PIKA_EASE.uiOut },
            );
          },
        }),
      );
      killTriggers = () => triggers.forEach((trigger) => trigger.kill());
    });
    return () => {
      killTriggers?.();
    };
  }, []);

  useEffect(() => {
    loadCartState();
  }, [loadCartState]);

  useEffect(() => {
    if (
      pickupMethod &&
      !availablePickupMethods.includes(pickupMethod as PickupMethod)
    ) {
      setPickupMethodNotice(
        "原取貨方式已取消：購物車內商品沒有共同支援該方式，請重新選擇。",
      );
      setPickupMethod("");
    }
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
  const hasValidCartAmounts = cartItems.every(
    (item) =>
      normalizeExactAmount(item.unitPrice) !== null &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0,
  );
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
    if (availablePickupMethods.length === 0) {
      setFormError(
        "取貨方式待確認：購物車內商品沒有共同支援的取貨方式，請分開下單或聯絡店家。",
      );
      return;
    }
    if (!hasValidCartAmounts) {
      setFormError(
        "商品金額待確認：購物車內有商品未提供有效單價或數量，尚未以 0 送出。",
      );
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
    if (
      needsCvsStore &&
      cvsStore &&
      (!cvsStore.storeName?.trim() || !cvsStore.storeAddress?.trim())
    ) {
      setFormError(
        "門市資料待確認：門市名稱或地址尚未完整回傳，請重新選擇門市。",
      );
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

  if (cartLoadState === "loading") {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto px-5 py-8">
        <SemanticStatePanel
          state={{
            kind: "loading",
            label: "正在載入購物車",
            fallbackMessage: "若等待時間過長，請確認瀏覽器儲存空間可用。",
          }}
        />
      </div>
    );
  }

  if (cartLoadError) {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto px-5 py-8">
        <SemanticStatePanel
          state={{
            kind: "pageError",
            title: "購物車載入失敗",
            message: cartLoadError,
            retry: {
              label: "重新載入",
              onAction: loadCartState,
            },
          }}
        />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto">
        <div className="bg-card px-5 py-4 flex items-center gap-3 border-b border-border">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="min-h-11 text-primary font-medium text-sm"
          >
            ← 返回
          </button>
          <h1 className="text-base font-bold text-foreground flex-1">購物車</h1>
        </div>
        <div className="py-16 px-5">
          <SemanticStatePanel
            state={{
              kind: "emptyAction",
              title: "購物車目前沒有商品",
              reason: "尚未加入任何商品；返回商品頁後可重新選擇規格與數量。",
              action: {
                label: "返回繼續選購",
                onAction: () => window.history.back(),
              },
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8"
      ref={pageRef}
    >
      {/* Header */}
      <div className="bg-card px-5 py-4 flex items-center gap-3 border-b border-border sticky top-0 z-10">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="min-h-11 text-primary font-medium text-sm"
        >
          ← 繼續選購
        </button>
        <h1 className="text-base font-bold text-foreground flex-1">購物車</h1>
        <span className="text-sm text-muted-foreground">
          {cartTotalQty(cartItems)} 件
        </span>
      </div>

      {/* Cart items */}
      <div className="px-4 pt-4 space-y-3" data-reveal-block>
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
      <form
        onSubmit={handleCheckout}
        className="px-4 pt-5 space-y-4"
        data-reveal-block
      >
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
            {pickupMethodNotice && (
              <p className="text-sm text-accent" role="status">
                取貨方式提醒：{pickupMethodNotice}
              </p>
            )}
            {availablePickupMethods.length === 0 && (
              <SemanticStatePanel
                state={{
                  kind: "pending",
                  title: "取貨方式待確認",
                  reason:
                    "購物車內商品沒有共同支援的取貨方式。請分開下單，或聯絡店家確認可用方式。",
                }}
              />
            )}
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
                    onClick={() => {
                      setPickupMethodNotice("");
                      setPickupMethod(m);
                    }}
                    aria-pressed={isSelected}
                    className={`w-full flex items-center gap-4 px-5 py-5 min-h-[72px] rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border hover:border-primary/40"
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
                      {m === "7-11 賣貨便" ? (
                        <>
                          <span className="block">7-11</span>
                          <span className="block text-xs font-normal">
                            賣貨便
                          </span>
                        </>
                      ) : (
                        m
                      )}
                      {isSelected && (
                        <span className="mt-1 block text-xs font-normal">
                          已選取
                        </span>
                      )}
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
                          className={`rounded-2xl px-4 py-4 space-y-3 border ${cvsStore ? "bg-chart-3/10 border-chart-3/30" : "bg-card border-border"}`}
                        >
                          {cvsStore ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3.5 h-3.5 text-chart-3 shrink-0"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span className="text-xs font-semibold text-chart-3">
                                  已選取門市
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {cvsStore.storeName ||
                                    "門市名稱待確認（來源未提供）"}
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
                                {cvsStore.storeAddress ||
                                  "門市地址待確認（來源未提供）"}
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
                                className="w-full min-h-11 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
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
                          className={`rounded-2xl px-4 py-4 space-y-3 border ${cvsStore ? "bg-chart-3/10 border-chart-3/30" : "bg-card border-border"}`}
                        >
                          {cvsStore ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3.5 h-3.5 text-chart-3 shrink-0"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span className="text-xs font-semibold text-chart-3">
                                  已選取門市
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {cvsStore.storeName ||
                                    "門市名稱待確認（來源未提供）"}
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
                                {cvsStore.storeAddress ||
                                  "門市地址待確認（來源未提供）"}
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
                                className="w-full min-h-11 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                              >
                                選擇全家門市
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Home delivery */}
                      {isHomeDeliveryMethod(m) && (
                        <div className="bg-card border border-border rounded-2xl px-4 py-4 space-y-4">
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
                        <div className="bg-card border border-border rounded-2xl px-4 py-4 space-y-4">
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
            <div className="flex justify-between text-sm text-muted-foreground tabular-nums lining-nums">
              <span>商品小計</span>
              <span>
                {hasValidCartAmounts
                  ? "NT$ " + moneyPreview.itemSubtotal
                  : "待確認（商品金額不完整）"}
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground tabular-nums lining-nums">
              <span>運費</span>
              <span>{shippingFee === 0 ? "免費" : `NT$ ${shippingFee}`}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/50 tabular-nums lining-nums">
              <span>訂單總額</span>
              <span className="text-primary">
                {hasValidCartAmounts
                  ? "NT$ " + moneyPreview.orderTotal
                  : "待確認"}
              </span>
            </div>
            {!hasValidCartAmounts && (
              <p className="text-xs text-accent" role="status">
                原因：至少一項商品未提供有效單價或數量，沒有以 0 代替。
              </p>
            )}
          </div>
        )}

        {formError && (
          <div
            className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl"
            role="alert"
          >
            <span className="whitespace-pre-line">{formError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting ||
            cartItems.length === 0 ||
            availablePickupMethods.length === 0 ||
            !hasValidCartAmounts
          }
          className="k8-press w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl text-base disabled:opacity-60 sticky bottom-4"
        >
          {isSubmitting
            ? "送出中..."
            : pickupMethod && hasValidCartAmounts
              ? `確認下單 · NT$ ${moneyPreview.orderTotal}`
              : hasValidCartAmounts
                ? "確認下單"
                : "商品金額待確認"}
        </button>
      </form>
    </div>
  );
}
