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

const ALL_PICKUP_METHODS = [
  "面交",
  "7-11 貨到付款",
  "7-11 取貨（先付款）",
  "全家貨到付款",
  "全家取貨（先付款）",
  "OK Mart",
  "萊爾富物流",
  "宅配",
] as const;

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

  const specs: Spec[] = (product?.specs as Spec[]) ?? [];
  const orderDeadlineAt = product?.orderDeadlineAt ? new Date(product.orderDeadlineAt as string) : null;
  const [now, setNow] = useState(() => new Date());

  const shippingFee = getShippingFee(pickupMethod);
  const subtotal = Number(product?.price ?? 0) * quantity;
  const totalDisplay = subtotal + shippingFee;
  const needs711 = isSevenElevenMethod(pickupMethod);

  // Load CVS store from localStorage when page mounts or becomes visible
  useEffect(() => {
    const stored = loadCvsStore(shareToken);
    if (stored) setCvsStore(stored);
  }, [shareToken]);

  // Clear CVS store when switching away from 7-11 methods
  useEffect(() => {
    if (!needs711) {
      // Don't clear localStorage, just hide from UI
      // Data stays in localStorage so user can switch back
      if (!isSevenElevenMethod(pickupMethod) && pickupMethod !== "") {
        setCvsStore(null);
      }
    } else {
      // Reload from localStorage when switching to 7-11
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        pickupMethod,
        notes: notes.trim() || undefined,
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

        {/* Pickup method */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">取貨方式 *</label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_PICKUP_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPickupMethod(m)}
                className={`h-11 rounded-xl text-sm font-medium border transition-colors px-2 ${
                  pickupMethod === m
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-foreground border-border"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* 7-11 store selector */}
        {needs711 && (
          <div className="space-y-2">
            {cvsStore ? (
              <CvsStoreCard store={cvsStore} onReselect={handleSelectStore} />
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleSelectStore}
                  className="w-full h-11 rounded-xl border-2 border-primary bg-primary/5 text-primary text-sm font-semibold"
                >
                  選擇 7-11 門市
                </button>
                {formError === "請先選擇 7-11 門市" && (
                  <p className="text-xs text-destructive">請先選擇 7-11 門市</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
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

        {formError && formError !== "請先選擇 7-11 門市" && (
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

function CvsStoreCard({ store, onReselect }: { store: CvsStore; onReselect: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-primary/30 px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">7-11 {store.storeName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{store.storeAddress || "地址未回傳"}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">門市編號：{store.storeId}</div>
          {!store.storeAddress && (
            <div className="text-xs text-amber-600 mt-1">地址資料未完整回傳，請確認門市資訊</div>
          )}
        </div>
        <button
          type="button"
          onClick={onReselect}
          className="shrink-0 text-xs font-medium text-primary border border-primary/30 px-2.5 py-1 rounded-lg"
        >
          重選門市
        </button>
      </div>
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
