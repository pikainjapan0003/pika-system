import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useGetProduct, useCreateProduct, useUpdateProduct, getListProductsQueryKey, Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Spec {
  name: string;
  values: string[];
}

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface Props {
  productId?: number;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function ProductFormPage({ productId }: Props) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { getToken } = useAuth();
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

  // Image picker state
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

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

  const addSpec = () => setSpecs([...specs, { name: "", values: [""] }]);

  const removeSpec = (i: number) => setSpecs(specs.filter((_, idx) => idx !== i));

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

  // Revoke current object URL and clear local preview state (shared helper)
  const clearLocalPreview = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setLocalPreviewUrl(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so same file can be re-selected
    e.target.value = "";
    if (!file) return;

    setUploadError("");

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadStatus("error");
      setUploadError("僅支援 JPG、PNG、WebP 圖片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadStatus("error");
      setUploadError("圖片大小不可超過 5MB");
      return;
    }

    // Show local preview immediately
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    const preview = URL.createObjectURL(file);
    previewObjectUrlRef.current = preview;
    setLocalPreviewUrl(preview);
    setUploadStatus("uploading");

    if (!storeId) {
      clearLocalPreview();
      setUploadStatus("error");
      setUploadError("無法上傳：商店尚未載入，請稍後再試");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/products/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 401 || res.status === 403) {
        clearLocalPreview();
        setUploadStatus("error");
        setUploadError("沒有權限上傳圖片，請重新登入");
        return;
      }
      if (res.status === 429) {
        clearLocalPreview();
        setUploadStatus("error");
        setUploadError("上傳太頻繁，請稍後再試");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        clearLocalPreview();
        setUploadStatus("error");
        setUploadError(body.error ?? "圖片上傳失敗，請稍後再試");
        return;
      }

      const data = await res.json() as { imageUrl?: string };
      if (!data.imageUrl) {
        clearLocalPreview();
        setUploadStatus("error");
        setUploadError("圖片上傳失敗，請稍後再試");
        return;
      }

      setImageUrl(data.imageUrl);
      setUploadStatus("done");
    } catch {
      clearLocalPreview();
      setUploadStatus("error");
      setUploadError("圖片上傳失敗，請稍後再試");
    }
  };

  const handleRemoveImage = () => {
    clearLocalPreview();
    setImageUrl("");
    setUploadStatus("idle");
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    const trimmedImageUrl = imageUrl.trim();
    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      inventory: inventory ? parseInt(inventory) : undefined,
      // Edit mode: send "" to explicitly clear imageUrl in DB (API PATCH skips undefined but stores "")
      // Create mode: send undefined when empty (field simply not included)
      imageUrl: trimmedImageUrl || (isEdit ? "" : undefined),
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
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } };
      setError(apiErr?.data?.error || "操作失敗，請稍後再試");
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

  // Display priority: local blob preview (newly selected) > saved imageUrl
  const displayPreview = localPreviewUrl ?? (imageUrl || null);

  // ── Create success card ──────────────────────────────────────────────────────
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
              clearLocalPreview();
              setCreatedProduct(null);
              setName("");
              setDescription("");
              setPrice("");
              setInventory("");
              setImageUrl("");
              setSpecs([]);
              setError("");
              setUploadStatus("idle");
              setUploadError("");
              setShowUrlInput(false);
            }}
            className="w-full h-10 text-sm text-primary font-medium"
          >
            再新增一個商品
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
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

        {/* Image picker */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">商品圖片</label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {displayPreview ? (
            /* Preview + action buttons */
            <div className="space-y-2">
              <div className="relative">
                <img
                  src={displayPreview}
                  alt="商品圖片預覽"
                  className="w-full h-40 object-cover rounded-xl"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadStatus === "uploading"}
                  className="flex-1 h-9 text-sm font-medium bg-secondary text-foreground rounded-xl disabled:opacity-50"
                >
                  更換圖片
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={uploadStatus === "uploading"}
                  className="flex-1 h-9 text-sm font-medium text-destructive border border-destructive/30 rounded-xl disabled:opacity-50"
                >
                  移除圖片
                </button>
              </div>
            </div>
          ) : (
            /* Select image button */
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus === "uploading"}
              className="w-full border-2 border-dashed border-border rounded-xl py-6 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
            >
              <span className="text-2xl">📷</span>
              <span className="text-sm font-medium">點此選擇圖片</span>
              <span className="text-xs">支援 JPG、PNG、WebP，5MB 以內</span>
            </button>
          )}

          {/* Upload status */}
          {uploadStatus === "uploading" && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              圖片上傳中...
            </div>
          )}
          {uploadStatus === "done" && (
            <p className="mt-2 text-sm text-green-600 font-medium">✓ 圖片已上傳</p>
          )}
          {uploadStatus === "error" && uploadError && (
            <p className="mt-2 text-sm text-destructive">{uploadError}</p>
          )}

          {/* Advanced: direct URL input */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowUrlInput((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <span>進階：直接輸入圖片網址</span>
              <span>{showUrlInput ? "▲" : "▼"}</span>
            </button>
            {showUrlInput && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  一般情況建議直接選擇圖片；已有公開圖片網址時才使用此欄位。
                </p>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    // Clear local blob preview so the typed URL takes over display
                    if (localPreviewUrl) {
                      clearLocalPreview();
                      setUploadStatus("idle");
                    }
                  }}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </div>

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
          disabled={isPending || uploadStatus === "uploading"}
          className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
        >
          {isPending ? "儲存中..." : isEdit ? "儲存變更" : "建立商品"}
        </button>
        {uploadStatus === "uploading" && (
          <p className="text-center text-xs text-muted-foreground -mt-3">圖片上傳中，請稍候...</p>
        )}
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
