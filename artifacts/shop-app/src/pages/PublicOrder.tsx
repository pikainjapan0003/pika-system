import { useState, useEffect } from "react";
import type { Order } from "@workspace/api-client-react";
import { useGetPublicProduct, useSubmitOrder } from "@workspace/api-client-react";
import LaundryCountdownTimer from "../components/LaundryCountdownTimer";
import { applyBrandColor, DEFAULT_BRAND_PRIMARY_COLOR } from "@/lib/brandColor";
import {
  isSevenElevenMethod,
  getShippingFee,
  openSevenElevenMap,
  loadCvsStore,
  clearCvsStore,
  type CvsStore,
} from "@/lib/cvs711";
import sevenElevenLogo from "@/assets/logistics/seven-eleven-logo-official.png";
import familymartLogo from "@/assets/logistics/familymart-logo-official.png";
import blackcatLogo from "@/assets/logistics/blackcat-logo-official.svg";
import postofficeLogo from "@/assets/logistics/postoffice-logo.svg";
import { TAIWAN_ZIPCODE_REGIONS, getDistricts } from "@/lib/taiwanZipcodes";

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

function isFamilyMartMethod(m: string) {
  return m === "全家取貨（先付款）" || m === "全家貨到付款";
}
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
  const [pickupMethod, setPickupMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cvsStore, setCvsStore] = useState<CvsStore | null>(null);
  const [shippingCity, setShippingCity] = useState("");
  const [shippingDistrict, setShippingDistrict] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingAddressLine, setShippingAddressLine] = useState("");

  const specs: Spec[] = (product?.specs as Spec[]) ?? [];
  const orderDeadlineAt = product?.orderDeadlineAt ? new Date(product.orderDeadlineAt as string) : null;
  const [now, setNow] = useState(() => new Date());

  const shippingFee = getShippingFee(pickupMethod);
  const subtotal = Number(product?.price ?? 0) * quantity;
  const totalDisplay = subtotal + shippingFee;
  const needs711 = isSevenElevenMethod(pickupMethod);

  useEffect(() => {
    const stored = loadCvsStore(shareToken);
    if (stored) setCvsStore(stored);
  }, [shareToken]);

  useEffect(() => {
    if (!needs711) {
      if (!isSevenElevenMethod(pickupMethod) && pickupMethod !== "") {
        setCvsStore(null);
      }
    } else {
      const stored = loadCvsStore(shareToken);
      if (stored) setCvsStore(stored);
    }
  }, [pickupMethod, needs711, shareToken]);

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
  const remainingMs = orderDeadlineAt ? Math.max(0, orderDeadlineAt.getTime() - now.getTime()) : 0;

  const availableDistricts = getDistricts(shippingCity);

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
    const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
    openSevenElevenMap({
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

    if (needs711 && !cvsStore) {
      setFormError("請先選擇 7-11 門市");
      return;
    }

    if (isHomeDeliveryMethod(pickupMethod)) {
      if (!shippingCity || !shippingDistrict || !shippingZip || !shippingAddressLine.trim()) {
        setFormError("請完整填寫收件地址");
        return;
      }
    }

    const notesPayload = isHomeDeliveryMethod(pickupMethod)
      ? `${shippingZip} ${shippingCity}${shippingDistrict}${shippingAddressLine.trim()}`
      : notes.trim() || undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        pickupMethod,
        notes: notesPayload,
        specValues: Object.keys(specValues).length > 0 ? specValues : undefined,
        quantity,
        shippingFee: needs711 ? shippingFee : getShippingFee(pickupMethod),
        ...(cvsStore && needs711
          ? {
              cvsStoreId: cvsStore.storeId,
              cvsStoreName: cvsStore.storeName,
              cvsStoreAddress: cvsStore.storeAddress,
              cvsStorePhone: cvsStore.storePhone ?? null,
              storeSelectedBy: "customer",
            }
          : {}),
      };

      const order = await submitOrder.mutateAsync({ shareToken, data: body });
      setSubmittedOrder(order);
      if (needs711) clearCvsStore(shareToken);
    } catch (err: any) {
      setFormError(err?.data?.message || err?.data?.error || "下單失敗，請稍後再試");
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
          <h1 className="text-lg font-bold text-foreground">商品不存在</h1>
          <p className="text-muted-foreground text-sm mt-1">此連結已失效或商品已下架</p>
        </div>
      </div>
    );
  }

  if (submittedOrder) {
    const productName = submittedOrder.productName ?? product.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderTotal = Number((submittedOrder as any).totalPrice ?? 0);
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
            <LaundryCountdownTimer
              remainingMs={remainingMs}
              closed={isOrderClosed}
              deadlineLabel={formatDate(product.orderDeadlineAt as string)}
            />
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

        {/* Pickup method — card button rows with inline detail */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">取貨方式 *</label>
          <div className="space-y-3">
            {ALL_PICKUP_METHODS.map((m) => {
              const isSelected = pickupMethod === m;
              return (
                <div key={m}>
                  {/* Card row button */}
                  <button
                    type="button"
                    onClick={() => setPickupMethod(m)}
                    className={`w-full flex items-center justify-between min-h-[96px] px-5 py-4 rounded-2xl border-2 transition-colors text-left shadow-sm ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-white border-border hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {/* Left: radio + logo + label */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Radio circle */}
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-primary" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <div className="w-3 h-3 rounded-full bg-primary" />}
                      </div>
                      {/* Logo / icon */}
                      <PickupMethodLogo method={m} />
                      <span className={`text-base font-semibold leading-snug whitespace-normal ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {m}
                      </span>
                    </div>
                    {/* Right: shipping fee */}
                    <span className={`text-base font-semibold shrink-0 ml-3 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                      {getShippingFeeLabel(m)}
                    </span>
                  </button>

                  {/* Inline detail card — only when this row is selected */}
                  {isSelected && (
                    <div className="mt-2">

                      {/* 7-11 detail */}
                      {isSevenElevenMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-2">
                          {cvsStore ? (
                            <>
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
                              {!cvsStore.storeAddress && (
                                <div className="text-xs text-amber-600">地址資料未完整回傳，請確認門市資訊</div>
                              )}
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
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 space-y-1">
                          <p className="text-xs font-semibold text-amber-800">全家取貨</p>
                          <p className="text-xs text-amber-700 leading-relaxed">
                            全家門市選擇功能尚未開放，請先於備註填寫希望取貨門市，或改選 7-11。
                          </p>
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

                      {/* 面交 detail */}
                      {isMeetupMethod(m) && (
                        <div className="bg-white border border-border rounded-2xl px-4 py-3 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">面交資訊（選填）</p>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="請填寫希望面交的地點與可面交時間，例如：台北車站一號出口 / 週末下午"
                            rows={3}
                            className={`${inputClass} h-auto resize-none py-3`}
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

        {formError && formError !== "請先選擇 7-11 門市" && formError !== "請完整填寫收件地址" && (
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
