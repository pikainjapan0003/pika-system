import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useGetProduct, useCreateProduct, useUpdateProduct, getListProductsQueryKey, Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Spec {
  name: string;
  values: string[];
}

interface Props {
  productId?: number;
}

export default function ProductFormPage({ productId }: Props) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isEdit = !!productId;

  const { data: store } = useGetMyStore();
  const storeId = store?.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingProduct } = useGetProduct(storeId!, productId!, { query: { enabled: isEdit && !!storeId && !!productId } as any });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [inventory, setInventory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [error, setError] = useState("");
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setDescription(existingProduct.description ?? "");
      setPrice(String(existingProduct.price));
      setInventory(existingProduct.inventory != null ? String(existingProduct.inventory) : "");
      setImageUrl(existingProduct.imageUrl ?? "");
      setSpecs((existingProduct.specs as Spec[]) ?? []);
    }
  }, [existingProduct]);

  const addSpec = () => {
    setSpecs([...specs, { name: "", values: [""] }]);
  };

  const removeSpec = (i: number) => {
    setSpecs(specs.filter((_, idx) => idx !== i));
  };

  const updateSpecName = (i: number, val: string) => {
    const s = [...specs];
    s[i] = { ...s[i], name: val };
    setSpecs(s);
  };

  const updateSpecValues = (i: number, val: string) => {
    const s = [...specs];
    s[i] = { ...s[i], values: val.split(/[，,]/).map((v) => v.trim()).filter(Boolean) };
    setSpecs(s);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !price) {
      setError("請填寫商品名稱和售價");
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("請輸入有效的售價");
      return;
    }

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      inventory: inventory ? parseInt(inventory) : undefined,
      imageUrl: imageUrl.trim() || undefined,
      specs: specs.filter((s) => s.name && s.values.length > 0),
    };

    try {
      if (isEdit) {
        await updateProduct.mutateAsync({ storeId: storeId!, productId: productId!, data });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
        setLocation("/products");
      } else {
        const result = await createProduct.mutateAsync({ storeId: storeId!, data });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
        setCreatedProduct(result);
      }
    } catch (err: any) {
      setError(err?.data?.error || "操作失敗，請稍後再試");
    }
  };

  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const shareUrl = createdProduct ? `${origin}${basePath}/p/${createdProduct.shareToken}` : "";

  const copyShareLink = () => {
    if (!shareUrl || !navigator.clipboard) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  if (createdProduct) {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">
        <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
          <h1 className="text-lg font-bold text-foreground">商品已建立！</h1>
        </header>
        <div className="px-5 py-6 space-y-4">
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">✓</div>
              <div>
                <p className="font-semibold text-foreground">{createdProduct.name}</p>
                <p className="text-xs text-muted-foreground">商品已成功建立</p>
              </div>
            </div>

            <div className="bg-secondary rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">商品下單連結</p>
              <p className="text-sm text-foreground break-all font-mono">{shareUrl}</p>
            </div>

            <button
              type="button"
              onClick={copyShareLink}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base"
            >
              {copied ? "已複製連結" : "複製下單連結"}
            </button>

            <button
              type="button"
              onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
              className="w-full h-12 bg-secondary text-foreground font-semibold rounded-xl text-base"
            >
              預覽公開頁
            </button>
          </div>

          <button
            type="button"
            onClick={() => setLocation("/products")}
            className="w-full h-12 border border-border bg-white text-foreground font-medium rounded-xl text-base"
          >
            前往商品列表
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatedProduct(null);
              setName("");
              setDescription("");
              setPrice("");
              setInventory("");
              setImageUrl("");
              setSpecs([]);
              setError("");
            }}
            className="w-full h-10 text-sm text-primary font-medium"
          >
            再新增一個商品
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/products")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary text-foreground text-lg"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-foreground">{isEdit ? "編輯商品" : "新增商品"}</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
        <Field label="商品名稱 *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：日本草莓大福"
            className={inputClass}
          />
        </Field>

        <Field label="商品描述">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="詳細描述商品內容..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="售價 (NT$) *">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              step="1"
              className={inputClass}
            />
          </Field>
          <Field label="庫存數量">
            <input
              type="number"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              placeholder="不限"
              min="0"
              step="1"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground mt-1">留空代表不限庫存</p>
          </Field>
        </div>

        <Field label="商品圖片網址">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-1">可先留空，之後再補圖片網址</p>
          {imageUrl && (
            <img src={imageUrl} alt="" className="mt-2 w-full h-32 object-cover rounded-xl" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
        </Field>

        {/* Specs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-foreground">規格選項</label>
            <button
              type="button"
              onClick={addSpec}
              className="text-xs text-primary font-medium"
            >
              + 新增規格
            </button>
          </div>
          <div className="space-y-3">
            {specs.map((spec, i) => (
              <div key={i} className="bg-secondary/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={spec.name}
                    onChange={(e) => updateSpecName(i, e.target.value)}
                    placeholder="規格名稱（例：顏色）"
                    className="flex-1 h-9 px-3 rounded-lg border border-input bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(i)}
                    className="ml-2 w-9 h-9 flex items-center justify-center text-destructive text-lg"
                  >
                    ×
                  </button>
                </div>
                <input
                  type="text"
                  value={spec.values.join("，")}
                  onChange={(e) => updateSpecValues(i, e.target.value)}
                  placeholder="選項，用逗號分隔（例：紅色，藍色，白色）"
                  className="w-full h-9 px-3 rounded-lg border border-input bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
          </div>
          {specs.length === 0 && (
            <p className="text-xs text-muted-foreground">選填。例如：顏色、尺寸、口味</p>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
        >
          {isPending ? "儲存中..." : isEdit ? "儲存變更" : "建立商品"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
