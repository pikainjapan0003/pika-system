import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useUpdateStore, getGetMyStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import {
  DEFAULT_BRAND_PRIMARY_COLOR,
  isValidHex,
  normalizeHex,
  safeHex,
  getLuminance,
  getContrastForeground,
  applyBrandColor,
} from "@/lib/brandColor";

const IS_DEV = import.meta.env.DEV;

const PRESET_COLORS = [
  "#F57572", "#EF4444", "#F97316", "#F59E0B",
  "#10B981", "#06B6D4", "#3B82F6", "#8B5CF6", "#111827",
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: store, isLoading } = useGetMyStore();
  const updateStore = useUpdateStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_PRIMARY_COLOR);
  const [colorError, setColorError] = useState("");

  useEffect(() => {
    if (store) {
      setName(store.name);
      setDescription(store.description ?? "");
      const savedColor = store.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR;
      setBrandColor(savedColor);
      applyBrandColor(savedColor);
    }
  }, [store]);

  const handleBrandColorChange = (value: string) => {
    setBrandColor(value);
    setColorError("");
    const n = normalizeHex(value);
    if (isValidHex(n)) applyBrandColor(n);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setColorError("");
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
    if (!store) return;
    try {
      await updateStore.mutateAsync({
        storeId: store.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          brandPrimaryColor: normalizedColor,
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
  const previewFg = getContrastForeground(previewHex);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">店鋪設定</h1>
      </header>

      <div className="px-5 py-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪名稱
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                網址代碼
              </label>
              <div className="h-12 px-4 rounded-xl border border-input bg-secondary text-muted-foreground flex items-center text-sm">
                {store?.slug}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                網址代碼由系統自動產生，未來將開放修改。
              </p>
            </div>

            <ProductLinkInfo />

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪簡介（選填）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="簡單介紹您的店鋪..."
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>

            {/* 品牌顏色 */}
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <h2 className="text-sm font-bold text-foreground">品牌顏色</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  設定後會影響後台主要按鈕、重點文字與公開頁品牌色。
                </p>
              </div>
              <div className="px-5 pb-5 space-y-4">

                {/* Current color swatch */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl border border-border shrink-0"
                    style={{ backgroundColor: previewHex }}
                  />
                  <span className="text-sm font-mono font-medium text-foreground">{previewHex}</span>
                </div>

                {/* 自由選色 */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">自由選色</div>
                  <label className="flex items-center gap-3 h-12 px-4 rounded-xl border border-input bg-white cursor-pointer hover:bg-secondary/30 transition-colors">
                    <div
                      className="w-7 h-7 rounded-full border border-border shrink-0"
                      style={{ backgroundColor: previewHex }}
                    />
                    <span className="text-sm text-foreground">開啟調色盤</span>
                    <input
                      type="color"
                      className="sr-only"
                      value={previewHex}
                      onChange={(e) => handleBrandColorChange(e.target.value)}
                    />
                  </label>
                </div>

                {/* Preset palette */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">預設色盤</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => handleBrandColorChange(hex)}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0"
                        style={{
                          backgroundColor: hex,
                          boxShadow: previewHex === hex
                            ? "0 0 0 2px white, 0 0 0 4px #111827"
                            : "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      >
                        {previewHex === hex && (
                          <span style={{ color: getContrastForeground(hex), fontSize: 13, fontWeight: 700 }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* HEX input */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">自訂 HEX 色碼</div>
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => handleBrandColorChange(e.target.value)}
                    placeholder="#F57572"
                    maxLength={7}
                    className={inputClass}
                  />
                  {colorError && (
                    <p className="text-xs text-destructive mt-1">{colorError}</p>
                  )}
                </div>

                {/* Preview */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">預覽</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      className="h-9 px-4 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: previewHex, color: previewFg }}
                    >
                      主要按鈕
                    </button>
                    <span className="text-sm font-semibold" style={{ color: previewHex }}>
                      文字連結
                    </span>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ backgroundColor: previewHex + "22", color: previewHex }}
                    >
                      標籤
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={updateStore.isPending}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
            >
              {saved ? "已儲存！" : updateStore.isPending ? "儲存中..." : "儲存設定"}
            </button>
          </form>
        )}
      </div>

      {IS_DEV && <DevHandoffEntry />}

      <BottomNav active="settings" />
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

function ProductLinkInfo() {
  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-blue-900">商品公開連結說明</p>
      <p className="text-xs text-blue-700 leading-relaxed">
        每個商品都有自己的下單連結，格式如下：
      </p>
      <div className="bg-white border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-xs text-foreground font-mono break-all">
          {origin}{basePath}/p/&#123;商品追蹤碼&#125;
        </p>
      </div>
      <p className="text-xs text-blue-700 leading-relaxed">
        你可以在「商品管理」頁面複製每個商品的下單連結，傳給買家下單。
      </p>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
