import { useState, useEffect, useRef } from "react";
import type { Order } from "@workspace/api-client-react";
import { useGetPublicProduct, useSubmitOrder } from "@workspace/api-client-react";
import { addToCart, getCart, cartTotalQty } from "@/lib/cartStorage";
import { applyBrandColor, DEFAULT_BRAND_PRIMARY_COLOR } from "@/lib/brandColor";
import { formatActionableError } from "@/lib/actionableError";
import {
  isSevenElevenMethod,
  isFamilyMartMethod,
  isStorePickupMethod,
  getPickupProvider,
  getShippingFee,
  openCvsStoreMap,
  loadCvsStore,
  clearCvsStore,
  type CvsStore,
} from "@/lib/cvs711";
import sevenElevenLogo from "@/assets/logistics/seven-eleven-logo-official.png";
import familymartLogo from "@/assets/logistics/familymart-logo-official.png";
import blackcatLogo from "@/assets/logistics/blackcat-logo-official.svg";
import postofficeLogo from "@/assets/logistics/postoffice-logo.svg";
import { TAIWAN_ZIPCODE_REGIONS, getDistricts } from "@/lib/taiwanZipcodes";
import { RecipientAddressFields } from "@/components/RecipientAddressFields";

interface Props {
  shareToken: string;
}

interface Spec {
  name: string;
  values: string[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PickupMethod =
  | "7-11 取貨（先付款）"
  | "7-11 貨到付款"
  | "全家取貨（先付款）"
  | "全家貨到付款"
  | "黑貓宅急便"
  | "郵局"
  | "面交";

function isHomeDeliveryMethod(m: string) {
  return m === "黑貓宅急便" || m === "郵局";
}
function isMeetupMethod(m: string) {
  return m === "面交";
}

function getShippingFeeLabel(m: string): string {
  const fee = getShippingFee(m);
  if (fee === 0) return "免運";
  return `+ NT$${fee}`;
}

const ALL_PICKUP_METHODS: PickupMethod[] = [
  "7-11 取貨（先付款）",
  "7-11 貨到付款",
  "全家取貨（先付款）",
  "全家貨到付款",
  "黑貓宅急便",
  "郵局",
  "面交",
];

function isPickupMethodEnabled(method: string, settings: any): boolean {
  if (method.startsWith("7-11") || method.startsWith("全家")) return settings?.shippingCvsEnabled !== false;
  if (method === "黑貓宅急便") return settings?.shippingBlackCatEnabled !== false;
  if (method === "郵局") return settings?.shippingPostOfficeEnabled !== false;
  if (method === "面交") return settings?.shippingSelfPickupEnabled !== false;
  return true;
}

function PickupMethodLogo({ method }: { method: string }) {
  if (method === "7-11 取貨（先付款）" || method === "7-11 貨到付款") {
    return (
      <div className="w-28 h-12 flex items-center justify-center shrink-0">
        <img src={sevenElevenLogo} alt="7-ELEVEN" className="max-h-10 w-auto object-contain" />
      </div>
    );
  }
  if (method === "全家取貨（先付款）" || method === "全家貨到付款") {
    return (
      <div className="w-28 h-12 flex items-center justify-center shrink-0">
        <img src={familymartLogo} alt="FamilyMart" className="max-h-10 w-auto object-contain" />
      </div>
    );
  }
  if (method === "黑貓宅急便") {
    return (
      <div className="w-28 h-12 flex items-center justify-center shrink-0">
        <img src={blackcatLogo} alt="黑貓" className="max-h-11 w-auto object-contain" />
      </div>
    );
  }
  if (method === "郵局") {
    return (
      <div className="w-16 h-14 flex items-center justify-center shrink-0">
        <img src={postofficeLogo} alt="郵局" className="w-12 h-12 object-contain" />
      </div>
    );
  }
  // 面交 — person icon
  return (
    <div className="w-14 h-14 flex items-center justify-center shrink-0 text-muted-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
        <path d="M7.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM1.5 19.125a7.5 7.5 0 0 1 15 0v.003c0 .278-.034.551-.098.815a.75.75 0 0 1-.364.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63A6.75 6.75 0 0 1 1.5 19.128Z" />
      </svg>
    </div>
  );
}

export default function PublicOrderPage({ shareToken }: Props) {
  const { data: product, isLoading, error } = useGetPublicProduct(shareToken);
  const submitOrder = useSubmitOrder();

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentLast5, setPaymentLast5] = useState("");
  // Step 7H-4: 收件資訊（買家本人不一定是收件人）
  const [sameAsBuyer, setSameAsBuyer] = useState(true);
  const [recipientNameInput, setRecipientNameInput] = useState("");
  const [recipientPhoneInput, setRecipientPhoneInput] = useState("");
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [submittedCvsStore, setSubmittedCvsStore] = useState<CvsStore | null>(null);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cvsStore, setCvsStore] = useState<CvsStore | null>(null);
  const [shippingCity, setShippingCity] = useState("");
  const [shippingDistrict, setShippingDistrict] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingAddressLine, setShippingAddressLine] = useState("");
  const [cartCount, setCartCount] = useState(() => cartTotalQty(getCart()));
  const [cartJustAdded, setCartJustAdded] = useState(false);
  const cartJustAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const specs: Spec[] = (product?.specs as Spec[]) ?? [];
  const orderDeadlineAt = product?.orderDeadlineAt ? new Date(product.orderDeadlineAt as string) : null;
  const [now, setNow] = useState(() => new Date());

  const shippingFee = getShippingFee(pickupMethod);
  const subtotal = Number(product?.price ?? 0) * quantity;
  const totalDisplay = subtotal + shippingFee;
  const needsCvsStore = isStorePickupMethod(pickupMethod);
  const availablePickupMethods = ALL_PICKUP_METHODS.filter((method) => isPickupMethodEnabled(method, product));

  useEffect(() => {
    if (pickupMethod && !isPickupMethodEnabled(pickupMethod, product)) setPickupMethod("");
  }, [pickupMethod, product]);

  useEffect(() => {
    const stored = loadCvsStore(shareToken);
    if (stored) {
      setCvsStore(stored);
      try {
        const savedMethod = localStorage.getItem(`cvs711_method_${shareToken}`);
        if (savedMethod && isStorePickupMethod(savedMethod)) {
          setPickupMethod(savedMethod);
        }
      } catch {}
    }
    try {
      const rawDraft = sessionStorage.getItem(`public_order_draft_${shareToken}`);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        if (draft.buyerName) setBuyerName(draft.buyerName);
        if (draft.buyerPhone) setBuyerPhone(draft.buyerPhone);
        if (draft.notes) setNotes(draft.notes);
        if (typeof draft.quantity === "number" && draft.quantity >= 1) setQuantity(draft.quantity);
        if (draft.specValues && typeof draft.specValues === "object") setSpecValues(draft.specValues);
      }
    } catch {}
  }, [shareToken]);

  useEffect(() => {
    if (!isStorePickupMethod(pickupMethod)) {
      if (pickupMethod !== "") setCvsStore(null);
    } else {
      const stored = loadCvsStore(shareToken);
      const expectedProvider = getPickupProvider(pickupMethod);
      if (stored && (stored.provider === expectedProvider || (!stored.provider && expectedProvider === "seven"))) {
        setCvsStore(stored);
      } else {
        setCvsStore(null);
      }
    }
  }, [pickupMethod, shareToken]);

  useEffect(() => {
    applyBrandColor(product?.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR);
  }, [product?.brandPrimaryColor]);

  useEffect(() => {
    if (!orderDeadlineAt) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [!!orderDeadlineAt]);

  const isOrderClosed =
    orderDeadlineAt != null && Number.isFinite(orderDeadlineAt.getTime()) && now >= orderDeadlineAt;

  const availableDistricts = getDistricts(shippingCity);

  // Reset "已加入" feedback when specs or quantity change
  useEffect(() => {
    if (cartJustAdded) {
      setCartJustAdded(false);
      if (cartJustAddedTimerRef.current) {
        clearTimeout(cartJustAddedTimerRef.current);
        cartJustAddedTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specValues, quantity]);

  const handleAddToCart = () => {
    if (!product) return;
    for (const spec of specs) {
      if (!specValues[spec.name]) {
        setFormError(`請選擇${spec.name}`);
        return;
      }
    }
    setFormError("");
    const newCart = addToCart({
      shareToken,
      productId: product.id,
      productName: product.name,
      productImageUrl: product.imageUrl,
      unitPrice: Number(product.price),
      quantity,
      specValues,
      shippingCvsEnabled: (product as any).shippingCvsEnabled,
      shippingBlackCatEnabled: (product as any).shippingBlackCatEnabled,
      shippingPostOfficeEnabled: (product as any).shippingPostOfficeEnabled,
      shippingSelfPickupEnabled: (product as any).shippingSelfPickupEnabled,
    });
    setCartCount(cartTotalQty(newCart));
    setCartJustAdded(true);
    if (cartJustAddedTimerRef.current) clearTimeout(cartJustAddedTimerRef.current);
    cartJustAddedTimerRef.current = setTimeout(() => {
      setCartJustAdded(false);
      cartJustAddedTimerRef.current = null;
    }, 2200);
  };

  const handleShippingCityChange = (city: string) => {
    setShippingCity(city);
    setShippingDistrict("");
    setShippingZip("");
  };

  const handleShippingDistrictChange = (district: string) => {
    setShippingDistrict(district);
    const cityData = TAIWAN_ZIPCODE_REGIONS.find((r) => r.city === shippingCity);
    const distData = cityData?.districts.find((d) => d.district === district);
    setShippingZip(distData?.zip ?? "");
  };

  const handleSelectStore = () => {
    try {
      localStorage.setItem(`cvs711_method_${shareToken}`, pickupMethod);
      sessionStorage.setItem(`public_order_draft_${shareToken}`, JSON.stringify({ buyerName, buyerPhone, notes, quantity, specValues }));
    } catch {}
    const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
    openCvsStoreMap({
      provider: getPickupProvider(pickupMethod),
      returnPath: `${basePath}/p/${shareToken}`,
      source: "customer",
      shareToken,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const deadline = product?.orderDeadlineAt ? new Date(product.orderDeadlineAt as string) : null;
    if (deadline != null && Number.isFinite(deadline.getTime()) && new Date() >= deadline) {
      setFormError("此商品已截止收單，無法送出訂單。");
      return;
    }

    if (!buyerName.trim() || !buyerPhone.trim() || !pickupMethod) {
      setFormError("請填寫姓名、電話和取貨方式");
      return;
    }

    for (const spec of specs) {
      if (!specValues[spec.name]) {
        setFormError(`請選擇${spec.name}`);
        return;
      }
    }

    if (needsCvsStore && !cvsStore) {
      const label = isFamilyMartMethod(pickupMethod) ? "全家門市" : "7-11 門市";
      setFormError(`請先選擇${label}`);
      return;
    }

    if (isHomeDeliveryMethod(pickupMethod)) {
      if (!shippingCity || !shippingDistrict || !shippingZip || !shippingAddressLine.trim()) {
        setFormError("請完整填寫收件地址");
        return;
      }
    }

    // 面交：地點選填，但填了詳細地點就要先選縣市與行政區
    if (isMeetupMethod(pickupMethod) && shippingAddressLine.trim() && (!shippingCity || !shippingDistrict)) {
      setFormError("請先選擇縣市與行政區");
      return;
    }

    // 收件資訊：勾「同買家資訊」→ 帶買家；否則必填收件人 / 收件電話
    const recipientNamePayload = sameAsBuyer ? buyerName.trim() : recipientNameInput.trim();
    const recipientPhonePayload = sameAsBuyer ? buyerPhone.trim() : recipientPhoneInput.trim();
    if (!sameAsBuyer) {
      if (!recipientNamePayload) { setFormError("請輸入收件人"); return; }
      if (!recipientPhonePayload) { setFormError("請輸入收件電話"); return; }
    }

    // 黑貓 / 郵局：完整收件地址走 recipientAddress 欄位，notes 保留買家自己的備註
    // 面交：地點選填，有選縣市 / 行政區才送，沿用同一欄位與格式
    const recipientAddressPayload = isHomeDeliveryMethod(pickupMethod)
      ? `${shippingZip} ${shippingCity}${shippingDistrict}${shippingAddressLine.trim()}`
      : isMeetupMethod(pickupMethod) && shippingCity && shippingDistrict
        ? `${shippingZip} ${shippingCity}${shippingDistrict}${shippingAddressLine.trim()}`.trim()
        : undefined;

    try {
      const body = {
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        pickupMethod,
        notes: notes.trim() || undefined,
        ...(paymentLast5.trim() ? { paymentLast5: paymentLast5.trim() } : {}),
        recipientName: recipientNamePayload,
        recipientPhone: recipientPhonePayload,
        ...(recipientAddressPayload ? { recipientAddress: recipientAddressPayload } : {}),
        specValues: Object.keys(specValues).length > 0 ? specValues : undefined,
        quantity,
        ...(cvsStore && needsCvsStore
          ? {
              cvsStoreId: cvsStore.storeId,
              cvsStoreName: cvsStore.storeName,
              cvsStoreAddress: cvsStore.storeAddress,
              cvsStorePhone: cvsStore.storePhone ?? null,
            }
          : {}),
      };

      const capturedCvsStore = needsCvsStore ? cvsStore : null;
      const order = await submitOrder.mutateAsync({ shareToken, data: body as any });
      setSubmittedOrder(order);
      setSubmittedCvsStore(capturedCvsStore);
      if (needsCvsStore) {
        clearCvsStore(shareToken);
        try { localStorage.removeItem(`cvs711_method_${shareToken}`); } catch {}
      }
      try { sessionStorage.removeItem(`public_order_draft_${shareToken}`); } catch {}
    } catch (err: any) {
      const reason = err?.data?.message || err?.data?.error || "網路或系統暫時沒有回應。";
      setFormError(formatActionableError({
        happened: "訂單沒有送出。",
        reason,
        action: "請確認欄位與網路後再按一次送出；目前資料仍留在畫面上。",
        support: "若仍失敗，請截圖並聯絡店家。",
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
        <div className="text-center">
          <div className="text-4xl mb-3">😔</div>
          <h1 className="text-lg font-bold text-foreground">商品頁無法開啟</h1>
          <p className="text-muted-foreground text-sm mt-2 whitespace-pre-line">
            {formatActionableError({
              happened: "目前看不到這件商品。",
              reason: "連結可能已失效，或商品已下架。",
              action: "請回到店家的最新分享連結再試一次。",
              support: "若仍找不到，請把這個連結傳給店家確認。",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (submittedOrder) {
    const productName = submittedOrder.productName ?? product.name;
    // 訂單總額 = 商品小計（totalPrice）+ 運費（shippingFee）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderTotal = Number((submittedOrder as any).totalPrice ?? 0) + Number((submittedOrder as any).shippingFee ?? 0);
    const token = submittedOrder.publicToken;

    const handleCopy = () => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    };

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            ✓
          </div>
          <h1 className="text-xl font-bold text-foreground">下單成功！</h1>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            您的訂單已收到，商家確認後會與您聯繫。<br />
            感謝您的訂購！
          </p>
          <div className="mt-6 bg-white rounded-2xl p-4 border border-border text-left space-y-2">
            <SummaryRow label="追蹤碼" value={token} mono />
            <SummaryRow label="商品" value={productName} />
            <SummaryRow label="數量" value={`x${submittedOrder.quantity}`} />
            <SummaryRow label="金額" value={`NT$ ${orderTotal.toLocaleString()}`} bold />
            <SummaryRow label="取貨方式" value={submittedOrder.pickupMethod} />
            <SummaryRow label="下單時間" value={formatDate(submittedOrder.createdAt)} />
          </div>
          {submittedCvsStore && (
            <div className="mt-3 bg-white rounded-2xl p-4 border border-border text-left space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">已選門市</div>
              <div className="text-sm font-semibold text-foreground">{submittedCvsStore.storeName}</div>
              <div className="text-xs text-muted-foreground">{submittedCvsStore.storeAddress}</div>
              {submittedCvsStore.storePhone && (
                <div className="text-xs text-muted-foreground">{submittedCvsStore.storePhone}</div>
              )}
              <div className="text-xs text-muted-foreground/50">門市資料可能因超商更新而異動，實際資訊以超商公告為準。</div>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={handleCopy}
              className="w-full h-11 rounded-xl border border-border bg-white text-sm font-medium text-foreground"
            >
              {copied ? "已複製！" : "複製追蹤碼"}
            </button>
            <a
              href={`/track/${token}`}
              className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-medium flex items-center justify-center"
            >
              查看訂單狀態
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            請截圖保留此頁面作為訂購憑證
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto">
      {/* Product info */}
      <div className="bg-white">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-56 object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <div className="px-5 py-5">
          <div className="text-xs text-muted-foreground mb-1">{product.storeName}</div>
          <h1 className="text-xl font-bold text-foreground">{product.name}</h1>
          {product.description && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{product.description}</p>
          )}
          <div className="text-2xl font-bold text-primary mt-3">
            NT$ {Number(product.price).toLocaleString()}
          </div>
          {product.inventory != null && (
            <div className="text-xs text-muted-foreground mt-1">剩餘庫存：{product.inventory}</div>
          )}
          {(product.storageTemp || product.shelfLife || product.weightKg != null) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground mb-2">商品規格</div>
              <div className="flex flex-wrap gap-2">
                {product.storageTemp && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-xs text-foreground">
                    溫層：{product.storageTemp === 'ambient' ? '常溫' : product.storageTemp === 'chilled' ? '冷藏' : '冷凍'}
                  </span>
                )}
                {product.shelfLife?.trim() && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-xs text-foreground">
                    保存期限：{product.shelfLife.trim()}
                  </span>
                )}
                {product.weightKg != null && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-xs text-foreground">
                    重量：{Math.round(product.weightKg * 1000)}g
                  </span>
                )}
              </div>
            </div>
          )}
          {orderDeadlineAt != null && (
            <div className="mt-4">
              {isOrderClosed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold border border-red-200">
                  已截止收單
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold border border-red-200">
                  {formatDate(product.orderDeadlineAt as string)} 截止
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Order form */}
      <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
        <div className="text-base font-bold text-foreground">填寫訂購資訊</div>

        {/* Specs */}
        {specs.map((spec) => (
          <div key={spec.name}>
            <label className="block text-sm font-medium text-foreground mb-2">{spec.name} *</label>
            <div className="flex flex-wrap gap-2">
              {spec.values.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSpecValues({ ...specValues, [spec.name]: val })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    specValues[spec.name] === val
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-foreground border-border"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">數量</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-10 h-10 rounded-xl border border-input bg-white text-foreground text-xl font-bold flex items-center justify-center"
            >
              −
            </button>
            <span className="text-lg font-bold text-foreground w-8 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              className="w-10 h-10 rounded-xl border border-input bg-white text-foreground text-xl font-bold flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {/* Add to cart + cart link */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isOrderClosed}
            className={`flex-1 h-11 rounded-xl font-bold text-sm transition-colors disabled:opacity-60 ${
              cartJustAdded
                ? "bg-green-500 text-white"
                : "bg-primary/15 text-primary border-2 border-primary/30 hover:bg-primary/20"
            }`}
          >
            {cartJustAdded ? "✓ 已加入購物車" : "加入購物車"}
          </button>
          <a
            href="/cart"
            className="relative flex items-center gap-1.5 h-11 px-4 rounded-xl border border-border bg-white text-foreground text-sm font-semibold shrink-0"
            aria-label="購物車"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M2.25 2.25a.75.75 0 000 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 00-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H5.378A2.25 2.25 0 017.5 15h11.218a.75.75 0 00.674-.421 60.358 60.358 0 002.96-7.228.75.75 0 00-.525-.965A60.864 60.864 0 005.68 4.509l-.232-.867A1.875 1.875 0 003.636 2.25H2.25zM3.75 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </a>
        </div>

        {/* Buyer info */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">姓名 *</label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="請輸入您的姓名"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">電話 *</label>
          <input
            type="tel"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
            placeholder="09xx-xxx-xxx"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">付款末五碼（選填）</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            pattern="[0-9]{5}"
            value={paymentLast5}
            onChange={(e) => setPaymentLast5(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="請填 5 位數字"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted-foreground">僅供人工對帳，不會自動判定付款。</p>
        </div>

        {/* 收件資訊（Step 7H-4：買家不一定是收件人） */}
        <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
          <p className="text-sm font-semibold text-foreground">收件資訊</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sameAsBuyer}
              onChange={(e) => {
                setSameAsBuyer(e.target.checked);
                if (!e.target.checked) {
                  setRecipientNameInput(buyerName);
                  setRecipientPhoneInput(buyerPhone);
                }
              }}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-foreground">同買家資訊</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">收件人 *</label>
            <input
              type="text"
              value={sameAsBuyer ? buyerName : recipientNameInput}
              onChange={(e) => setRecipientNameInput(e.target.value)}
              readOnly={sameAsBuyer}
              placeholder="請輸入收件人姓名"
              className={`${inputClass} ${sameAsBuyer ? "bg-muted/30 cursor-default" : ""}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">收件電話 *</label>
            <input
              type="tel"
              value={sameAsBuyer ? buyerPhone : recipientPhoneInput}
              onChange={(e) => setRecipientPhoneInput(e.target.value)}
              readOnly={sameAsBuyer}
              placeholder="09xx-xxx-xxx"
              className={`${inputClass} ${sameAsBuyer ? "bg-muted/30 cursor-default" : ""}`}
            />
          </div>
          {(formError === "請輸入收件人" || formError === "請輸入收件電話") && (
            <p className="text-xs text-destructive">{formError}</p>
          )}
        </div>

        {/* Pickup method — card button rows with inline detail */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">取貨方式 *</label>
          <div className="space-y-3">
            {availablePickupMethods.map((m) => {
              const isSelected = pickupMethod === m;
              return (
                <div key={m}>
                  {/* Card row button */}
                  <button
                    type="button"
                    onClick={() => setPickupMethod(m)}
                    className={`w-full flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:min-h-[96px] px-5 py-4 rounded-2xl border-2 transition-colors text-left shadow-sm ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-white border-border hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {/* Row 1 (mobile) / Left (desktop): radio + logo + fee(mobile only) */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      {/* Radio circle */}
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-primary" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <div className="w-3 h-3 rounded-full bg-primary" />}
                      </div>
                      {/* Logo / icon */}
                      <PickupMethodLogo method={m} />
                      {/* Fee — mobile only */}
                      <span className={`sm:hidden ml-auto text-sm font-semibold shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                        {getShippingFeeLabel(m)}
                      </span>
                    </div>
                    {/* Row 2 (mobile) / Middle (desktop): method label */}
                    <span className={`text-sm sm:text-base font-semibold leading-snug sm:flex-1 sm:px-3 ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {m}
                    </span>
                    {/* Fee — desktop only */}
                    <span className={`hidden sm:block text-base font-semibold shrink-0 ml-3 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                      {getShippingFeeLabel(m)}
                    </span>
                  </button>

                  {/* Inline detail card — only when this row is selected */}
                  {isSelected && (
                    <div className="mt-2">

                      {/* 7-11 detail */}
                      {isSevenElevenMethod(m) && (
                        <div className={`rounded-2xl px-4 py-3 space-y-2 border ${cvsStore ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}>
                          {cvsStore ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-600 shrink-0">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs font-semibold text-green-700">已選取門市</span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">{cvsStore.storeName}</span>
                                <button
                                  type="button"
                                  onClick={handleSelectStore}
                                  className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                >
                                  重選
                                </button>
                              </div>
                              <div className="text-xs text-muted-foreground">{cvsStore.storeAddress || "地址未回傳"}</div>
                              <div className="text-xs text-muted-foreground/70">門市編號：{cvsStore.storeId}</div>
                              {cvsStore.storePhone && (
                                <div className="text-xs text-muted-foreground/70">電話：{cvsStore.storePhone}</div>
                              )}
                              {!cvsStore.storeAddress && (
                                <div className="text-xs text-amber-600">地址資料未完整回傳，請確認門市資訊</div>
                              )}
                              <div className="text-xs text-muted-foreground/50">門市資料可能因超商更新而異動，實際資訊以超商公告為準。</div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold text-foreground">7-11 門市</p>
                              <p className="text-xs text-muted-foreground">請選擇取貨門市</p>
                              <button
                                type="button"
                                onClick={handleSelectStore}
                                className="w-full h-10 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                              >
                                選擇 7-11 門市
                              </button>
                              {formError === "請先選擇 7-11 門市" && (
                                <p className="text-xs text-destructive">請先選擇 7-11 門市</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* 全家 detail */}
                      {isFamilyMartMethod(m) && (
                        <div className={`rounded-2xl px-4 py-3 space-y-2 border ${cvsStore ? "bg-green-50/30 border-green-200" : "bg-white border-border"}`}>
                          {cvsStore ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-600 shrink-0">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs font-semibold text-green-700">已選取門市</span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">{cvsStore.storeName}</span>
                                <button
                                  type="button"
                                  onClick={handleSelectStore}
                                  className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
                                >
                                  重選
                                </button>
                              </div>
                              <div className="text-xs text-muted-foreground">{cvsStore.storeAddress || "地址未回傳"}</div>
                              <div className="text-xs text-muted-foreground/70">門市編號：{cvsStore.storeId}</div>
                              {cvsStore.storePhone && (
                                <div className="text-xs text-muted-foreground/70">電話：{cvsStore.storePhone}</div>
                              )}
                              {!cvsStore.storeAddress && (
                                <div className="text-xs text-amber-600">地址資料未完整回傳，請確認門市資訊</div>
                              )}
                              <div className="text-xs text-muted-foreground/50">門市資料可能因超商更新而異動，實際資訊以超商公告為準。</div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold text-foreground">全家門市</p>
                              <p className="text-xs text-muted-foreground">請選擇取貨門市</p>
                              <button
                                type="button"
                                onClick={handleSelectStore}
                                className="w-full h-10 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                              >
                                選擇全家門市
                              </button>
                              {formError === "請先選擇全家門市" && (
                                <p className="text-xs text-destructive">請先選擇全家門市</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* 黑貓 / 郵局 detail — structured address */}
                      {isHomeDeliveryMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                          <p className="text-sm font-semibold text-foreground">
                            {m === "黑貓宅急便" ? "黑貓宅急便收件資訊" : "郵局收件資訊"}
                          </p>
                          {/* City */}
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">縣市 *</label>
                            <select
                              value={shippingCity}
                              onChange={(e) => handleShippingCityChange(e.target.value)}
                              className={selectClass}
                            >
                              <option value="">請選擇縣市</option>
                              {TAIWAN_ZIPCODE_REGIONS.map((r) => (
                                <option key={r.city} value={r.city}>{r.city}</option>
                              ))}
                            </select>
                          </div>
                          {/* District */}
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">行政區 *</label>
                            <select
                              value={shippingDistrict}
                              onChange={(e) => handleShippingDistrictChange(e.target.value)}
                              disabled={!shippingCity}
                              className={`${selectClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <option value="">請選擇行政區</option>
                              {availableDistricts.map((d) => (
                                <option key={d.district} value={d.district}>{d.district}</option>
                              ))}
                            </select>
                          </div>
                          {/* Zipcode — readonly */}
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">郵遞區號</label>
                            <input
                              type="text"
                              value={shippingZip}
                              readOnly
                              placeholder="選行政區後自動帶入"
                              className={`${inputClass} bg-muted/30 cursor-default`}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">郵遞區號依縣市與行政區自動帶入</p>
                          </div>
                          {/* Address line */}
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">詳細地址 *</label>
                            <input
                              type="text"
                              value={shippingAddressLine}
                              onChange={(e) => setShippingAddressLine(e.target.value)}
                              placeholder="路名、門牌號、樓層，例如：信義路三段100號5樓"
                              className={inputClass}
                            />
                          </div>
                          {formError === "請完整填寫收件地址" && (
                            <p className="text-xs text-destructive">請完整填寫收件地址</p>
                          )}
                        </div>
                      )}

                      {/* 面交 detail — 與黑貓 / 郵局相同的結構化地點欄位（選填） */}
                      {isMeetupMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-3">
                          <p className="text-sm font-semibold text-foreground">面交地點資訊（選填）</p>
                          <RecipientAddressFields
                            city={shippingCity}
                            district={shippingDistrict}
                            zip={shippingZip}
                            addressLine={shippingAddressLine}
                            addressLineLabel="詳細地點"
                            addressLinePlaceholder="例如：台北車站東三門"
                            onCityChange={handleShippingCityChange}
                            onDistrictChange={(d, z) => { setShippingDistrict(d); setShippingZip(z); }}
                            onAddressLineChange={setShippingAddressLine}
                          />
                          {formError === "請先選擇縣市與行政區" && (
                            <p className="text-xs text-destructive">請先選擇縣市與行政區</p>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">面交備註（選填）</p>
                            <textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="例如：可面交時間（週末下午）"
                              rows={3}
                              className={`${inputClass} h-auto resize-none py-3`}
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
        </div>

        {/* General notes — only for 7-11 / 全家 / no method */}
        {!isHomeDeliveryMethod(pickupMethod) && !isMeetupMethod(pickupMethod) && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">備註（選填）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="有任何特殊需求請填寫..."
              rows={3}
              className={`${inputClass} h-auto resize-none py-3`}
            />
          </div>
        )}

        {/* Price breakdown */}
        {pickupMethod && (
          <div className="bg-secondary/40 rounded-2xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>商品小計</span>
              <span>NT$ {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>運費</span>
              <span>{shippingFee === 0 ? "免費" : `NT$ ${shippingFee}`}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/50">
              <span>訂單總額</span>
              <span className="text-primary">NT$ {totalDisplay.toLocaleString()}</span>
            </div>
          </div>
        )}

        {formError && formError !== "請先選擇 7-11 門市" && formError !== "請先選擇全家門市" && formError !== "請完整填寫收件地址" && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitOrder.isPending || isOrderClosed}
          className="w-full h-12 bg-primary text-white font-bold rounded-xl text-base disabled:opacity-60 sticky bottom-4"
        >
          {isOrderClosed
            ? "已截止收單"
            : submitOrder.isPending
            ? "送出中..."
            : `確認下單 · NT$ ${totalDisplay.toLocaleString()}`}
        </button>
      </form>
    </div>
  );
}

function SummaryRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-foreground text-right break-all ${bold ? "font-bold" : ""} ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

const inputClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
const selectClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
