import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useGetProduct, useCreateProduct, useUpdateProduct, useListProductCategories, getListProductsQueryKey, Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Spec {
  name: string;
  values: string[];
}

type UploadStatus = "idle" | "uploading" | "done" | "error";
type DeadlinePreset = "tonight" | "tomorrow" | "dayafter" | "custom";
type StorageTemp = "ambient" | "chilled" | "frozen";

interface Props {
  productId?: number;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59];
const PICKER_ITEM_H = 48;

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
  const { data: categories, isError: categoriesQueryError } = useListProductCategories(storeId ?? 0, { query: { enabled: !!storeId } as any });
  const categoriesLoadError = categoriesQueryError && !!storeId;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [inventory, setInventory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [error, setError] = useState("");
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState(false);
  const [internalNote, setInternalNote] = useState("");

  const [skuCode, setSkuCode] = useState("");
  const [storageTemp, setStorageTemp] = useState<StorageTemp | null>(null);
  const [shelfLife, setShelfLife] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  // Order deadline (UI placeholder — not sent to API)
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlinePreset, setDeadlinePreset] = useState<DeadlinePreset | null>(null);
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [calViewYear, setCalViewYear] = useState(() => new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(() => new Date().getMonth());
  const [pendingDate, setPendingDate] = useState<{ y: number; m: number; d: number } | null>(null);
  const [pendingAmPm, setPendingAmPm] = useState<"am" | "pm">("pm");
  const [pendingHour, setPendingHour] = useState(11);
  const [pendingMinute, setPendingMinute] = useState(59);

  // Image picker state
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const ampmColRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);
  const ampmScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hourScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minuteScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      if (ampmScrollTimer.current) clearTimeout(ampmScrollTimer.current);
      if (hourScrollTimer.current) clearTimeout(hourScrollTimer.current);
      if (minuteScrollTimer.current) clearTimeout(minuteScrollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showTimeSheet) return;
    requestAnimationFrame(() => {
      ampmColRef.current?.scrollTo({ top: (pendingAmPm === "pm" ? 1 : 0) * PICKER_ITEM_H });
      hourColRef.current?.scrollTo({ top: (pendingHour - 1) * PICKER_ITEM_H });
      const idx = MINUTE_STEPS.indexOf(pendingMinute);
      minuteColRef.current?.scrollTo({ top: (idx >= 0 ? idx : 0) * PICKER_ITEM_H });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTimeSheet]);

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setDescription(existingProduct.description ?? "");
      setPrice(String(existingProduct.price));
      setInventory(existingProduct.inventory != null ? String(existingProduct.inventory) : "");
      setImageUrl(existingProduct.imageUrl ?? "");
      setSpecs((existingProduct.specs as Spec[]) ?? []);
      setInternalNote(existingProduct.internalNote ?? "");
      setSkuCode(existingProduct.skuCode ?? "");
      setStorageTemp((existingProduct.storageTemp as StorageTemp) ?? null);
      setShelfLife(existingProduct.shelfLife ?? "");
      setWeightKg(existingProduct.weightKg != null ? String(existingProduct.weightKg * 1000) : "");
      setCategoryId(existingProduct.categoryId ?? null);
      if (existingProduct.orderDeadlineAt) {
        const dt = new Date(existingProduct.orderDeadlineAt);
        if (!isNaN(dt.getTime())) {
          setDeadlineEnabled(true);
          setDeadlinePreset("custom");
          setDeadlineDate(`${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`);
          setDeadlineTime(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);
        }
      }
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

    const computeOrderDeadlineAt = (): string | null => {
      if (!deadlineEnabled) return null;
      let dateStr = "";
      if (deadlinePreset === "tonight") {
        const d = new Date();
        dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      } else if (deadlinePreset === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1);
        dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      } else if (deadlinePreset === "dayafter") {
        const d = new Date(); d.setDate(d.getDate() + 2);
        dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      } else if (deadlinePreset === "custom") {
        dateStr = deadlineDate;
      }
      if (!dateStr) return null;
      const parts = dateStr.split("/").map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return null;
      const [hh, mm] = deadlineTime.split(":").map(Number);
      const dt = new Date(parts[0], parts[1] - 1, parts[2], hh, mm, 0);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    };

    const weightKgNum = weightKg.trim() ? parseFloat(weightKg) / 1000 : null;
    if (weightKg.trim() && (weightKgNum === null || isNaN(weightKgNum))) {
      setError("請輸入有效的重量");
      return;
    }

    const baseFields = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      inventory: inventory ? parseInt(inventory) : undefined,
      imageUrl: trimmedImageUrl || (isEdit ? "" : undefined),
      specs: specs.filter((s) => s.name && s.values.length > 0),
    };

    try {
      if (isEdit) {
        const data = {
          ...baseFields,
          orderDeadlineAt: computeOrderDeadlineAt(),
          internalNote: internalNote.trim() || null,
          skuCode: skuCode.trim() || null,
          storageTemp: storageTemp,
          shelfLife: shelfLife.trim() || null,
          weightKg: weightKgNum,
          categoryId: categoryId,
        };
        await updateProduct.mutateAsync({ storeId: storeId!, productId: productId!, data });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey(storeId!) });
        setLocation("/products");
      } else {
        const deadlineAt = computeOrderDeadlineAt();
        const data = {
          ...baseFields,
          ...(deadlineAt ? { orderDeadlineAt: deadlineAt } : {}),
          ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
          ...(skuCode.trim() ? { skuCode: skuCode.trim() } : {}),
          ...(storageTemp ? { storageTemp } : {}),
          ...(shelfLife.trim() ? { shelfLife: shelfLife.trim() } : {}),
          ...(weightKgNum != null ? { weightKg: weightKgNum } : {}),
          ...(categoryId != null ? { categoryId } : {}),
        };
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

  const getDeadlineDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const openDateSheet = () => {
    if (deadlineDate) {
      const parts = deadlineDate.split("/").map(Number);
      setCalViewYear(parts[0]);
      setCalViewMonth(parts[1] - 1);
      setPendingDate({ y: parts[0], m: parts[1] - 1, d: parts[2] });
    } else {
      const now = new Date();
      setCalViewYear(now.getFullYear());
      setCalViewMonth(now.getMonth());
      setPendingDate(null);
    }
    setShowDateSheet(true);
  };

  const confirmDateSheet = () => {
    if (pendingDate) {
      setDeadlineDate(`${pendingDate.y}/${pendingDate.m + 1}/${pendingDate.d}`);
    }
    setShowDateSheet(false);
  };

  const openTimeSheet = () => {
    const [hh, mm] = deadlineTime.split(":").map(Number);
    const isPm = hh >= 12;
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    setPendingAmPm(isPm ? "pm" : "am");
    setPendingHour(h12);
    setPendingMinute(mm);
    setShowTimeSheet(true);
  };

  const confirmTimeSheet = () => {
    let h = pendingHour;
    if (pendingAmPm === "am" && h === 12) h = 0;
    else if (pendingAmPm === "pm" && h !== 12) h += 12;
    setDeadlineTime(`${String(h).padStart(2, "0")}:${String(pendingMinute).padStart(2, "0")}`);
    setShowTimeSheet(false);
  };

  const formatDeadlineTimeDisplay = () => {
    const [hh, mm] = deadlineTime.split(":").map(Number);
    const isPm = hh >= 12;
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${isPm ? "下午" : "上午"} ${h12}:${String(mm).padStart(2, "0")}`;
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  // Display priority: local blob preview (newly selected) > saved imageUrl
  const displayPreview = localPreviewUrl ?? (imageUrl || null);

  // ── Create success / share page ─────────────────────────────────────────────
  if (createdProduct) {
    return (
      <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-8">

        {/* Three-column header */}
        <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <span className="min-w-[3rem]" />
            <h1 className="text-base font-bold text-foreground">商品已建立</h1>
            <button
              type="button"
              onClick={() => setLocation("/products")}
              className="text-sm font-semibold text-primary min-w-[3rem] text-right"
            >
              完成
            </button>
          </div>
        </header>

        <div className="px-5 py-5 space-y-4">

          {/* ── 分享卡片 ─────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            {/* 商品主圖 */}
            {createdProduct.imageUrl ? (
              <img
                src={createdProduct.imageUrl}
                alt={createdProduct.name}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-32 bg-secondary flex items-center justify-center text-4xl">
                📦
              </div>
            )}
            {/* 商品資訊 */}
            <div className="px-5 py-4 space-y-1">
              <p className="text-lg font-bold text-foreground leading-snug">{createdProduct.name}</p>
              <p className="text-primary font-bold text-xl">
                NT$ {Number(createdProduct.price).toLocaleString()}
              </p>
              {store?.name && (
                <p className="text-xs text-muted-foreground mt-1">{store.name}</p>
              )}
            </div>
          </div>

          {/* ── 商品下單連結 ──────────────────────── */}
          <div className="bg-white rounded-2xl border border-border px-5 py-3">
            <p className="text-xs text-muted-foreground mb-1.5">商品下單連結</p>
            <p className="text-xs text-foreground break-all font-mono leading-relaxed">{shareUrl}</p>
          </div>

          {/* ── 主要按鈕 ──────────────────────────── */}
          <button
            type="button"
            onClick={copyShareLink}
            className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base"
          >
            {copied ? "✓ 已複製連結" : "複製商品連結"}
          </button>

          {/* ── 次要按鈕 ──────────────────────────── */}
          <button
            type="button"
            onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
            className="w-full h-12 bg-secondary text-foreground font-semibold rounded-xl text-base"
          >
            預覽公開頁
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
              setInternalNote("");
              setSkuCode("");
              setStorageTemp(null);
              setShelfLife("");
              setWeightKg("");
              setCategoryId(null);
              setDeadlineEnabled(false);
              setDeadlinePreset(null);
              setDeadlineDate("");
              setDeadlineTime("23:59");
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
            <div className="px-5 pb-5 space-y-4">
              {/* 商品名稱 */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">商品名稱 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例：日本草莓大福"
                  className={inputClass}
                />
              </div>
              {/* 貨品編號 */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">貨品編號</label>
                <input
                  type="text"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  placeholder="可輸入商品編號或直播編號"
                  className={inputClass}
                />
              </div>
              {/* 主分類 */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">主分類</label>
                {categoriesLoadError ? (
                  <p className="text-xs text-destructive">分類載入失敗，請稍後再試</p>
                ) : !categories || categories.length === 0 ? (
                  <div className="h-12 px-4 rounded-xl border border-input bg-secondary/40 flex items-center">
                    <span className="text-sm text-muted-foreground">尚未建立分類</span>
                  </div>
                ) : (
                  <select
                    value={categoryId ?? ""}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base"
                  >
                    <option value="">未分類</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {/* 溫層 */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">溫層</label>
                <div className="flex gap-2">
                  {(["ambient", "chilled", "frozen"] as const).map((temp) => {
                    const labels: Record<StorageTemp, string> = { ambient: "常溫", chilled: "冷藏", frozen: "冷凍" };
                    return (
                      <button
                        key={temp}
                        type="button"
                        onClick={() => setStorageTemp(storageTemp === temp ? null : temp)}
                        className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors ${
                          storageTemp === temp
                            ? "bg-primary text-white border-primary"
                            : "bg-secondary/60 text-foreground border-border"
                        }`}
                      >
                        {labels[temp]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 保存期限 */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">保存期限</label>
                <input
                  type="text"
                  value={shelfLife}
                  onChange={(e) => setShelfLife(e.target.value)}
                  placeholder="例：2026/12/31 或 30 天"
                  className={inputClass}
                />
              </div>
              {/* 重量 g (UI input in grams; converted to kg before sending to API) */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">重量 g</label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="例：500"
                  min="0"
                  step="1"
                  className={inputClass}
                />
              </div>
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

          {/* ── 收單截止時間 ─────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">收單截止時間</h2>
                <p className="text-xs text-muted-foreground mt-0.5">設定商品停止收單的時間</p>
              </div>
              <button
                type="button"
                onClick={() => setDeadlineEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${deadlineEnabled ? "bg-primary" : "bg-input"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${deadlineEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {deadlineEnabled && (
              <div className="px-5 pb-5 space-y-3 border-t border-border/50 pt-4">
                <div className="grid grid-cols-4 gap-2">
                  {(["tonight", "tomorrow", "dayafter", "custom"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeadlinePreset(preset)}
                      className={`h-[4.5rem] rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors ${
                        deadlinePreset === preset
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-secondary/60 text-foreground"
                      }`}
                    >
                      {preset === "tonight" && (
                        <><span className="text-sm font-semibold">今晚</span><span className="text-[10px] text-muted-foreground">{getDeadlineDate(0)} 23:59</span></>
                      )}
                      {preset === "tomorrow" && (
                        <><span className="text-sm font-semibold">明晚</span><span className="text-[10px] text-muted-foreground">{getDeadlineDate(1)} 23:59</span></>
                      )}
                      {preset === "dayafter" && (
                        <><span className="text-sm font-semibold">後晚</span><span className="text-[10px] text-muted-foreground">{getDeadlineDate(2)} 23:59</span></>
                      )}
                      {preset === "custom" && (
                        <span className="text-sm font-semibold">自訂</span>
                      )}
                    </button>
                  ))}
                </div>
                {deadlinePreset === "custom" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={openDateSheet}
                      className="flex-1 h-12 rounded-xl border border-input bg-white text-sm flex items-center justify-between px-4"
                    >
                      <span className={deadlineDate ? "text-foreground" : "text-muted-foreground"}>{deadlineDate || "選擇日期"}</span>
                      <span className="text-muted-foreground">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={openTimeSheet}
                      className="w-36 h-12 rounded-xl border border-input bg-white text-sm flex items-center justify-between px-4"
                    >
                      <span className="text-foreground">{formatDeadlineTimeDisplay()}</span>
                      <span className="text-muted-foreground">›</span>
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1">
                  收單截止時間已儲存，但尚未套用到訂單截止流程
                </p>
              </div>
            )}
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

          {/* ── 內部備註 ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-sm font-bold text-foreground">內部備註</h2>
              <p className="text-xs text-muted-foreground mt-0.5">僅供賣家查看，不會顯示給買家</p>
            </div>
            <div className="px-5 pb-4">
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="可記錄供應商、進貨狀況、直播備註..."
                rows={4}
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>
          </div>

        </div>
      </form>

      {/* ── 日期選擇 bottom sheet ── */}
      {showDateSheet && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowDateSheet(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white rounded-t-3xl z-50 pb-8">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
              <span className="min-w-[3rem]" />
              <h2 className="text-base font-bold text-foreground">選擇日期</h2>
              <button type="button" onClick={confirmDateSheet} className="text-sm font-semibold text-primary min-w-[3rem] text-right">完成</button>
            </div>
            <div className="px-4 pt-4 pb-2">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => {
                  if (calViewMonth === 0) { setCalViewMonth(11); setCalViewYear((y) => y - 1); }
                  else setCalViewMonth((m) => m - 1);
                }} className="w-10 h-10 flex items-center justify-center text-xl text-foreground rounded-xl hover:bg-secondary">‹</button>
                <span className="text-sm font-semibold text-foreground">{calViewYear} 年 {calViewMonth + 1} 月</span>
                <button type="button" onClick={() => {
                  if (calViewMonth === 11) { setCalViewMonth(0); setCalViewYear((y) => y + 1); }
                  else setCalViewMonth((m) => m + 1);
                }} className="w-10 h-10 flex items-center justify-center text-xl text-foreground rounded-xl hover:bg-secondary">›</button>
              </div>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {["日","一","二","三","四","五","六"].map((d) => (
                  <div key={d} className="h-9 flex items-center justify-center text-xs text-muted-foreground font-medium">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              {(() => {
                const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
                const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
                const cells: (number | null)[] = [];
                for (let i = 0; i < firstDay; i++) cells.push(null);
                for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                return (
                  <div className="grid grid-cols-7 gap-y-1">
                    {cells.map((day, i) => (
                      <div key={i} className="flex items-center justify-center h-10">
                        {day !== null && (
                          <button
                            type="button"
                            onClick={() => setPendingDate({ y: calViewYear, m: calViewMonth, d: day })}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-colors ${
                              pendingDate?.y === calViewYear && pendingDate?.m === calViewMonth && pendingDate?.d === day
                                ? "bg-primary text-white font-bold"
                                : "text-foreground hover:bg-secondary"
                            }`}
                          >
                            {day}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── 時間選擇 bottom sheet ── */}
      {showTimeSheet && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowTimeSheet(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white rounded-t-3xl z-50 pb-8">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
              <span className="min-w-[3rem]" />
              <h2 className="text-base font-bold text-foreground">選擇時間</h2>
              <button type="button" onClick={confirmTimeSheet} className="text-sm font-semibold text-primary min-w-[3rem] text-right">完成</button>
            </div>
            <div className="flex px-6 py-2 gap-1 items-center">
              {/* AM/PM column */}
              <div className="relative flex-shrink-0 w-20 overflow-hidden" style={{ height: 240 }}>
                <div className="pointer-events-none absolute inset-x-0 top-[96px] h-12 bg-secondary/80 rounded-xl z-10" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent z-20" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent z-20" />
                <div
                  ref={ampmColRef}
                  className="overflow-y-auto h-full"
                  style={{ scrollSnapType: "y mandatory" }}
                  onScroll={(e) => {
                    const st = e.currentTarget.scrollTop;
                    if (ampmScrollTimer.current) clearTimeout(ampmScrollTimer.current);
                    ampmScrollTimer.current = setTimeout(() => {
                      const idx = Math.max(0, Math.min(1, Math.round(st / PICKER_ITEM_H)));
                      setPendingAmPm(idx === 0 ? "am" : "pm");
                    }, 200);
                  }}
                >
                  <div style={{ height: 96 }} />
                  {(["am", "pm"] as const).map((v, i) => (
                    <div
                      key={v}
                      onClick={() => { setPendingAmPm(v); ampmColRef.current?.scrollTo({ top: i * PICKER_ITEM_H, behavior: "smooth" }); }}
                      style={{ scrollSnapAlign: "center", height: PICKER_ITEM_H }}
                      className={`flex items-center justify-center cursor-pointer select-none transition-all ${pendingAmPm === v ? "text-foreground text-lg font-bold" : "text-muted-foreground/60 text-base"}`}
                    >
                      {v === "am" ? "上午" : "下午"}
                    </div>
                  ))}
                  <div style={{ height: 96 }} />
                </div>
              </div>
              {/* Hour column */}
              <div className="relative flex-1 overflow-hidden" style={{ height: 240 }}>
                <div className="pointer-events-none absolute inset-x-0 top-[96px] h-12 bg-secondary/80 rounded-xl z-10" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent z-20" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent z-20" />
                <div
                  ref={hourColRef}
                  className="overflow-y-auto h-full"
                  style={{ scrollSnapType: "y mandatory" }}
                  onScroll={(e) => {
                    const st = e.currentTarget.scrollTop;
                    if (hourScrollTimer.current) clearTimeout(hourScrollTimer.current);
                    hourScrollTimer.current = setTimeout(() => {
                      const idx = Math.max(0, Math.min(11, Math.round(st / PICKER_ITEM_H)));
                      setPendingHour(idx + 1);
                    }, 200);
                  }}
                >
                  <div style={{ height: 96 }} />
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map((h, i) => (
                    <div
                      key={h}
                      onClick={() => { setPendingHour(h); hourColRef.current?.scrollTo({ top: i * PICKER_ITEM_H, behavior: "smooth" }); }}
                      style={{ scrollSnapAlign: "center", height: PICKER_ITEM_H }}
                      className={`flex items-center justify-center cursor-pointer select-none transition-all ${pendingHour === h ? "text-foreground text-2xl font-bold" : "text-muted-foreground/60 text-base"}`}
                    >
                      {h}
                    </div>
                  ))}
                  <div style={{ height: 96 }} />
                </div>
              </div>
              {/* Colon separator */}
              <div className="flex-shrink-0 text-2xl font-bold text-foreground self-center">:</div>
              {/* Minute column */}
              <div className="relative flex-1 overflow-hidden" style={{ height: 240 }}>
                <div className="pointer-events-none absolute inset-x-0 top-[96px] h-12 bg-secondary/80 rounded-xl z-10" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent z-20" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent z-20" />
                <div
                  ref={minuteColRef}
                  className="overflow-y-auto h-full"
                  style={{ scrollSnapType: "y mandatory" }}
                  onScroll={(e) => {
                    const st = e.currentTarget.scrollTop;
                    if (minuteScrollTimer.current) clearTimeout(minuteScrollTimer.current);
                    minuteScrollTimer.current = setTimeout(() => {
                      const idx = Math.max(0, Math.min(MINUTE_STEPS.length - 1, Math.round(st / PICKER_ITEM_H)));
                      setPendingMinute(MINUTE_STEPS[idx] ?? 0);
                    }, 200);
                  }}
                >
                  <div style={{ height: 96 }} />
                  {MINUTE_STEPS.map((m, i) => (
                    <div
                      key={m}
                      onClick={() => { setPendingMinute(m); minuteColRef.current?.scrollTo({ top: i * PICKER_ITEM_H, behavior: "smooth" }); }}
                      style={{ scrollSnapAlign: "center", height: PICKER_ITEM_H }}
                      className={`flex items-center justify-center cursor-pointer select-none transition-all ${pendingMinute === m ? "text-foreground text-2xl font-bold" : "text-muted-foreground/60 text-base"}`}
                    >
                      {String(m).padStart(2, "0")}
                    </div>
                  ))}
                  <div style={{ height: 96 }} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const inputClass = "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
