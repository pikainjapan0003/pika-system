import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMyStore, useUpdateStore, getGetMyStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import {
  DEFAULT_BRAND_PRIMARY_COLOR,
  isValidHex,
  normalizeHex,
  safeHex,
  getContrastForeground,
  applyBrandColor,
} from "@/lib/brandColor";
import {
  type LucideIcon,
  ArrowLeft,
  ReceiptText,
  ScrollText,
  Share2,
  RefreshCcw,
  ListChecks,
  MessageCircle,
  Store,
  PenLine,
  Palette,
  Fingerprint,
  Globe,
  Copy,
  Check,
} from "lucide-react";

const IS_DEV = import.meta.env.DEV;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type LogoUploadStatus = "idle" | "uploading" | "done" | "error";

const PRESET_COLORS = [
  "#F57572", "#EF4444", "#F97316", "#F59E0B",
  "#10B981", "#06B6D4", "#3B82F6", "#8B5CF6", "#111827",
];

type PreviewKey = "receiptTitle" | "receiptFooter" | "socialLinks" | "returnPolicy" | "shoppingNotice" | "orderFooter";

interface PreviewCardConfig {
  title: string;
  items: string[];
  style?: "list" | "pill" | "receipt";
}

interface FeaturePreviewConfig {
  label: string;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  previewCards: PreviewCardConfig[];
}

const PREVIEW_CONFIGS: Record<PreviewKey, FeaturePreviewConfig> = {
  receiptTitle: {
    label: "銷貨單標題",
    desc: "未來可自訂銷貨單上方的品牌標題，讓每張銷貨單都帶有您的品牌識別。",
    icon: ReceiptText,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-400",
    previewCards: [
      {
        title: "預覽：銷貨單頂部",
        items: ["PIKA 代購", "銷 貨 單", "將套用在列印銷貨單頂部"],
        style: "receipt",
      },
    ],
  },
  receiptFooter: {
    label: "頁尾文案",
    desc: "未來可設定銷貨單底部的感謝語與注意事項，讓每張單據都傳遞品牌溫度。",
    icon: ScrollText,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-400",
    previewCards: [
      {
        title: "預覽：銷貨單底部文案",
        items: [
          "感謝您的購買",
          "商品售出後若有問題請私訊客服",
          "這段會出現在銷貨單底部",
        ],
        style: "list",
      },
    ],
  },
  socialLinks: {
    label: "社群連結",
    desc: "未來可加入 Instagram、Threads、Facebook 等社群連結，讓買家一鍵追蹤您的賣場。",
    icon: Share2,
    iconBg: "bg-fuchsia-50",
    iconColor: "text-fuchsia-400",
    previewCards: [
      {
        title: "預覽：社群連結",
        items: ["Instagram", "Threads", "Facebook", "LINE"],
        style: "pill",
      },
    ],
  },
  returnPolicy: {
    label: "退換貨資訊",
    desc: "未來可建立退換貨規則與提醒文字，在訂單頁與銷貨單上自動顯示。",
    icon: RefreshCcw,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-400",
    previewCards: [
      {
        title: "預覽：退換貨規則",
        items: [
          "商品下單後不接受任意取消",
          "瑕疵商品請於 3 日內聯繫",
          "代購商品依海外到貨狀況安排",
        ],
        style: "list",
      },
    ],
  },
  shoppingNotice: {
    label: "購物須知",
    desc: "未來可設定買家下單前注意事項，減少誤解與客服溝通成本。",
    icon: ListChecks,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-400",
    previewCards: [
      {
        title: "預覽：購物須知",
        items: [
          "下單前請確認商品規格",
          "現貨與預購商品請分開下單",
          "不接受急單",
          "匯款後訂單才算成立",
        ],
        style: "list",
      },
    ],
  },
  orderFooter: {
    label: "訂單頁尾",
    desc: "未來可在買家訂單頁底部加入店家補充說明，讓每位買家都看到您想傳達的資訊。",
    icon: MessageCircle,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-400",
    previewCards: [
      {
        title: "預覽：訂單頁尾說明",
        items: [
          "如有問題請私訊客服",
          "取貨前請留意通知",
          "感謝您的耐心等候",
        ],
        style: "list",
      },
    ],
  },
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { data: store, isLoading } = useGetMyStore();
  const updateStore = useUpdateStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_PRIMARY_COLOR);
  const [colorError, setColorError] = useState("");
  const [purchaseExchangeRate, setPurchaseExchangeRate] = useState("");
  const [exchangeRateError, setExchangeRateError] = useState("");
  const storeInitialized = useRef(false);

  const [editingField, setEditingField] = useState<"name" | "description" | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeSection, setActiveSection] = useState<"main" | "storeHub">("main");
  const [activePreviewKey, setActivePreviewKey] = useState<PreviewKey | null>(null);

  // Logo upload state
  const [logoLocalPreview, setLogoLocalPreview] = useState<string | null>(null);
  const [logoUploadStatus, setLogoUploadStatus] = useState<LogoUploadStatus>("idle");
  const [logoUploadError, setLogoUploadError] = useState("");
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const logoPreviewObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewObjectUrlRef.current) URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (store && !storeInitialized.current) {
      storeInitialized.current = true;
      setName(store.name);
      setDescription(store.description ?? "");
      setLogoUrl(store.logoUrl ?? "");
      const savedColor = store.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR;
      setBrandColor(savedColor);
      applyBrandColor(savedColor);
      setPurchaseExchangeRate(store.purchaseExchangeRate != null ? String(store.purchaseExchangeRate) : "");
    }
  }, [store]);

  const handleBrandColorChange = (value: string) => {
    setBrandColor(value);
    setColorError("");
    const n = normalizeHex(value);
    if (isValidHex(n)) applyBrandColor(n);
  };

  const clearLogoLocalPreview = () => {
    if (logoPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
      logoPreviewObjectUrlRef.current = null;
    }
    setLogoLocalPreview(null);
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLogoUploadError("");

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setLogoUploadStatus("error");
      setLogoUploadError("僅支援 JPG、PNG、WebP 圖片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLogoUploadStatus("error");
      setLogoUploadError("圖片大小不可超過 5MB");
      return;
    }

    if (logoPreviewObjectUrlRef.current) URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
    const preview = URL.createObjectURL(file);
    logoPreviewObjectUrlRef.current = preview;
    setLogoLocalPreview(preview);
    setLogoUploadStatus("uploading");

    if (!store?.id) {
      clearLogoLocalPreview();
      setLogoUploadStatus("error");
      setLogoUploadError("無法上傳：商店尚未載入，請稍後再試");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = await getToken();
      const res = await fetch(`/api/stores/${store.id}/products/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 401 || res.status === 403) {
        clearLogoLocalPreview();
        setLogoUploadStatus("error");
        setLogoUploadError("沒有權限上傳圖片，請重新登入");
        return;
      }
      if (res.status === 429) {
        clearLogoLocalPreview();
        setLogoUploadStatus("error");
        setLogoUploadError("上傳太頻繁，請稍後再試");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        clearLogoLocalPreview();
        setLogoUploadStatus("error");
        setLogoUploadError(body.error ?? "圖片上傳失敗，請稍後再試");
        return;
      }

      const data = await res.json() as { imageUrl?: string };
      if (!data.imageUrl) {
        clearLogoLocalPreview();
        setLogoUploadStatus("error");
        setLogoUploadError("圖片上傳失敗，請稍後再試");
        return;
      }

      setLogoUrl(data.imageUrl);
      setLogoUploadStatus("done");
    } catch {
      clearLogoLocalPreview();
      setLogoUploadStatus("error");
      setLogoUploadError("圖片上傳失敗，請稍後再試");
    }
  };

  const handleRemoveLogo = () => {
    clearLogoLocalPreview();
    setLogoUrl("");
    setLogoUploadStatus("idle");
    setLogoUploadError("");
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
  };

  const handleSave = async () => {
    setError("");
    setColorError("");
    setExchangeRateError("");
    setSaved(false);
    if (!name.trim()) {
      setError("店鋪名稱不能空白");
      return;
    }
    const normalizedColor = normalizeHex(brandColor);
    if (!isValidHex(normalizedColor)) {
      setColorError("請輸入有效的 6 位 HEX 色碼，例如 #F57572");
      return;
    }
    const trimmedRate = purchaseExchangeRate.trim();
    const exchangeRateNum = trimmedRate ? parseFloat(trimmedRate) : null;
    if (trimmedRate && (exchangeRateNum === null || isNaN(exchangeRateNum) || exchangeRateNum < 0)) {
      setExchangeRateError("請輸入有效的匯率（不可為負數）");
      return;
    }
    if (!store) return;
    try {
      await updateStore.mutateAsync({
        storeId: store.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          logoUrl: logoUrl.trim(),
          brandPrimaryColor: normalizedColor,
          purchaseExchangeRate: exchangeRateNum,
        },
      });
      applyBrandColor(normalizedColor);
      qc.invalidateQueries({ queryKey: getGetMyStoreQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.data?.error ?? "儲存失敗，請稍後再試");
    }
  };

  const previewHex = safeHex(brandColor);
  const displayLogoPreview = logoLocalPreview ?? (logoUrl.trim() || null);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">

      {/* Hidden file input — always mounted so ref stays stable */}
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleLogoFileChange}
      />

      {/* ── MAIN settings page ─────────────────── */}
      {activeSection === "main" && (
        <>
          <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
            <h1 className="text-lg font-bold text-foreground">設定</h1>
          </header>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="px-5 pt-5 space-y-3">
              <HubCard
                icon="🏪"
                title="店家設定"
                subtitle="店家資料、賣場連結、銷貨單設定與賣場資訊"
                onClick={() => setActiveSection("storeHub")}
              />
            </div>
          )}

          <div className="pt-4">
            <TripsEntry />
            <AgentSettingsEntry />
            {IS_DEV && <DevHandoffEntry />}
          </div>
        </>
      )}

      {/* ── STORE HUB — one-page expanded ──── */}
      {activeSection === "storeHub" && (
        <>
          {/* Header */}
          <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10 flex items-center">
            <button
              type="button"
              onClick={() => setActiveSection("main")}
              className="text-primary text-sm font-medium shrink-0 w-16"
            >
              ‹ 返回
            </button>
            <h1 className="text-base font-bold text-foreground flex-1 text-center">店家設定</h1>
            <div className="flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={handleSave}
                disabled={updateStore.isPending || logoUploadStatus === "uploading"}
                className="h-8 px-4 bg-primary text-white text-sm font-semibold rounded-full disabled:opacity-60 whitespace-nowrap"
              >
                {saved ? "已儲存！" : updateStore.isPending ? "儲存中..." : "儲存"}
              </button>
            </div>
          </header>

          <div className="px-4 pt-5 pb-8 space-y-6">

            {/* ════════════════ 店家資料 ════════════════ */}
            <div>
              <p className="text-sm font-bold text-foreground px-1 mb-3">店家資料</p>

              {/* Logo 主卡 */}
              <div className="bg-white rounded-2xl border border-border overflow-hidden mb-3">
                <div className="flex items-start gap-4 px-5 py-5">
                  {/* Large logo preview */}
                  <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 border border-border">
                    {displayLogoPreview ? (
                      <div className="relative w-full h-full">
                        <img
                          src={displayLogoPreview}
                          alt="店鋪 Logo"
                          className="w-full h-full object-contain bg-secondary"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                        {logoUploadStatus === "uploading" && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-3xl font-bold text-white"
                        style={{ backgroundColor: previewHex }}
                      >
                        {name.trim().charAt(0).toUpperCase() || "店"}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex-1 flex flex-col gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      disabled={logoUploadStatus === "uploading"}
                      className="h-11 px-4 rounded-xl bg-primary/10 text-primary text-sm font-semibold disabled:opacity-50"
                    >
                      {displayLogoPreview ? "更換 Logo" : "上傳 Logo"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={logoUploadStatus === "uploading" || !displayLogoPreview}
                      className="h-11 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold disabled:opacity-40"
                    >
                      移除 Logo
                    </button>
                    {logoUploadStatus === "done" && (
                      <p className="text-xs text-green-600 font-medium text-center">✓ Logo 已上傳</p>
                    )}
                    {logoUploadStatus === "error" && logoUploadError && (
                      <p className="text-xs text-destructive text-center">{logoUploadError}</p>
                    )}
                  </div>
                </div>
                <div className="px-5 pb-4 text-xs text-muted-foreground">
                  會顯示於銷貨單與未來賣場頁
                </div>
              </div>

              {/* 店家資訊列表卡 */}
              <div className="bg-white rounded-2xl border border-border overflow-hidden">

                {/* 店名 / 抬頭 */}
                <button
                  type="button"
                  onClick={() => setEditingField(editingField === "name" ? null : "name")}
                  className="w-full group flex items-center px-5 py-4 text-left hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 group-hover:-translate-y-0.5 transition-transform duration-300">
                    <Store size={17} className="text-primary animate-cs-pulse-soft" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">店名 / 抬頭</div>
                    <div className="text-sm font-semibold text-foreground truncate mt-0.5">{name || "未設定"}</div>
                  </div>
                  <span className="text-muted-foreground text-sm ml-2 shrink-0">{editingField === "name" ? "∨" : "›"}</span>
                </button>
                {editingField === "name" && (
                  <div className="px-5 pb-4">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      className={inputClass}
                    />
                  </div>
                )}

                <div className="border-t border-border/40 mx-5" />

                {/* 店鋪簡介 */}
                <button
                  type="button"
                  onClick={() => setEditingField(editingField === "description" ? null : "description")}
                  className="w-full group flex items-center px-5 py-4 text-left hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 group-hover:-translate-y-0.5 transition-transform duration-300">
                    <PenLine size={17} className="text-primary transition-transform duration-300 group-hover:rotate-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">店鋪簡介</div>
                    <div className="text-sm text-foreground truncate mt-0.5">
                      {description.trim() || <span className="text-muted-foreground">選填</span>}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-sm ml-2 shrink-0">{editingField === "description" ? "∨" : "›"}</span>
                </button>
                {editingField === "description" && (
                  <div className="px-5 pb-4">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="簡單介紹您的店鋪..."
                      className={`${inputClass} h-auto resize-none py-3`}
                    />
                  </div>
                )}

                <div className="border-t border-border/40 mx-5" />

                {/* 品牌顏色 */}
                <button
                  type="button"
                  onClick={() => setShowColorPicker((v) => !v)}
                  className="w-full group flex items-center px-5 py-4 text-left hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 group-hover:-translate-y-0.5 transition-transform duration-300">
                    <Palette size={17} className="text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">品牌顏色</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-4 h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: previewHex }} />
                      <span className="text-sm font-mono font-medium text-foreground">{previewHex}</span>
                    </div>
                  </div>
                  <span className="text-xs text-primary font-medium ml-2 shrink-0">
                    {showColorPicker ? "收合" : "編輯品牌色"}
                  </span>
                </button>
                {showColorPicker && (
                  <div className="px-5 pb-5 space-y-3">
                    <ColorPicker hex={brandColor} onChange={handleBrandColorChange} />
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => handleBrandColorChange(hex)}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0"
                          style={{
                            backgroundColor: hex,
                            boxShadow: previewHex === hex
                              ? "0 0 0 2px white, 0 0 0 4px #111827"
                              : "0 1px 3px rgba(0,0,0,0.2)",
                          }}
                        >
                          {previewHex === hex && (
                            <span style={{ color: getContrastForeground(hex), fontSize: 12, fontWeight: 700 }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => handleBrandColorChange(e.target.value)}
                      placeholder="#F57572"
                      maxLength={7}
                      className={inputClass}
                    />
                    {colorError && <p className="text-xs text-destructive">{colorError}</p>}
                  </div>
                )}

                <div className="border-t border-border/40 mx-5" />

                {/* 進貨匯率 */}
                <div className="flex items-center px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4">
                    <RefreshCcw size={17} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium mb-1.5">
                      店鋪進貨匯率（日圓 → 台幣，可留空）
                    </div>
                    <input
                      type="number"
                      value={purchaseExchangeRate}
                      onChange={(e) => setPurchaseExchangeRate(e.target.value)}
                      placeholder="例：0.22"
                      min="0"
                      step="0.0001"
                      className={inputClass}
                    />
                    {exchangeRateError && <p className="text-xs text-destructive mt-1">{exchangeRateError}</p>}
                  </div>
                </div>

                <div className="border-t border-border/40 mx-5" />

                {/* 網址代碼 */}
                <div className="group flex items-center px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 transition-transform duration-300">
                    <Fingerprint size={17} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">網址代碼</div>
                    <div className="text-sm font-mono font-medium text-foreground mt-0.5">{store?.slug ?? "—"}</div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">系統產生</span>
                </div>

              </div>
            </div>

            {/* ════════════════ 賣場連結 ════════════════ */}
            <div>
              <p className="text-sm font-bold text-foreground px-1 mb-3">賣場連結</p>
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <ProfileLinkRow />
                <div className="border-t border-border/40 mx-5" />
                <div className="px-5 py-3 text-xs text-muted-foreground leading-relaxed">
                  商品公開連結格式如上。將追蹤碼欄位替換為實際單號後分享給顧客，即可讓顧客自行查詢訂單狀態。
                </div>
              </div>
            </div>

            {/* ════════════════ 銷貨單設定 ════════════════ */}
            <div>
              <p className="text-sm font-bold text-foreground px-1 mb-3">銷貨單設定</p>
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <ComingSoonRow
                  icon={ReceiptText}
                  label="銷貨單標題"
                  desc="可調整銷貨單上的品牌標題"
                  iconBg="bg-orange-50"
                  iconColor="text-orange-400"
                  animClass="animate-cs-float"
                  onClick={() => setActivePreviewKey("receiptTitle")}
                />
                <div className="border-t border-border/40 mx-5" />
                <ComingSoonRow
                  icon={ScrollText}
                  label="頁尾文案"
                  desc="可設定感謝語、注意事項與品牌訊息"
                  iconBg="bg-sky-50"
                  iconColor="text-sky-400"
                  animClass="animate-cs-float"
                  onClick={() => setActivePreviewKey("receiptFooter")}
                />
              </div>
            </div>

            {/* ════════════════ 賣場資訊 ════════════════ */}
            <div>
              <p className="text-sm font-bold text-foreground px-1 mb-3">賣場資訊</p>
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <ComingSoonRow
                  icon={Share2}
                  label="社群連結"
                  desc="可加入 Instagram、Threads、Facebook 等連結"
                  iconBg="bg-fuchsia-50"
                  iconColor="text-fuchsia-400"
                  animClass="animate-cs-float"
                  onClick={() => setActivePreviewKey("socialLinks")}
                />
                <div className="border-t border-border/40 mx-5" />
                <ComingSoonRow
                  icon={RefreshCcw}
                  label="退換貨資訊"
                  desc="可建立退換貨規則與提醒文字"
                  iconBg="bg-teal-50"
                  iconColor="text-teal-400"
                  animClass="animate-cs-spin-gentle"
                  onClick={() => setActivePreviewKey("returnPolicy")}
                />
                <div className="border-t border-border/40 mx-5" />
                <ComingSoonRow
                  icon={ListChecks}
                  label="購物須知"
                  desc="可設定下單前注意事項"
                  iconBg="bg-amber-50"
                  iconColor="text-amber-400"
                  animClass="animate-cs-float"
                  onClick={() => setActivePreviewKey("shoppingNotice")}
                />
                <div className="border-t border-border/40 mx-5" />
                <ComingSoonRow
                  icon={MessageCircle}
                  label="訂單頁尾"
                  desc="可在買家訂單頁加入店家補充說明"
                  iconBg="bg-emerald-50"
                  iconColor="text-emerald-400"
                  animClass="animate-cs-pulse-soft"
                  onClick={() => setActivePreviewKey("orderFooter")}
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

          </div>
        </>
      )}

      {activePreviewKey && (
        <SettingsPreviewPanel
          previewKey={activePreviewKey}
          onClose={() => setActivePreviewKey(null)}
        />
      )}
      <BottomNav active="settings" />
    </div>
  );
}

function TripsEntry() {
  const [, setLocation] = useLocation();
  return (
    <div className="px-5 pb-3">
      <button
        type="button"
        onClick={() => setLocation("/trips")}
        className="w-full bg-white border border-border rounded-2xl px-4 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-lg flex-shrink-0">
            🧳
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">行程與路線管理</p>
            <p className="text-xs text-muted-foreground">用於商品的交通成本分攤設定</p>
          </div>
        </div>
        <span className="text-muted-foreground text-sm">›</span>
      </button>
    </div>
  );
}

function AgentSettingsEntry() {
  const [, setLocation] = useLocation();
  return (
    <div className="px-5 pb-3">
      <button
        type="button"
        onClick={() => setLocation("/settings/agent")}
        className="w-full bg-white border border-border rounded-2xl px-4 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-lg flex-shrink-0">
            🤖
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">AI 代查設定</p>
            <p className="text-xs text-muted-foreground">Seller Agent / 物流自動查詢設定</p>
          </div>
        </div>
        <span className="text-muted-foreground text-sm">›</span>
      </button>
    </div>
  );
}

function DevHandoffEntry() {
  const [, setLocation] = useLocation();
  return (
    <div className="px-5 pb-3">
      <button
        type="button"
        onClick={() => setLocation("/dev/handoff")}
        className="w-full bg-white border border-border rounded-2xl px-4 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center text-lg flex-shrink-0">
            📋
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">研發中繼剪貼板</p>
            <p className="text-xs text-muted-foreground">Claude Handoff / Codex Copy Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">
            DEV
          </span>
          <span className="text-muted-foreground text-sm">›</span>
        </div>
      </button>
    </div>
  );
}

function HubCard({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-white border border-border rounded-2xl px-4 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}
        <span className="text-muted-foreground text-sm">›</span>
      </div>
    </button>
  );
}

function ProfileLinkRow() {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const linkText = `${origin}${basePath}/p/{商品追蹤碼}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(linkText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="group flex items-center px-5 py-4">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 group-hover:-translate-y-0.5 transition-transform duration-300">
        <Globe size={17} className="text-primary animate-cs-float" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground font-medium">個人賣場連結</div>
        <div className="text-xs font-mono text-foreground truncate mt-0.5">{linkText}</div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-2 w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0 transition-all duration-200 hover:bg-secondary/80 hover:scale-105"
        title="複製連結"
      >
        {copied ? (
          <Check size={15} className="text-green-500" />
        ) : (
          <Copy size={15} className="text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function PreviewCard({ title, items, style = "list" }: PreviewCardConfig & { style?: "list" | "pill" | "receipt" }) {
  if (style === "receipt") {
    return (
      <div className="rounded-2xl border border-border/60 bg-white overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
        <div className="px-4 py-5 text-center border-t border-border/40">
          <p className="text-base font-bold text-foreground">{items[0]}</p>
          <p className="text-sm text-muted-foreground mt-1 tracking-widest">{items[1]}</p>
          {items[2] && (
            <p className="text-[10px] text-muted-foreground/60 mt-3">{items[2]}</p>
          )}
        </div>
      </div>
    );
  }
  if (style === "pill") {
    return (
      <div className="rounded-2xl border border-border/60 bg-white overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
        <div className="px-4 py-3 border-t border-border/40 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <span key={i} className="text-xs bg-fuchsia-50 text-fuchsia-500 border border-fuchsia-100 px-3 py-1 rounded-full font-medium">
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-white overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
      </div>
      <div className="border-t border-border/40">
        {items.map((item, i) => (
          <div key={i} className={`flex items-start gap-2.5 px-4 py-2.5 ${i < items.length - 1 ? "border-b border-border/30" : ""}`}>
            <span className="text-muted-foreground/50 mt-0.5 text-xs shrink-0">•</span>
            <span className="text-sm text-foreground/80 leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPreviewPanel({
  previewKey,
  onClose,
}: {
  previewKey: PreviewKey;
  onClose: () => void;
}) {
  const config = PREVIEW_CONFIGS[previewKey];
  const Icon = config.icon;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center">
        <div
          className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col"
          style={{ maxHeight: "84vh" }}
        >
          <div className="flex justify-center pt-3 pb-0.5">
            <div className="w-8 h-1 rounded-full bg-border/60" />
          </div>
          <div className="flex items-center gap-3 px-5 pt-3 pb-3 border-b border-border/40 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0 hover:bg-muted transition-colors active:scale-95"
            >
              <ArrowLeft size={16} className="text-foreground/70" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-full ${config.iconBg} flex items-center justify-center shrink-0`}>
                <Icon size={14} className={config.iconColor} />
              </div>
              <span className="text-sm font-semibold text-foreground truncate">{config.label}</span>
            </div>
            <span className="text-[10px] font-medium bg-indigo-50 text-indigo-400 px-2.5 py-1 rounded-full border border-indigo-100 whitespace-nowrap shrink-0">
              設計預覽
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">{config.desc}</p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 flex items-start gap-2">
              <span className="text-amber-400 text-sm mt-0.5 shrink-0">⚠</span>
              <p className="text-xs text-amber-600 leading-relaxed">尚未串接正式儲存，此為設計預覽</p>
            </div>
            {config.previewCards.map((card, i) => (
              <PreviewCard key={i} {...card} />
            ))}
          </div>
          <div className="px-5 pt-3 pb-20 border-t border-border/40 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ComingSoonRow({
  icon: Icon,
  label,
  desc,
  iconBg,
  iconColor,
  animClass,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  animClass: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      aria-disabled={clickable ? undefined : true}
      onClick={onClick}
      className={`group flex items-center px-5 py-4 select-none transition-colors duration-200 ${
        clickable
          ? "cursor-pointer hover:bg-muted/40 active:bg-muted/60"
          : "cursor-default hover:bg-muted/40"
      }`}
    >
      <div className={`w-11 h-11 rounded-full ${iconBg} flex items-center justify-center shrink-0 mr-4 group-hover:scale-105 group-hover:-translate-y-0.5 transition-transform duration-300`}>
        <Icon size={18} className={`${iconColor} ${animClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
      </div>
      {clickable ? (
        <span className="text-[10px] font-medium bg-indigo-50 text-indigo-400 px-2.5 py-1 rounded-full shrink-0 ml-3 border border-indigo-100 whitespace-nowrap">
          可預覽
        </span>
      ) : (
        <span className="text-[10px] font-medium bg-rose-50 text-rose-400 px-2.5 py-1 rounded-full shrink-0 ml-3 border border-rose-100 whitespace-nowrap">
          即將支援
        </span>
      )}
    </div>
  );
}

// ---- Color picker math helpers ----

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hi = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  if (hi === 0)      { r = v; g = t; b = p; }
  else if (hi === 1) { r = q; g = v; b = p; }
  else if (hi === 2) { r = p; g = v; b = t; }
  else if (hi === 3) { r = p; g = q; b = v; }
  else if (hi === 4) { r = t; g = p; b = v; }
  else               { r = v; g = p; b = q; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { h: 0, s: 0, v: 1 };
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h) % 360, s, v: max };
}

// ---- ColorPicker component ----

interface ColorPickerProps {
  hex: string;
  onChange: (hex: string) => void;
}

function ColorPicker({ hex, onChange }: ColorPickerProps) {
  const interacting = useRef(false);
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>(
    () => hexToHsv(safeHex(hex))
  );
  const hsvRef = useRef(hsv);

  useEffect(() => {
    if (interacting.current) return;
    const next = hexToHsv(safeHex(hex));
    setHsv(next);
    hsvRef.current = next;
  }, [hex]);

  const emit = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    hsvRef.current = next;
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  // Saturation / Value panel
  const calcPanel = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    emit({ ...hsvRef.current, s, v });
  };
  const onPanelDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    interacting.current = true;
    calcPanel(e);
  };
  const onPanelMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interacting.current) return;
    calcPanel(e);
  };
  const onPanelUp = () => { interacting.current = false; };

  // Hue bar
  const calcHue = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = Math.round(x * 360) % 360;
    emit({ ...hsvRef.current, h });
  };
  const onHueDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    interacting.current = true;
    calcHue(e);
  };
  const onHueMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interacting.current) return;
    calcHue(e);
  };
  const onHueUp = () => { interacting.current = false; };

  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <div className="space-y-2.5">
      {/* Saturation / Value panel */}
      <div
        onPointerDown={onPanelDown}
        onPointerMove={onPanelMove}
        onPointerUp={onPanelUp}
        onPointerCancel={onPanelUp}
        role="slider"
        aria-label="選擇飽和度與明度"
        className="relative w-full rounded-xl overflow-hidden select-none touch-none"
        style={{ height: 140, cursor: "crosshair" }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: pureHueHex }} />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-white"
            style={{ boxShadow: "0 0 0 1.5px rgba(0,0,0,0.5)" }}
          />
        </div>
      </div>

      {/* Hue bar */}
      <div
        onPointerDown={onHueDown}
        onPointerMove={onHueMove}
        onPointerUp={onHueUp}
        onPointerCancel={onHueUp}
        role="slider"
        aria-label="選擇色相"
        className="relative w-full rounded-full select-none touch-none"
        style={{
          height: 16,
          cursor: "pointer",
          background:
            "linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)",
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="w-5 h-5 rounded-full border-2 border-white"
            style={{
              backgroundColor: `hsl(${hsv.h},100%,50%)`,
              boxShadow: "0 0 0 1.5px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      </div>
    </div>
  );
}


const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
