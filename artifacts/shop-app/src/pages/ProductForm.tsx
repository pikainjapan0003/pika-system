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
      <form onSubmit={handleSubmit}>

        {/* Three-column header */}
        <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setLocation("/products")}
              className="text-sm font-medium text-muted-foreground min-w-[3rem] text-left"
            >
              取消
            </button>
            <h1 className="text-base font-bold text-foreground">
              {isEdit ? "編輯商品" : "新增商品"}
            </h1>
            <button
              type="submit"
              disabled={isPending || uploadStatus === "uploading"}
              className="text-sm font-semibold text-primary disabled:opacity-40 min-w-[3rem] text-right"
            >
              {isPending ? "儲存中…" : isEdit ? "儲存" : "建立"}
            </button>
          </div>
        </header>

        <div className="px-4 py-5 space-y-4">

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-2xl">
              {error}
            </div>
          )}

          {/* ── 商品圖 ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-sm font-bold text-foreground">商品圖</h2>
              <span className="text-[10px] text-muted-foreground/60">目前最多 1 張，第一張作為主圖</span>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Image strip */}
              <div className="flex gap-2 items-start">
                {displayPreview && (
                  <div className="relative flex-shrink-0">
                    <img
                      src={displayPreview}
                      alt="商品圖"
                      className="w-24 h-24 rounded-xl object-cover"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                    {/* 主圖 badge */}
                    <span className="absolute bottom-1 left-1 text-xs bg-primary text-white font-semibold px-1.5 py-0.5 rounded-md leading-none">
                      主圖
                    </span>
                    {/* × remove */}
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={uploadStatus === "uploading"}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700/80 text-white rounded-full flex items-center justify-center text-xs leading-none disabled:opacity-50"
                    >
                      ×
                    </button>
                    {/* Uploading overlay */}
                    {uploadStatus === "uploading" && (
                      <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                {/* Add / replace photo button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadStatus === "uploading"}
                  className="w-24 h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="text-xs">{displayPreview ? "更換" : "加入照片"}</span>
                </button>
              </div>

              {/* Counter + upload status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  已上傳 {displayPreview ? "1" : "0"} / 1
                </span>
                {uploadStatus === "done" && (
                  <span className="text-xs text-green-600 font-medium">✓ 圖片已上傳</span>
                )}
                {uploadStatus === "error" && uploadError && (
                  <span className="text-xs text-destructive">{uploadError}</span>
                )}
              </div>

              {/* Advanced URL input */}
              <div>
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
          </div>

          {/* ── 基本資訊 ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-sm font-bold text-foreground">基本資訊</h2>
            </div>
            <div className="px-5 pb-5">
              <label className="block text-xs text-muted-foreground mb-1.5">商品名稱 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：日本草莓大福"
                className={inputClass}
              />
            </div>
          </div>

          {/* ── 售價與庫存 ────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-sm font-bold text-foreground">售價與庫存</h2>
            </div>
            <div className="px-5 pb-5 space-y-0">
              <div className="pb-4">
                <label className="block text-xs text-muted-foreground mb-2">售價 *</label>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-muted-foreground/60 select-none">NT$</span>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="flex-1 h-16 px-4 rounded-xl border border-input bg-white text-foreground text-2xl font-bold placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="border-t border-border/50 pt-4">
                <label className="block text-xs text-muted-foreground mb-1.5">庫存數量</label>
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
              </div>
            </div>
          </div>

          {/* ── 規格設定 ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-sm font-bold text-foreground">規格設定</h2>
              <p className="text-xs text-muted-foreground mt-0.5">選填 — 例如顏色 × 尺寸</p>
            </div>
            <div className="px-5 pb-5">
              {specs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-muted-foreground">尚未設定規格</p>
                  <button
                    type="button"
                    onClick={addSpec}
                    className="h-9 px-5 bg-primary text-white text-sm font-semibold rounded-xl"
                  >
                    + 新增規格
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
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
                  <button
                    type="button"
                    onClick={addSpec}
                    className="text-sm text-primary font-medium"
                  >
                    + 新增規格
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 商品描述 ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-sm font-bold text-foreground">商品描述</h2>
              <p className="text-xs text-muted-foreground mt-0.5">會顯示在賣場商品詳情頁</p>
            </div>
            <div className="px-5 pb-5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="輸入商品說明..."
                rows={5}
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}

const inputClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
