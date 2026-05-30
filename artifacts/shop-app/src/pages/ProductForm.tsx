import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useGetProduct, useCreateProduct, useUpdateProduct, getListProductsQueryKey } from "@workspace/api-client-react";
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
    s[i] = { ...s[i], values: val.split("，").map((v) => v.trim()).filter(Boolean) };
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
      } else {
        await createProduct.mutateAsync({ storeId: storeId!, data });
      }
      qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
      setLocation("/products");
    } catch (err: any) {
      setError(err?.data?.error || "操作失敗，請稍後再試");
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

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
                  placeholder="選項，用全形逗號分隔（例：紅色，藍色，白色）"
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
