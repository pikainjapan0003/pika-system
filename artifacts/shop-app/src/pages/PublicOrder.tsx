import { useState } from "react";
import { useGetPublicProduct, useSubmitOrder } from "@workspace/api-client-react";

interface Props {
  shareToken: string;
}

interface Spec {
  name: string;
  values: string[];
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
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const specs: Spec[] = (product?.specs as Spec[]) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

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

    try {
      await submitOrder.mutateAsync({
        shareToken,
        data: {
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          pickupMethod,
          notes: notes.trim() || undefined,
          specValues: Object.keys(specValues).length > 0 ? specValues : undefined,
          quantity,
        },
      });
      setSubmitted(true);
    } catch (err: any) {
      setFormError(err?.data?.error || "下單失敗，請稍後再試");
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

  if (submitted) {
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
            <SummaryRow label="商品" value={product.name} />
            <SummaryRow label="數量" value={`x${quantity}`} />
            <SummaryRow label="金額" value={`NT$ ${(Number(product.price) * quantity).toLocaleString()}`} bold />
            <SummaryRow label="取貨方式" value={pickupMethod} />
          </div>
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
            <span className="text-sm text-muted-foreground ml-2">
              小計：NT$ {(Number(product.price) * quantity).toLocaleString()}
            </span>
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

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">取貨方式 *</label>
          <div className="grid grid-cols-3 gap-2">
            {["自取", "宅配", "其他"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPickupMethod(m)}
                className={`h-11 rounded-xl text-sm font-medium border transition-colors ${
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

        {formError && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitOrder.isPending}
          className="w-full h-12 bg-primary text-white font-bold rounded-xl text-base disabled:opacity-60 sticky bottom-4"
        >
          {submitOrder.isPending ? "送出中..." : `確認下單 · NT$ ${(Number(product.price) * quantity).toLocaleString()}`}
        </button>
      </form>
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

const inputClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
